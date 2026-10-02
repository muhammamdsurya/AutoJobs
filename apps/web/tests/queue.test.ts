// Integration check of the queue's guarantees against a real PostgreSQL (needs DATABASE_URL + migrations).
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { sql } from '@autojobs/shared/db';
import { estimateFinish } from '../src/lib/estimate';
import { answerAndRequeue, claimNextForUser, finishAttempt, recoverStale, releaseAbandoned } from '../src/lib/queue';
import { DEFAULT_SETTINGS, gapSec, getSettings } from '@autojobs/shared/settings';

const s = { ...DEFAULT_SETTINGS, dailyCap: 2 };
const tag = `queue-test-${Date.now()}`;

async function seed() {
  const [u] = await sql`insert into users (email, password_hash, consent_at, email_verified_at) values (${tag + '@example.test'}, 'x', now(), now()) returning id`;
  const [acct] = await sql`insert into portal_accounts (user_id, portal, status) values (${u.id}, 'jobstreet', 'connected') returning id`;
  const [c] = await sql`insert into campaigns (user_id, name, portals, position_include, status) values (${u.id}, ${tag}, '{jobstreet}', '{x}', 'running') returning id`;
  const apps: string[] = [];
  for (let i = 0; i < 4; i++) {
    const [l] = await sql`insert into job_listings (portal, external_id, url, title) values ('jobstreet', ${`${tag}-${i}`}, 'https://example.test', 'Data Analyst') returning id`;
    const [a] = await sql`insert into applications (user_id, campaign_id, listing_id, portal, dry_run, scheduled_at)
      values (${u.id}, ${c.id}, ${l.id}, 'jobstreet', ${i === 3}, now() - ${4 - i} * interval '1 minute') returning id`;
    apps.push(a.id);
  }
  return { userId: u.id as string, accountId: acct.id as string, apps };
}

test('one attempt per account at a time, gap, daily cap, crash recovery', async () => {
  const { userId, accountId, apps } = await seed();
  const claim = () => claimNextForUser(userId, s);

  const first = await claim();
  assert.equal(first?.appId, apps[0], 'oldest scheduled item first');
  assert.equal(await claim(), null, 'account is busy while an attempt runs');

  // attempt finished as submitted; gap not over yet
  await sql`update applications set status = 'submitted', submitted_at = now(), locked_until = null where id = ${apps[0]}`;
  await sql`update portal_accounts set next_apply_at = now() + interval '150 seconds' where id = ${accountId}`;
  assert.equal(await claim(), null, 'nothing claimed during the gap');

  await sql`update portal_accounts set next_apply_at = now() - interval '1 second' where id = ${accountId}`;
  assert.equal((await claim())?.appId, apps[1]);
  await sql`update applications set status = 'submitted', submitted_at = now(), locked_until = null where id = ${apps[1]}`;
  await sql`update portal_accounts set next_apply_at = now() - interval '1 second' where id = ${accountId}`;

  // cap is 2 and 2 were sent today: the real application waits, the dry run may still go
  assert.equal((await claim())?.appId, apps[3], 'daily cap reached: only the dry run is claimable');

  // the AutoJobs window was covered: postponed, back in the queue without using up the attempt
  const [c] = await sql`select campaign_id from applications where id = ${apps[3]}`;
  await finishAttempt({ id: apps[3], userId, campaignId: c.campaignId, portal: 'jobstreet', attemptCount: 1, dryRun: true }, { kind: 'postponed', reason: 'tertutup' });
  const [postponed] = await sql`select status, attempt_count from applications where id = ${apps[3]}`;
  assert.deepEqual({ status: postponed.status, attempts: postponed.attemptCount }, { status: 'queued', attempts: 0 });

  // the browser disappeared mid-attempt: lease expires, item goes back to the queue
  await sql`update applications set status = 'in_progress', locked_until = now() - interval '1 second' where id = ${apps[3]}`;
  assert.ok((await recoverStale()) >= 1);
  const [row] = await sql`select status from applications where id = ${apps[3]}`;
  assert.equal(row.status, 'queued');

  // Stopped on a question → answered once in AutoJobs → saved to the bank, and everything it unblocks is re-queued.
  const q = { question: 'Apakah kamu memiliki SIM A?', options: ['Ya', 'Tidak'], multiple: false };
  const other = { question: 'Berapa tinggi badanmu?', options: [], multiple: false };
  await sql`update applications set status = 'needs_action', pending_questions = ${sql.json([q])} where id in ${sql([apps[2], apps[3]])}`;
  await sql`update applications set status = 'needs_action', pending_questions = ${sql.json([q, other])} where id = ${apps[1]}`;
  assert.deepEqual(await answerAndRequeue(userId, { questionPattern: q.question, answer: 'Ya', portal: null }), { added: true, requeued: 2, skipped: 0 });
  const after = Object.fromEntries((await sql`select id, status, pending_questions from applications where user_id = ${userId}`).map((r) => [r.id, r]));
  assert.equal(after[apps[2]].status, 'queued');
  assert.equal(after[apps[3]].pendingQuestions, null);
  assert.equal(after[apps[1]].status, 'needs_action', 'still waiting on its other question');
  const [saved] = await sql`select answer from answer_bank where user_id = ${userId} and question_pattern = ${q.question}`;
  assert.equal(saved.answer, 'Ya');

  // The search was cancelled meanwhile: answering the last question still fills the bank, but the item is skipped, not sent.
  await sql`update campaigns set status = 'cancelled' where id = ${c.campaignId}`;
  assert.deepEqual(await answerAndRequeue(userId, { questionPattern: other.question, answer: '170', portal: null }), { added: true, requeued: 0, skipped: 1 });
  const [cancelledItem] = await sql`select status, pending_questions from applications where id = ${apps[1]}`;
  assert.deepEqual({ status: cancelledItem.status, pending: cancelledItem.pendingQuestions }, { status: 'skipped', pending: null });

  await sql`delete from users where id = ${userId}`;
  await sql`delete from job_listings where external_id like ${tag + '%'}`;
});

