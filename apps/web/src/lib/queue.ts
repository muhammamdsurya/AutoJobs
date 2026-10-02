// Submission queue on PostgreSQL (SQ-01..SQ-10). The applications table *is* the persistent queue. The user's
// browser extension pulls work for its own user; the rules are enforced here, not in the extension:
// - one item at a time per user, in rounds: one application per portal back to back (least recently used portal
//   first), then one random gap (default 30–60 s) before the next round (portal_accounts.next_apply_at, set on all
//   the user's accounts). With one portal left, every application is followed by the gap.
// - daily cap per portal account (Asia/Jakarta day); overflow simply waits for tomorrow
// - an attempt whose browser vanished is re-queued after the lease; the portal is checked for "already applied" first
import { findAnswer, type BankEntry } from './answers';
import type { Answer, PendingQuestion } from './apply-plan';
import { saveFile } from '@autojobs/shared/crypto';
import { sql } from '@autojobs/shared/db';
import { getBank } from './profile';
import { AUTO_APPLY, DRY_RUN_OK, PORTALS, type Portal } from '@autojobs/shared/portals';
import { gapSec, getSettings, type Settings } from '@autojobs/shared/settings';

const LEASE = '15 minutes';
const MAX_ATTEMPTS = 3; // first try + 2 retries (SQ-08)

export async function logEvent(applicationId: string, event: string, detail?: string | null, fileKey?: string | null) {
  await sql`insert into application_events (application_id, event, detail, file_key) values (${applicationId}, ${event}, ${detail ?? null}, ${fileKey ?? null})`;
}

// Queued applications of this user that could go now, apart from the gap (joined as a / c / pa).
const ready = (userId: string, s: Settings) => {
  const enabled = PORTALS.filter((p) => s.portalEnabled[p] && AUTO_APPLY[p]);
  return sql`a.user_id = ${userId}
    and a.status = 'queued' and a.scheduled_at <= now()
    and c.status = 'running'
    and pa.status = 'connected'
    and a.portal = any(${enabled})
    and (a.dry_run or (
      select count(*) from applications x
      where x.user_id = a.user_id and x.portal = a.portal and not x.dry_run and x.status = 'submitted'
        and x.submitted_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'
    ) < ${s.dailyCap})`;
};

export async function claimNextForUser(userId: string, s: Settings): Promise<{ appId: string; accountId: string } | null> {
  if (!PORTALS.some((p) => s.portalEnabled[p] && AUTO_APPLY[p])) return null;
  return sql.begin(async (tx) => {
    const [row] = await tx<{ appId: string; accountId: string }[]>`
      select a.id as app_id, pa.id as account_id
      from applications a
      join campaigns c on c.id = a.campaign_id
      join portal_accounts pa on pa.user_id = a.user_id and pa.portal = a.portal
      where ${ready(userId, s)}
        and (pa.next_apply_at is null or pa.next_apply_at <= now())
      order by pa.last_attempt_at nulls first, a.scheduled_at, a.created_at
      limit 1
      for update of a, pa skip locked`;
    if (!row) return null;
    // All the user's accounts stay blocked until the attempt reports back (then the gap is set) or the lease runs out.
    await tx`update portal_accounts set next_apply_at = now() + ${LEASE}::interval,
      last_attempt_at = case when id = ${row.accountId} then now() else last_attempt_at end where user_id = ${userId}`;
    await tx`update applications set status = 'in_progress', attempt_count = attempt_count + 1,
      locked_until = now() + ${LEASE}::interval, updated_at = now() where id = ${row.appId}`;
    return row;
  });
}

export type AttemptResult =
  | { kind: 'submitted'; confirmation: string; answers: Answer[] }
  | { kind: 'dry_run'; answers: Answer[] }
  | { kind: 'already_applied'; answers?: Answer[] }
  | { kind: 'skipped'; reason: string; answers?: Answer[] }
  | { kind: 'needs_action'; reason: string; accountStatus?: 'expired' | 'needs_verification'; answers?: Answer[]; questions?: PendingQuestion[] }
  | { kind: 'failed'; reason: string; transient?: boolean; answers?: Answer[] }
  // The browser couldn't work on it (AutoJobs window covered/minimized): back in the queue, attempt not used up.
  | { kind: 'postponed'; reason: string };

export type AttemptApp = { id: string; userId: string; campaignId: string; portal: Portal; attemptCount: number; dryRun: boolean };

