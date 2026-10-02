// Background worker: campaign scraping, crash recovery and data retention (incl. unpaid token purchases). Applying
// itself happens in the user's browser (AutoJobs extension); the rules for it are enforced by the API it calls.
import { deleteFile } from '@autojobs/shared/crypto';
import { errorMessage, sql } from '@autojobs/shared/db';
import { expireTopups } from '@autojobs/shared/payments';
import { getSettings } from '@autojobs/shared/settings';
import { recoverStale } from '@/lib/queue';
import { claimScrape, runScrape } from './scrape';

let stopping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Several scrapes can run at once: a Glints search waits on the user's browser, it shouldn't block other users.
async function scrapeLoop(n: number) {
  while (!stopping) {
    const c = await claimScrape().catch((e) => { console.error('[scrape claim]', e); return null; });
    if (!c) { await sleep(3000); continue; }
    console.log(`[scrape ${n}] campaign ${c.id}`);
    try {
      await runScrape(c);
    } catch (e) {
      console.error('[scrape]', e);
      await sql`update campaigns set status = 'ready', locked_until = null, scrape_summary = ${sql.json({ error: errorMessage(e) })}
        where id = ${c.id} and status = 'scraping'`.catch(() => {});
    }
  }
}

// Screenshots / HTML snapshots older than the retention setting are deleted (PRD: 90 days, configurable).
async function cleanup() {
  const { screenshotRetentionDays: days } = await getSettings();
  const events = await sql<{ id: string; fileKey: string }[]>`select id, file_key from application_events
    where file_key is not null and created_at < now() - ${days} * interval '1 day' limit 5000`;
  for (const e of events) await deleteFile(e.fileKey);
  if (events.length) await sql`update application_events set file_key = null where id in ${sql(events.map((e) => e.id))}`;
  const apps = await sql<{ id: string; screenshotKey: string }[]>`select id, screenshot_key from applications
    where screenshot_key is not null and updated_at < now() - ${days} * interval '1 day' limit 5000`;
  for (const a of apps) await deleteFile(a.screenshotKey);
  if (apps.length) await sql`update applications set screenshot_key = null where id in ${sql(apps.map((a) => a.id))}`;
  await sql`delete from sessions where expires_at < now()`;
  await sql`delete from email_codes where expires_at < now()`;
  await sql`delete from pairing_codes where expires_at < now()`;
  await sql`delete from browser_fetches where created_at < now() - interval '1 hour'`;
  await sql`delete from extension_tokens where last_seen_at < now() - interval '60 days'`; // no longer accepted anyway
  // Sign-ups never verified within 7 days (nothing in them: unverified accounts can't use the app) free the address,
  // so nobody can squat someone else's email.
  await sql`delete from users where email_verified_at is null and created_at < now() - interval '7 days'`;
}

async function maintenanceLoop() {
  let lastCleanup = 0;
  while (!stopping) {
    try {
      const recovered = await recoverStale();
      if (recovered) console.log(`[recover] re-queued ${recovered} stale attempt(s)`);
      await expireTopups();
      if (Date.now() - lastCleanup > 3_600_000) { await cleanup(); lastCleanup = Date.now(); }
    } catch (e) {
      console.error('[maintenance]', e);
    }
    await sleep(60_000);
  }
}

const concurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 3));
console.log(`[worker] started: ${concurrency} scrape slot(s)`);
const loops = [...Array.from({ length: concurrency }, (_, i) => scrapeLoop(i + 1)), maintenanceLoop()];

const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log('[worker] stopping after current jobs…');
  await Promise.race([Promise.all(loops), sleep(30_000)]);
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
