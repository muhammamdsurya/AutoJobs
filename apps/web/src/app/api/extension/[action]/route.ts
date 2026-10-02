// API for the AutoJobs browser extension (bearer token). The extension is a thin executor: portal patterns,
// answers, gap/cap rules and result handling all live on the server.
import { ADAPTERS } from '@/lib/adapters';
import { CHALLENGE_TEXT, CHALLENGE_TITLE } from '@/lib/adapters/http';
import { makeResolver, NeedsAction, planFields, type Field } from '@/lib/apply-plan';
import { loadFile, sha256 } from '@autojobs/shared/crypto';
import { audit, sql } from '@autojobs/shared/db';
import { CORS, extensionUserId, json, notAllowed, pairingThrottled, redeemPairingCode } from '@/lib/extension';
import { AUTO_APPLY, isPortal, PORTAL_LABEL, PORTALS, type Portal } from '@autojobs/shared/portals';
import { getBank, getExtras, getProfile } from '@/lib/profile';
import { claimNextForUser, finishAttempt, releaseAbandoned, type AttemptApp, type AttemptResult } from '@/lib/queue';
import { listening, notify, waitFor } from '@/lib/notify';
import { getSettings } from '@autojobs/shared/settings';

export const dynamic = 'force-dynamic';

const CHALLENGE = { title: CHALLENGE_TITLE, text: CHALLENGE_TEXT };
const STATUSES = ['connected', 'expired', 'needs_verification'] as const;
const RESULT_KINDS = ['submitted', 'dry_run', 'already_applied', 'skipped', 'needs_action', 'failed', 'postponed'];

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function status(userId: string) {
  const [u] = await sql<{ email: string }[]>`select email from users where id = ${userId}`;
  const settings = await getSettings();
  const accounts = await sql<{ portal: Portal; status: string }[]>`select portal, status from portal_accounts where user_id = ${userId}`;
  const [{ queued }] = await sql<{ queued: number }[]>`select count(*)::int as queued from applications a join campaigns c on c.id = a.campaign_id
    where a.user_id = ${userId} and a.status = 'queued' and c.status = 'running'`;
  return {
    email: u?.email,
    queued,
    challenge: CHALLENGE,
    portals: PORTALS.filter((p) => AUTO_APPLY[p]).map((p) => ({
      portal: p,
      label: PORTAL_LABEL[p],
      enabled: settings.portalEnabled[p],
      status: accounts.find((a) => a.portal === p)?.status ?? 'unknown',
      signInUrl: ADAPTERS[p].signInUrl,
      checkUrl: ADAPTERS[p].checkUrl,
      loginUrl: ADAPTERS[p].apply?.loginUrl ?? '',
    })),
  };
}

// The application must be this user's, currently being applied to, by this very browser (not another paired one).
async function leasedApp(userId: string, id: unknown, browser: string) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [a] = await sql<AttemptApp[]>`select id, user_id, campaign_id, portal, attempt_count, dry_run from applications
    where id = ${id} and user_id = ${userId} and status = 'in_progress' and (leased_by = ${browser} or leased_by is null)`;
  return a ?? null;
}