// Records the outcome reported by the extension, then starts this account's random gap (SQ-02).
export async function finishAttempt(app: AttemptApp, r: AttemptResult, proof: { html?: string; screenshot?: Buffer } = {}) {
  const settings = await getSettings();
  if (r.kind === 'postponed') {
    await sql`update applications set status = 'queued', attempt_count = greatest(attempt_count - 1, 0),
      scheduled_at = now() + interval '20 seconds', locked_until = null, updated_at = now() where id = ${app.id}`;
    await logEvent(app.id, 'postponed', r.reason);
    await sql`update portal_accounts set next_apply_at = now() where user_id = ${app.userId}`;
    return;
  }
  const fast = app.dryRun && settings.dryRunFast;
  const label = r.kind === 'submitted' ? 'Halaman konfirmasi' : r.kind === 'dry_run' ? 'Uji coba: formulir siap dikirim' : 'Kondisi saat berhenti';
  let screenshotKey: string | null = null;
  if (proof.screenshot) await logEvent(app.id, 'screenshot', label, (screenshotKey = await saveFile(proof.screenshot)));
  if (proof.html) await logEvent(app.id, 'html_snapshot', label, await saveFile(proof.html));

  let status: string;
  let event: string;
  let reason: string | null = null;
  let confirmation: string | null = null;
  let retryIn: string | null = null;
  if (r.kind === 'submitted') [status, event, confirmation] = ['submitted', 'submitted', r.confirmation.slice(0, 500)];
  else if (r.kind === 'dry_run') [status, event, reason] = ['skipped', 'dry_run_done', DRY_RUN_OK];
  else if (r.kind === 'already_applied') {
    // After a crash or an unconfirmed submit, "already applied" means our earlier attempt went through (idempotency).
    if (app.attemptCount > 1) [status, event, confirmation] = ['submitted', 'submitted', 'Terkonfirmasi terkirim (terdeteksi saat pengecekan ulang di portal)'];
    else [status, event, reason] = ['skipped', 'skipped', 'Sudah pernah dilamar di portal ini'];
  } else if (r.kind === 'skipped') [status, event, reason] = ['skipped', 'skipped', r.reason];
  else if (r.kind === 'needs_action') [status, event, reason] = ['needs_action', 'needs_action', r.reason];
  else if (r.transient && app.attemptCount < MAX_ATTEMPTS) {
    const [sec, when] = fast ? (app.attemptCount === 1 ? [20, '20 detik'] : [60, '1 menit']) : app.attemptCount === 1 ? [120, '2 menit'] : [600, '10 menit'];
    retryIn = `${sec} seconds`;
    [status, event, reason] = ['queued', 'retry_scheduled', `${r.reason}. Dicoba lagi dalam ${when}.`];
  } else [status, event, reason] = ['failed', 'failed', r.reason];

  // Questions the user can answer in AutoJobs (kept only while the item waits on them).
  const questions = r.kind === 'needs_action' && r.questions?.length
    ? r.questions.slice(0, 10).map((q) => ({
        question: String(q.question).slice(0, 500),
        options: (q.options ?? []).slice(0, 60).map((o) => String(o).slice(0, 200)),
        multiple: !!q.multiple,
      }))
    : null;
  await sql`update applications set
      status = ${status},
      pending_questions = ${questions ? sql.json(questions) : null},
      failure_reason = ${reason?.slice(0, 1000) ?? null},
      confirmation_text = coalesce(${confirmation}, confirmation_text),
      answers = coalesce(${r.answers ? sql.json(r.answers) : null}, answers),
      screenshot_key = coalesce(${screenshotKey}, screenshot_key),
      submitted_at = case when ${status} = 'submitted' then now() else submitted_at end,
      scheduled_at = case when ${retryIn}::interval is null then scheduled_at else now() + ${retryIn}::interval end,
      locked_until = null, updated_at = now()
    where id = ${app.id}`;
  await logEvent(app.id, event, reason ?? confirmation);
  if (r.kind === 'needs_action' && r.accountStatus)
    await sql`update portal_accounts set status = ${r.accountStatus} where user_id = ${app.userId} and portal = ${app.portal}`;
  // Another portal still has its turn in this round → it goes right away; otherwise the round is over → one gap.
  const [{ more }] = await sql<{ more: boolean }[]>`select exists (
      select 1 from applications a
      join campaigns c on c.id = a.campaign_id
      join portal_accounts pa on pa.user_id = a.user_id and pa.portal = a.portal
      where ${ready(app.userId, settings)} and a.portal <> ${app.portal}
        and (pa.last_attempt_at is null or pa.last_attempt_at < coalesce(pa.round_started_at, '-infinity'))) as more`;
  if (more) await sql`update portal_accounts set next_apply_at = now() where user_id = ${app.userId}`;
  else await sql`update portal_accounts set next_apply_at = now() + ${gapSec(settings, app.dryRun)} * interval '1 second',
      round_started_at = now() where user_id = ${app.userId}`;
  await completeIfDone(app.campaignId);
}

export const MAX_BANK = 1000;
export class BankFull extends Error {}