test('launched before the extension reported a portal login: the queue waits, then runs once the portal is connected', async () => {
  const [u] = await sql`insert into users (email, password_hash, consent_at, email_verified_at) values (${tag + '-login@example.test'}, 'x', now(), now()) returning id`;
  const [c] = await sql`insert into campaigns (user_id, name, portals, position_include, status) values (${u.id}, ${tag}, '{jobstreet}', '{x}', 'running') returning id`;
  const [l] = await sql`insert into job_listings (portal, external_id, url, title) values ('jobstreet', ${tag + '-login'}, 'https://example.test', 'Data Analyst') returning id`;
  const [a] = await sql`insert into applications (user_id, campaign_id, listing_id, portal) values (${u.id}, ${c.id}, ${l.id}, 'jobstreet') returning id`;
  assert.equal(await claimNextForUser(u.id, s), null, 'no login reported yet');
  await sql`insert into portal_accounts (user_id, portal, status) values (${u.id}, 'jobstreet', 'expired')`;
  assert.equal(await claimNextForUser(u.id, s), null, 'signed out of the portal');
  await sql`update portal_accounts set status = 'connected' where user_id = ${u.id}`;
  assert.equal((await claimNextForUser(u.id, s))?.appId, a.id);
});

test('answer bank: the same question answered again replaces its answer instead of adding a row', async () => {
  const [u] = await sql`insert into users (email, password_hash, consent_at, email_verified_at) values (${tag + '-bank@example.test'}, 'x', now(), now()) returning id`;
  const q = 'Do you have experience using Python and/or SQL?*';
  assert.equal((await answerAndRequeue(u.id, { questionPattern: q, answer: 'No', portal: null })).added, true);
  assert.equal((await answerAndRequeue(u.id, { questionPattern: q.toUpperCase(), answer: 'Yes', portal: null })).added, false, 'same question, other case');
  assert.equal((await answerAndRequeue(u.id, { questionPattern: q, answer: 'Ya', portal: 'glints' })).added, true, 'a portal-only answer is its own entry');
  const rows = await sql`select answer, portal from answer_bank where user_id = ${u.id} order by portal nulls first`;
  assert.deepEqual(rows.map((r) => [r.answer, r.portal]), [['Yes', null], ['Ya', 'glints']]);
});

test('debug mode shortens the pause for dry runs only; real submissions use the Admin pause', () => {
  const debug = { ...DEFAULT_SETTINGS, dryRunFast: true, dryRunDelaySec: 10 };
  assert.equal(gapSec(debug, true), 10);
  assert.equal(gapSec(debug, false), 20);
  assert.equal(gapSec(DEFAULT_SETTINGS, true), 20, 'debug mode off: dry runs use the normal pause');
});

test('estimate: rounds × average gap (busiest portal decides), cap overflow goes to tomorrow', () => {
  assert.deepEqual(estimateFinish({ jobstreet: 40 }, {}, { ...DEFAULT_SETTINGS, dailyCap: 100 }, false), { seconds: 800, overflow: {} }); // 40 rounds × 20 s
  assert.deepEqual(estimateFinish({ jobstreet: 30, glints: 10 }, { jobstreet: 5 }, DEFAULT_SETTINGS, false), { seconds: 400, overflow: { jobstreet: 10 } }); // 20 rounds
  assert.equal(estimateFinish({ jobstreet: 30 }, { jobstreet: 25 }, DEFAULT_SETTINGS, true).seconds, 600, 'dry runs ignore the cap');
});