// Reads a JSON body up to `max` bytes, also when the client streams it without Content-Length: no request can make
// the server buffer more than that. null = too large.
async function readJson(req: Request, max: number): Promise<Record<string, any> | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  for (let r = await reader?.read(); r && !r.done; r = await reader!.read()) {
    size += r.value.length;
    if (size > max) {
      await reader!.cancel();
      return null;
    }
    chunks.push(r.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const userId = await extensionUserId(req);
  if (!userId || userId === 'suspended') return notAllowed(userId);
  if (action === 'status') return json(await status(userId));
  return json({ error: 'Tidak ditemukan' }, 404);
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const tooLarge = () => json({ error: 'Terlalu besar' }, 413);

  if (action === 'pair') {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    if (pairingThrottled(ip)) return json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' }, 429);
    const body = await readJson(req, 10_000); // no token yet: a code and nothing more
    if (!body) return tooLarge();
    const paired = await redeemPairingCode(String(body.code ?? ''), ip);
    if (!paired) return json({ error: 'Kode pairing salah atau sudah kedaluwarsa. Buat kode baru di Koneksi Portal.' }, 400);
    return json(paired);
  }

  // The token first, then the body (up to an HTML snapshot and a screenshot).
  const userId = await extensionUserId(req);
  if (!userId || userId === 'suspended') return notAllowed(userId);
  const body = await readJson(req, 15_000_000);
  if (!body) return tooLarge();
  const browser = sha256(req.headers.get('authorization')?.slice('Bearer '.length) ?? ''); // this paired browser
  try {
    switch (action) {
      // Sent once when the extension starts: nothing can be running in it yet.
      case 'restart':
        return json({ released: await releaseAbandoned(userId, browser) });

      // The extension checked whether the user is signed in to each portal in this browser (PC-02).
      case 'status': {
        for (const [portal, s] of Object.entries(body.portals ?? {})) {
          if (!isPortal(portal) || !AUTO_APPLY[portal] || !STATUSES.includes(s as never)) continue;
          await sql`insert into portal_accounts (user_id, portal, status, last_verified_at) values (${userId}, ${portal}, ${s as string}, now())
            on conflict (user_id, portal) do update set status = excluded.status, last_verified_at = now()`;
        }
        return json(await status(userId));
      }

      case 'work': {
        // Held after Chrome started, until the user says go: shown on the campaign page.
        await sql`update extension_tokens set held = ${body.held === true} where token_hash = ${browser}`;
        // 1) pages the worker needs loaded in this browser (Glints search)
        const [f] = await sql<{ id: string; url: string }[]>`update browser_fetches set status = 'taken'
          where id = (select id from browser_fetches where user_id = ${userId} and status = 'pending' order by id limit 1 for update skip locked)
          returning id, url`;
        if (f) return json({ type: 'fetch', id: f.id, url: f.url, challenge: CHALLENGE });
        // 2) the next application whose gap and daily cap allow it (not while the AutoJobs window is covered)
        const job = body.canApply === false ? null : await claimNextForUser(userId, await getSettings());
        if (!job) {
          // How many applications wait on this browser, and when the next one is due (so the extension can ask again then).
          const [q] = await sql<{ pending: number; nextIn: number | null }[]>`
            select count(*)::int as pending,
              extract(epoch from min(greatest(a.scheduled_at, coalesce(pa.next_apply_at, now())) - now()))::float8 as next_in
            from applications a join campaigns c on c.id = a.campaign_id
              join portal_accounts pa on pa.user_id = a.user_id and pa.portal = a.portal
            where a.user_id = ${userId} and a.status = 'queued' and c.status = 'running' and pa.status = 'connected'`;
          // A search in progress hands this browser its pages one at a time: ask again in a second instead of
          // sleeping until the 30 s alarm (that wait used to dominate Glints searches).
          const [{ searching }] = await sql<{ searching: boolean }[]>`
            select exists (select 1 from campaigns where user_id = ${userId} and status = 'scraping') as searching`;
          if (searching) {
            // Hold this request until the worker queues the next page (or 20 s pass), instead of the extension
            // asking again every second.
            await listening();
            const next = waitFor(`fetch-new:${userId}`, 20_000);
            const [{ pending }] = await sql<{ pending: boolean }[]>`
              select exists (select 1 from browser_fetches where user_id = ${userId} and status = 'pending') as pending`;
            if (pending || (await next)) return json({ type: 'again' });
            return json({ type: 'idle', pending: q.pending, retryInSec: 1, searching: true });
          }
          return json({ type: 'idle', pending: q.pending, retryInSec: q.nextIn != null && q.nextIn > 1 ? Math.ceil(q.nextIn) : null });
        }
        await sql`update applications set leased_by = ${browser} where id = ${job.appId}`;
        const [a] = await sql<(AttemptApp & { url: string; title: string; company: string; cvId: string | null })[]>`
          select a.id, a.user_id, a.campaign_id, a.portal, a.attempt_count, a.dry_run, a.cv_id, l.url, l.title, l.company
          from applications a join job_listings l on l.id = a.listing_id where a.id = ${job.appId}`;
        const [cv] = a.cvId ? await sql<{ fileKey: string; fileName: string; mime: string }[]>`select file_key, file_name, mime from cv_documents where id = ${a.cvId}` : [];
        const spec = ADAPTERS[a.portal].apply;
        if (!spec) {
          await finishAttempt(a, { kind: 'skipped', reason: 'Auto-apply belum tersedia untuk portal ini' });
          return json({ type: 'again' });
        }
        const extras = await getExtras(userId, a.portal);
        // "CV di portal" (Profil), or no AutoJobs CV at all: the CV saved on the portal is used; the AutoJobs CV, if
        // there is one, is only the fallback when the portal lists none.
        const cvFromPortal = !cv || extras.cv_source === 'portal';
        return json({
          type: 'apply',
          applicationId: a.id,
          portal: a.portal,
          portalLabel: PORTAL_LABEL[a.portal],
          url: a.url,
          title: a.title,
          company: a.company,
          dryRun: a.dryRun,
          spec,
          challenge: CHALLENGE,
          hasCoverLetter: !!extras.cover_letter,
          cvFromPortal,
          cv: cv ? { name: cv.fileName, mime: cv.mime, base64: (await loadFile(cv.fileKey)).toString('base64') } : null,
        });
      }

      case 'fetch-result': {
        await sql`update browser_fetches set status = ${body.ok ? 'done' : 'failed'}, body = ${body.ok ? String(body.body ?? '') : null},
          error = ${body.ok ? null : String(body.error ?? 'Gagal memuat halaman').slice(0, 500)}
          where id = ${String(body.id)} and user_id = ${userId} and status = 'taken'`;
        await notify(`fetch-done:${String(body.id)}`); // the worker waiting for this page carries on at once
        if (body.challengePortal && isPortal(body.challengePortal))
          await sql`update portal_accounts set status = 'needs_verification' where user_id = ${userId} and portal = ${body.challengePortal}`;
        return json({ ok: true });
      }

      // Per form step: the extension sends the fields it found, the server decides the answers.
      case 'plan': {
        const app = await leasedApp(userId, body.applicationId, browser);
        if (!app) return json({ error: 'Lamaran ini tidak sedang diproses.' }, 409);
        const profile = await getProfile(userId);
        if (!profile) return json({ needsAction: 'Profil belum diisi.', questions: [] });
        const resolve = makeResolver(profile, await getExtras(userId, app.portal), await getBank(userId), app.portal);
        try {
          return json(planFields(((body.fields ?? []) as Field[]).slice(0, 300), resolve)); // a form never has more fields
        } catch (e) {
          if (e instanceof NeedsAction) return json({ needsAction: e.message, questions: e.questions });
          throw e;
        }
      }

      case 'apply-result': {
        const app = await leasedApp(userId, body.applicationId, browser);
        if (!app) return json({ error: 'Lamaran ini tidak sedang diproses.' }, 409);
        const r = body.result as AttemptResult;
        if (!r || !RESULT_KINDS.includes(r.kind)) return json({ error: 'Hasil tidak valid.' }, 400);
        // A dry run is never sent: it can't come back as sent (and count against the daily cap or the reports).
        if (app.dryRun && r.kind === 'submitted') return json({ error: 'Uji coba tidak mengirim lamaran.' }, 400);
        if (r.kind === 'postponed') {
          await finishAttempt(app, r);
          return json({ ok: true });
        }
        // Evidence kept 90 days: a PNG screenshot up to 5 MB and the page HTML up to 2 MB, nothing else.
        const shot = typeof body.screenshot === 'string' ? Buffer.from(body.screenshot, 'base64') : undefined;
        await finishAttempt(app, r, {
          html: typeof body.html === 'string' ? body.html.slice(0, 2_000_000) : undefined,
          screenshot: shot && shot.length <= 5_000_000 && shot.subarray(0, 8).equals(PNG) ? shot : undefined,
        });
        return json({ ok: true });
      }

      case 'unpair': {
        const token = req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? '';
        await sql`delete from extension_tokens where token_hash = ${sha256(token)}`;
        await audit(userId, 'extension_unpaired');
        return json({ ok: true });
      }
    }
    return json({ error: 'Tidak ditemukan' }, 404);
  } catch (e) {
    console.error('[extension api]', action, e); // details in the server log only
    return json({ error: 'Kesalahan di server AutoJobs. Coba lagi sebentar lagi.' }, 500);
  }
}