// An answer saved from Laporan (a question that stopped applications) or from Profil: save it to the answer bank, then
// re-queue every "Perlu tindakan" item whose questions are now all answered (answer once, unblock them all). The same
// question again (same pattern ignoring case, same portal scope) replaces its answer instead of adding a row. Items of a
// cancelled search are not sent any more: they move to "Dilewati", the answer stays in the bank for next time.
export async function answerAndRequeue(userId: string, entry: BankEntry): Promise<{ added: boolean; requeued: number; skipped: number }> {
  // Matching reads the whole bank for every question, so it has a size limit (updating an existing pattern still works).
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from answer_bank where user_id = ${userId}`;
  if (n >= MAX_BANK) {
    const [same] = await sql`select 1 from answer_bank where user_id = ${userId} and lower(question_pattern) = lower(${entry.questionPattern})
      and coalesce(portal, '') = coalesce(${entry.portal}, '')`;
    if (!same) throw new BankFull(`Bank jawaban sudah berisi ${MAX_BANK} pola. Hapus pola yang tidak dipakai dulu.`);
  }
  // xmax = 0 only on a freshly inserted row: tells a new pattern from an updated one.
  const [{ added }] = await sql<{ added: boolean }[]>`insert into answer_bank (user_id, question_pattern, answer, portal)
    values (${userId}, ${entry.questionPattern}, ${entry.answer}, ${entry.portal})
    on conflict (user_id, lower(question_pattern), coalesce(portal, '')) do update set answer = excluded.answer, created_at = now()
    returning xmax = 0 as added`;
  const bank = await getBank(userId);
  const stuck = await sql<{ id: string; campaignId: string; portal: string; pendingQuestions: PendingQuestion[]; cancelled: boolean }[]>`
    select a.id, a.campaign_id, a.portal, a.pending_questions, c.status = 'cancelled' as cancelled from applications a join campaigns c on c.id = a.campaign_id
    where a.user_id = ${userId} and a.status = 'needs_action' and a.pending_questions is not null`;
  const unblocked = stuck.filter((a) => a.pendingQuestions.every((q) => findAnswer(q.question, bank, a.portal).kind === 'found'));
  let skipped = 0;
  for (const a of unblocked) {
    if (a.cancelled) {
      await sql`update applications set status = 'skipped', failure_reason = 'Pencarian dibatalkan; jawabannya disimpan ke bank jawaban',
        pending_questions = null, locked_until = null, updated_at = now() where id = ${a.id}`;
      await logEvent(a.id, 'skipped', 'Pencarian sudah dibatalkan: jawaban disimpan ke bank jawaban, lamaran tidak dikirim');
      skipped++;
      continue;
    }
    await sql`update applications set status = 'queued', attempt_count = 0, scheduled_at = now(), failure_reason = null,
      pending_questions = null, locked_until = null, updated_at = now() where id = ${a.id}`;
    await sql`update campaigns set status = 'running' where id = ${a.campaignId} and status = 'completed'`;
    await logEvent(a.id, 'manual_retry', 'Jawaban disimpan ke bank jawaban; dicoba lagi otomatis');
  }
  return { added, requeued: unblocked.length - skipped, skipped };
}

// The extension restarted (reloaded, browser restarted): whatever that browser was applying to is gone. Re-queue it now
// and lift the lease, instead of blocking every portal until the lease runs out.
export async function releaseAbandoned(userId: string, leasedBy: string): Promise<number> {
  const rows = await sql<{ id: string }[]>`update applications set status = 'queued', locked_until = null, leased_by = null, updated_at = now()
    where user_id = ${userId} and status = 'in_progress' and leased_by = ${leasedBy} returning id`;
  for (const r of rows) await logEvent(r.id, 'recovered', 'Ekstensi dimuat ulang saat melamar; dijadwalkan ulang. Status di portal dicek dulu sebelum mengirim.');
  if (rows.length) await sql`update portal_accounts set next_apply_at = now() where user_id = ${userId}`;
  return rows.length;
}

// The browser went away mid-attempt: re-queue. The next attempt checks the portal for "already applied" before submitting.
export async function recoverStale() {
  const rows = await sql<{ id: string }[]>`update applications set status = 'queued', locked_until = null, updated_at = now()
    where status = 'in_progress' and locked_until < now() returning id`;
  for (const r of rows) await logEvent(r.id, 'recovered', 'Proses terhenti (browser/ekstensi tertutup); dijadwalkan ulang. Status di portal dicek dulu sebelum mengirim.');
  return rows.length;
}

export async function completeIfDone(campaignId: string) {
  await sql`update campaigns set status = 'completed' where id = ${campaignId} and status = 'running'
    and not exists (select 1 from applications where campaign_id = ${campaignId} and status in ('queued', 'in_progress'))`;
}

export async function submittedToday(userId: string): Promise<Partial<Record<Portal, number>>> {
  const rows = await sql<{ portal: Portal; n: number }[]>`select portal, count(*)::int as n from applications
    where user_id = ${userId} and not dry_run and status = 'submitted'
      and submitted_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'
    group by portal`;
  return Object.fromEntries(rows.map((r) => [r.portal, r.n]));
}