// Rounds: one application per portal back to back, then one gap; as portals run out the round shrinks (3 → 2 → 1).
test('applications go in rounds: one per portal back to back, then one gap', async () => {
  const t = `${tag}-rot`;
  const [u] = await sql`insert into users (email, password_hash, consent_at, email_verified_at) values (${t + '@example.test'}, 'x', now(), now()) returning id`;
  for (const p of ['jobstreet', 'linkedin', 'glints']) await sql`insert into portal_accounts (user_id, portal, status) values (${u.id}, ${p}, 'connected')`;
  const [c] = await sql`insert into campaigns (user_id, name, portals, position_include, status) values (${u.id}, ${t}, '{jobstreet,linkedin,glints}', '{x}', 'running') returning id`;
  // Queued in portal order, as a launch inserts them: all JobStreet first.
  let i = 0;
  for (const p of ['jobstreet', 'jobstreet', 'jobstreet', 'linkedin', 'linkedin', 'glints']) {
    const [l] = await sql`insert into job_listings (portal, external_id, url, title) values (${p}, ${`${t}-${i}`}, 'https://example.test', 'Data Analyst') returning id`;
    await sql`insert into applications (user_id, campaign_id, listing_id, portal, dry_run, scheduled_at) values (${u.id}, ${c.id}, ${l.id}, ${p}, false, now() - ${10 - i++} * interval '1 minute')`;
  }
  const { delaySec: lo } = await getSettings(); // as configured in Admin
  const steps: string[] = [];
  for (let n = 0; n < 6; n++) {
    const got = await claimNextForUser(u.id, s);
    assert.ok(got, `claim ${n + 1}`);
    const [a] = await sql`select portal from applications where id = ${got.appId}`;
    assert.equal(await claimNextForUser(u.id, s), null, 'nothing else, on any portal, while one attempt runs');
    await finishAttempt({ id: got.appId, userId: u.id, campaignId: c.id, portal: a.portal, attemptCount: 1, dryRun: false }, { kind: 'skipped', reason: 'test' });
    const gaps = await sql`select extract(epoch from next_apply_at - now())::float8 as gap from portal_accounts where user_id = ${u.id}`;
    assert.ok(gaps.every((g) => Math.abs(g.gap - gaps[0].gap) < 1), 'one gap for all portals');
    const gap = gaps[0].gap >= lo - 5;
    steps.push(a.portal + (gap ? ' | jeda' : ''));
    await sql`update portal_accounts set next_apply_at = now() - interval '1 second' where user_id = ${u.id}`; // gap over
  }
  assert.deepEqual(steps, ['jobstreet', 'linkedin', 'glints | jeda', 'jobstreet', 'linkedin | jeda', 'jobstreet | jeda']);

  // Items for the release check below.
  for (const p of ['jobstreet', 'linkedin']) {
    const [l] = await sql`insert into job_listings (portal, external_id, url, title) values (${p}, ${`${t}-${i++}`}, 'https://example.test', 'Data Analyst') returning id`;
    await sql`insert into applications (user_id, campaign_id, listing_id, portal, dry_run) values (${u.id}, ${c.id}, ${l.id}, ${p}, false)`;
  }
  await sql`update campaigns set status = 'running' where id = ${c.id}`; // completed once the first six were done

  // The extension was reloaded mid-application: on restart it hands the item back at once, and the queue isn't held
  // for the 15-minute lease. Another paired browser's work is left alone.
  const got = (await claimNextForUser(u.id, s))!;
  await sql`update applications set leased_by = 'browser-a' where id = ${got.appId}`;
  assert.equal(await releaseAbandoned(u.id, 'browser-b'), 0, 'another browser is left alone');
  assert.equal(await claimNextForUser(u.id, s), null, 'still leased');
  assert.equal(await releaseAbandoned(u.id, 'browser-a'), 1);
  const [back] = await sql`select status from applications where id = ${got.appId}`;
  assert.equal(back.status, 'queued');
  assert.ok(await claimNextForUser(u.id, s), 'the queue moves on right away (rotation may pick the other portal first)');
  await sql`delete from users where id = ${u.id}`;
  await sql`delete from job_listings where external_id like ${t + '%'}`;
});

// Also after a failed assertion: test users (and their campaigns, via cascade) never linger in the dev database.
after(async () => {
  await sql`delete from users where email like ${tag + '%'}`;
  await sql`delete from job_listings where external_id like ${tag + '%'}`;
  await sql.end();
});
