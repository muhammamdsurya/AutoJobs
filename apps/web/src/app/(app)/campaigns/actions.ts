'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@autojobs/shared/forms';
import { recordFailedAttempt, requireUser, tooManyAttempts } from '@autojobs/shared/auth';
import { audit, sql } from '@autojobs/shared/db';
import { LEVELS } from '@/lib/filters';
import { AUTO_APPLY, isPortal, PORTAL_LABEL, type Portal } from '@autojobs/shared/portals';
import { getDefaultCv, getExtras, getProfile, missingFor } from '@/lib/profile';
import { completeIfDone } from '@/lib/queue';
import { spendToken } from '@autojobs/shared/tokens';

const list = (fd: FormData, k: string) =>
  [...new Set(String(fd.get(k) ?? '').split(/[,\n]/).map((s) => s.trim().slice(0, 80)).filter(Boolean))].slice(0, 20);
const int = (fd: FormData, k: string, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(fd.get(k)));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

function parseCriteria(fd: FormData) {
  const portals = fd.getAll('portals').map(String).filter(isPortal);
  const positionInclude = list(fd, 'positionInclude');
  if (!portals.length) return { error: 'Pilih minimal satu portal.' };
  if (!positionInclude.length) return { error: 'Isi minimal satu kata kunci posisi.' };
  return {
    criteria: {
      name: String(fd.get('name') ?? '').trim().slice(0, 100) || positionInclude.join(', '),
      portals,
      positionInclude,
      positionExclude: list(fd, 'positionExclude'),
      descInclude: list(fd, 'descInclude'),
      descMode: fd.get('descMode') === 'and' ? 'and' : 'or',
      descExclude: list(fd, 'descExclude'),
      experienceLevels: fd.getAll('experienceLevels').map(String).filter((l) => LEVELS.some((x) => x.key === l)),
      companyExclude: list(fd, 'companyExclude'),
      location: String(fd.get('location') ?? '').trim().slice(0, 80) || 'Indonesia',
      maxPages: int(fd, 'maxPages', 1, 10, 3),
      maxListings: int(fd, 'maxListings', 10, 100, 50),
    },
  };
}

// A new search costs 1 token (spent with the insert, so a failed insert costs nothing). Re-running it before launch
// (updateCampaign, rescrape) is free: the user's choice.
export async function createCampaign(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseCriteria(fd);
  if (!parsed.criteria) return { error: parsed.error };
  const id = await sql.begin(async (tx) => {
    if (!(await spendToken(tx, user))) return null;
    const [c] = await tx<{ id: string }[]>`insert into campaigns ${tx({ ...parsed.criteria, userId: user.id, status: 'scraping' })} returning id`;
    return c.id;
  });
  if (!id) return { error: 'Token Anda habis. Isi token dulu di halaman Token.' };
  redirect(`/campaigns/${id}`);
}

// Re-running a search before launch is free (the user's choice), within a daily budget per account: one account can't
// keep the portals (and the server's standing with them) busy all day.
const RERUNS_PER_DAY = 30;
const RERUN_LIMIT = `Batas ${RERUNS_PER_DAY} kali cari ulang per hari tercapai. Coba lagi besok.`;
function rerunAllowed(userId: string) {
  const key = `rerun|${userId}`;
  if (tooManyAttempts(key, RERUNS_PER_DAY, 24 * 3600_000)) return false;
  recordFailedAttempt(key);
  return true;
}

// Edit the criteria of a campaign that hasn't been launched yet, and search again.
export async function updateCampaign(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseCriteria(fd);
  if (!parsed.criteria) return { error: parsed.error };
  if (!rerunAllowed(user.id)) return { error: RERUN_LIMIT };
  const [c] = await sql`update campaigns set ${sql(parsed.criteria)}, status = 'scraping', scrape_summary = null, locked_until = null,
    scrape_requested_at = now() where id = ${id} and user_id = ${user.id} and status = 'ready' returning id`;
  if (!c) return { error: 'Pencarian yang sudah diluncurkan tidak bisa diubah. Buat pencarian baru.' };
  redirect(`/campaigns/${id}`);
}

export async function rescrape(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(fd.get('id'));
  if (!rerunAllowed(user.id)) return { error: RERUN_LIMIT };
  await sql`update campaigns set status = 'scraping', scrape_summary = null, locked_until = null, scrape_requested_at = now()
    where id = ${id} and user_id = ${user.id} and status = 'ready'`;
  revalidatePath(`/campaigns/${id}`);
  return {};
}

// SQ-01: one application row per selected listing, all created in one transaction.
export async function launchCampaign(campaignId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (fd.get('ack') !== 'on') return { error: 'Centang pernyataan di atas tombol luncurkan terlebih dulu.' };
  const dryRun = fd.get('dryRun') === 'on';
  const selected = new Set(fd.getAll('sel').map(String));
  const [c] = await sql<{ id: string; status: string }[]>`select id, status from campaigns where id = ${campaignId} and user_id = ${user.id}`;
  if (!c) return { error: 'Pencarian tidak ditemukan.' };
  if (c.status !== 'ready') return { error: 'Pencarian ini sudah diluncurkan atau masih mencari lowongan.' };

  const matches = await sql<{ listingId: string; portal: Portal; applyMethod: string }[]>`
    select m.listing_id, l.portal, l.apply_method from campaign_matches m join job_listings l on l.id = m.listing_id where m.campaign_id = ${c.id}`;
  const chosen = matches.filter((m) => selected.has(m.listingId));
  if (!chosen.length) return { error: 'Pilih minimal satu lowongan.' };

  const isManual = (m: (typeof chosen)[number]) => !AUTO_APPLY[m.portal] || m.applyMethod === 'external';
  // Queued even before the extension has reported a login to the portal: they wait for it (a claim needs a connected
  // portal account), so a search the user paid for can always be launched.
  const queue = chosen.filter((m) => !isManual(m));
  const manual = dryRun ? [] : chosen.filter(isManual);
  if (!queue.length && !manual.length) return { error: 'Uji coba hanya untuk lowongan yang dilamar otomatis. Pilih minimal satu, atau matikan uji coba.' };

  const profile = await getProfile(user.id);
  const cv = await getDefaultCv(user.id);
  for (const portal of new Set(queue.map((m) => m.portal))) {
    const missing = missingFor(portal, profile, await getExtras(user.id, portal));
    if (missing.length) return { error: `Profil belum lengkap untuk ${PORTAL_LABEL[portal]}: ${missing.join(', ')}.` };
  }

  const rows = [
    ...queue.map((m) => ({ userId: user.id, campaignId: c.id, listingId: m.listingId, portal: m.portal, cvId: cv?.id ?? null, dryRun, status: 'queued', failureReason: null as string | null })),
    ...manual.map((m) => ({
      userId: user.id, campaignId: c.id, listingId: m.listingId, portal: m.portal, cvId: null, dryRun: false, status: 'skipped',
      failureReason: m.applyMethod === 'external' ? 'Eksternal: lamar manual di situs perusahaan' : 'Lamar manual: portal ini tidak dilamar otomatis',
    })),
  ];
  const launched = await sql.begin(async (tx) => {
    // First, and only from 'ready': a double click or a parallel "Cari ulang" can't launch it twice or mid-search.
    const [ok] = await tx`update campaigns set status = 'running', dry_run = ${dryRun}, launched_at = now()
      where id = ${c.id} and status = 'ready' returning id`;
    if (!ok) return false;
    await tx`update campaign_matches set selected = (listing_id = any(${[...selected]}::uuid[])) where campaign_id = ${c.id}`;
    // A listing that was only cancelled before may be queued again; anything else already applied is left untouched.
    const inserted = await tx<{ id: string; status: string }[]>`insert into applications ${tx(rows)}
      on conflict (user_id, listing_id) where not dry_run do update set
        status = excluded.status, campaign_id = excluded.campaign_id, cv_id = excluded.cv_id, attempt_count = 0,
        scheduled_at = now(), failure_reason = excluded.failure_reason, answers = null, screenshot_key = null,
        confirmation_text = null, submitted_at = null, updated_at = now()
      where applications.status = 'cancelled'
      returning id, status`;
    if (inserted.length)
      await tx`insert into application_events ${tx(inserted.map((r) => ({
        applicationId: r.id,
        event: r.status === 'queued' ? 'queued' : 'skipped',
        detail: r.status === 'queued' ? (dryRun ? 'Masuk antrean (uji coba, tidak akan dikirim)' : 'Masuk antrean') : 'Dicatat untuk dilamar manual',
      })))}`;
    return true;
  });
  if (!launched) return { error: 'Pencarian ini sudah diluncurkan atau masih mencari lowongan.' };
  await completeIfDone(c.id);
  await audit(user.id, 'campaign_launched', { campaignId: c.id, queued: queue.length, manual: manual.length, dryRun });
  redirect(`/campaigns/${c.id}`);
}

// SQ-09
export async function setCampaignState(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get('id'));
  const op = String(fd.get('op'));
  if (op === 'pause') await sql`update campaigns set status = 'paused' where id = ${id} and user_id = ${user.id} and status = 'running'`;
  if (op === 'resume') await sql`update campaigns set status = 'running' where id = ${id} and user_id = ${user.id} and status = 'paused'`;
  if (op === 'cancel')
    await sql.begin(async (tx) => {
      const [c] = await tx`update campaigns set status = 'cancelled' where id = ${id} and user_id = ${user.id} and status in ('running', 'paused') returning id`;
      if (!c) return;
      const rows = await tx<{ id: string }[]>`update applications set status = 'cancelled', updated_at = now()
        where campaign_id = ${id} and status = 'queued' returning id`;
      if (rows.length) await tx`insert into application_events ${tx(rows.map((r) => ({ applicationId: r.id, event: 'cancelled', detail: 'Pencarian dibatalkan' })))}`;
    });
  revalidatePath(`/campaigns/${id}`);
}
