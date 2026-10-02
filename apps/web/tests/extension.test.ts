// End-to-end: the real extension (loaded into Microsoft Edge) pairs with the real API route handlers, loads a page for
// the search worker (the Glints path), and applies to a job on the fake portal. Needs DATABASE_URL, ENCRYPTION_KEY,
// migrations and Microsoft Edge (branded Chrome no longer loads unpacked extensions from the command line).
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type BrowserContext, type Worker } from 'playwright';
import * as api from '../src/app/api/extension/[action]/route';
import { deleteFile, saveFile } from '@autojobs/shared/crypto';
import { sql } from '@autojobs/shared/db';
import { createPairingCode, extensionLoader } from '../src/lib/extension';
import { answerAndRequeue } from '../src/lib/queue';
import { getSettings } from '@autojobs/shared/settings';
import { BANK, PAGES } from './fixture-portal';

// Functions passed to sw.evaluate run inside the extension, where `chrome` exists.
declare const chrome: {
  storage: { session: { set(v: object): Promise<void>; get(k: string): Promise<Record<string, any>> } };
  tabs: { remove(id: number): Promise<void> };
};

const EXT = path.resolve('extension');
const tag = `ext-test-${Date.now()}`;
const files: string[] = [];

const fetchModes: Record<string, string> = {};

// Serves the fake portal, and forwards /api/extension/* to the real Next.js route handlers.
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const m = url.pathname.match(/^\/api\/extension\/([\w-]+)$/);
  if (m) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = Object.entries(req.headers).flatMap(([k, v]) => (k === 'host' || v == null ? [] : [[k, String(v)] as [string, string]]));
    const request = new Request(url, { method: req.method, headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method!) ? undefined : Buffer.concat(chunks) });
    const handler = (api as unknown as Record<string, (r: Request, c: unknown) => Promise<Response> | Response>)[req.method!];
    const response = handler ? await handler(request, { params: Promise.resolve({ action: m[1] }) }) : new Response(null, { status: 405 });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  const body = PAGES[url.pathname];
  fetchModes[url.pathname] = String(req.headers['sec-fetch-mode'] ?? ''); // navigate = the tab opened it
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' }).end(body ?? 'not found');
});

let ctx: BrowserContext | undefined;
let sw: Worker;
let base = '';

before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // CI (GitHub Actions sets CI=true) skips this slow browser test; run it on a computer with Edge before releasing.
  ctx = process.env.CI ? undefined : await chromium
    .launchPersistentContext('', { channel: 'msedge', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] })
    .catch(() => undefined);
  if (ctx) sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
});

async function waitFor<T>(fn: () => Promise<T | null>, ms: number): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 1000))) {
    const v = await fn();
    if (v) return v;
  }
  throw new Error('timed out');
}

test('extension pairs, loads a page for the search worker, and applies on the fake portal', async (t) => {
  if (!ctx) return t.skip(process.env.CI ? 'browser test skipped in CI' : 'Microsoft Edge is not installed');

  const [u] = await sql`insert into users (email, password_hash, consent_at, email_verified_at) values (${tag + '@example.test'}, 'x', now(), now()) returning id`;
  await sql`insert into candidate_profiles (user_id) values (${u.id})`;
  const cvKey = await saveFile(Buffer.from('%PDF-1.4 test cv'));
  files.push(cvKey);
  const [cv] = await sql`insert into cv_documents (user_id, file_key, file_name, mime, size_bytes, is_default)
    values (${u.id}, ${cvKey}, 'CV.pdf', 'application/pdf', 16, true) returning id`;
  for (const b of BANK) await sql`insert into answer_bank (user_id, question_pattern, answer) values (${u.id}, ${b.questionPattern}, ${b.answer})`;
  await sql`insert into portal_accounts (user_id, portal, status) values (${u.id}, 'jobstreet', 'connected')`;
  const [c] = await sql`insert into campaigns (user_id, name, portals, position_include, status) values (${u.id}, ${tag}, '{jobstreet}', '{data analyst}', 'running') returning id`;
  const queue = async (path: string, cvId: string | null = cv.id) => {
    const [l] = await sql`insert into job_listings (portal, external_id, url, title) values ('jobstreet', ${tag + path}, ${base + path}, 'Data Analyst') returning id`;
    const [a] = await sql`insert into applications (user_id, campaign_id, listing_id, portal, cv_id) values (${u.id}, ${c.id}, ${l.id}, 'jobstreet', ${cvId}) returning id`;
    return a.id as string;
  };
  const finished = (id: string) => waitFor(async () => {
    const [row] = await sql`select status, answers, confirmation_text, failure_reason from applications where id = ${id}`;
    return row.status === 'queued' || row.status === 'in_progress' ? null : row;
  }, 120_000);
  const a = { id: await queue('/job/1') };

  // pairing with a code from the Connections page
  const code = await createPairingCode(u.id);
  const paired = await sw.evaluate(([b, k]) => (self as unknown as { pair: (a: string, c: string) => Promise<{ email: string }> }).pair(b, k), [base, code]);
  assert.equal(paired.email, `${tag}@example.test`);

  // the search worker asks the user's browser for a page (how Glints is searched), while the extension works its queue
  const loaded = extensionLoader(u.id, 'Portal uji')(`${base}/job/2`);
  await waitFor(async () => (await sql`select 1 from browser_fetches where user_id = ${u.id}`).length > 0 || null, 10_000);
  await sw.evaluate(() => (self as unknown as { loop: () => Promise<void> }).loop());
  assert.match(await loaded, /Kamu melamar pada/);

  const app = await finished(a.id);
  assert.equal(app.status, 'submitted', app.failureReason ?? '');
  // what the portal received: CV uploaded once and selected, no cover letter, answers from bank + profile
  const sent = JSON.parse(app.confirmationText.match(/\{.*\}/)[0]);
  assert.deepEqual(sent, { uploads: 1, resume: 'CV.pdf', cl: 'none', q0: '6', q1: 'c', q2: 'y', ph: '81234567890' }, 'q0 stays as the portal pre-filled it');
  assert.deepEqual(app.answers.map((x: { answer: string }) => x.answer), ['3', 'Ya', ''], 'the portal-filled phone is left as is');

  const events = await sql`select event, file_key from application_events where application_id = ${a.id} order by id`;
  files.push(...events.map((e) => e.fileKey).filter(Boolean));
  assert.deepEqual(events.map((e) => e.event), ['html_snapshot', 'submitted']);
  const [pa] = await sql`select extract(epoch from next_apply_at - now()) as gap from portal_accounts where user_id = ${u.id}`;
  const { delaySec } = await getSettings(); // as configured in Admin
  assert.ok(pa.gap > delaySec - 5 && pa.gap <= delaySec, `next attempt in ${pa.gap}s (${delaySec} s pause)`);

  // A portal that already lists the CV (uploaded earlier) gets it selected, not uploaded again.
  const second = await queue('/job/5');
  await sql`update campaigns set status = 'running' where id = ${c.id}`; // it completed after the first one
  await sql`update portal_accounts set next_apply_at = now() where user_id = ${u.id}`; // skip the gap for the test

  // AutoJobs window covered/minimized: the queue waits, nothing is claimed, no attempt used up...
  await sw.evaluate(() => chrome.storage.session.set({ workVisible: false }));
  await sw.evaluate(() => (self as unknown as { loop: () => Promise<void> }).loop());
  const [waiting] = await sql`select status, attempt_count from applications where id = ${second}`;
  assert.deepEqual({ status: waiting.status, attempts: waiting.attemptCount }, { status: 'queued', attempts: 0 });
  assert.match((await sw.evaluate(() => chrome.storage.session.get('activity'))).activity, /jendela AutoJobs tertutup/);
  // ...and carries on once the window is visible again, or (seen 2026-09-30) once the user closes that hidden window:
  // the extension opens a new one instead of waiting forever.
  await sw.evaluate(async () => {
    const { tabId } = await chrome.storage.session.get('tabId');
    if (tabId) await chrome.tabs.remove(tabId);
  });
  const app2 = await finished(second);
  assert.equal(app2.status, 'submitted', app2.failureReason ?? '');
  assert.deepEqual(JSON.parse(app2.confirmationText.match(/\{.*\}/)[0]).uploads, 0);
  assert.match(app2.confirmationText, /"resume":"CV.pdf"/);

  // A question not in the answer bank stops the application with its options; answered once in AutoJobs
  // (saved to the bank), the application is re-queued and goes through with that answer.
  const loop = () => sw.evaluate(() => (self as unknown as { loop: () => Promise<void> }).loop());
  const third = await queue('/job/6');
  await sql`update campaigns set status = 'running' where id = ${c.id}`;
  await sql`update portal_accounts set next_apply_at = now() where user_id = ${u.id}`;
  await loop();
  assert.equal((await finished(third)).status, 'needs_action');
  const [stuck] = await sql`select pending_questions from applications where id = ${third}`;
  assert.deepEqual(stuck.pendingQuestions, [{ question: 'Apakah kamu memiliki SIM A?', options: ['Ya', 'Tidak'], multiple: false }]);
  assert.equal((await answerAndRequeue(u.id, { questionPattern: 'Apakah kamu memiliki SIM A?', answer: 'Ya', portal: null })).requeued, 1);
  await sql`update portal_accounts set next_apply_at = now() where user_id = ${u.id}`;
  // Chrome restarted with this application waiting: nothing opens until the user says go (notification / popup).
  await sw.evaluate(() => (self as unknown as { holdAtStartup: () => Promise<void> }).holdAtStartup());
  await loop();
  const [heldApp] = await sql`select status from applications where id = ${third}`;
  assert.equal(heldApp.status, 'queued', 'held after Chrome started');
  const [tok] = await sql`select held from extension_tokens where user_id = ${u.id}`;
  assert.equal(tok.held, true, 'reported, so the campaign page can say so');
  await sw.evaluate(() => (self as unknown as { resumeQueue: () => Promise<void> }).resumeQueue());
  const app3 = await finished(third);
  assert.equal(app3.status, 'submitted', app3.failureReason ?? '');
  assert.match(app3.confirmationText, /"sim":"ya"/);

  // "CV di portal" (Profil): the CV the portal already lists is chosen, nothing is uploaded.
  await sql`insert into portal_extra_fields (user_id, portal, field_key, value) values (${u.id}, 'jobstreet', 'cv_source', 'portal')`;
  const fourth = await queue('/job/7');
  await sql`update campaigns set status = 'running' where id = ${c.id}`;
  await sql`update portal_accounts set next_apply_at = now() where user_id = ${u.id}`;
  await loop();
  const app4 = await finished(fourth);
  assert.equal(app4.status, 'submitted', app4.failureReason ?? '');
  assert.deepEqual(JSON.parse(app4.confirmationText.match(/\{.*\}/)[0]).uploads, 0);
  assert.match(app4.confirmationText, /"resume":"CV_lama.pdf"/);

  // No AutoJobs CV at all: the CV the portal lists is used automatically, without that setting.
  await sql`delete from portal_extra_fields where user_id = ${u.id} and field_key = 'cv_source'`;
  const fifth = await queue('/job/7?tanpa-cv', null);
  await sql`update campaigns set status = 'running' where id = ${c.id}`;
  await sql`update portal_accounts set next_apply_at = now() where user_id = ${u.id}`;
  await loop();
  const app5 = await finished(fifth);
  assert.equal(app5.status, 'submitted', app5.failureReason ?? '');
  assert.deepEqual(JSON.parse(app5.confirmationText.match(/\{.*\}/)[0]).uploads, 0);
  assert.match(app5.confirmationText, /"resume":"CV_lama.pdf"/);

  // Search pages in a row (how Glints is searched): the first is opened in the tab, the next ones on the same site are
  // downloaded inside it (much faster), with the same cookies.
  const load = extensionLoader(u.id, 'Portal uji');
  const pages = [load(`${base}/job/2`), load(`${base}/job/3`)];
  await waitFor(async () => (await sql`select 1 from browser_fetches where user_id = ${u.id}`).length === 2 || null, 10_000);
  await loop();
  const [p2, p3] = await Promise.all(pages);
  assert.match(p2, /Kamu melamar pada/);
  assert.match(p3, /sudah tidak tersedia/);
  assert.equal(fetchModes['/job/2'], 'navigate');
  assert.notEqual(fetchModes['/job/3'], 'navigate', 'second page fetched inside the tab');

  await sql`delete from users where id = ${u.id}`;
  await sql`delete from job_listings where external_id like ${tag + '%'}`;
});

after(async () => {
  // Also after a failed assertion: the test user never lingers in the dev database.
  await sql`delete from users where email like ${tag + '%'}`;
  await sql`delete from job_listings where external_id like ${tag + '%'}`;
  for (const k of files) await deleteFile(k);
  await ctx?.close();
  server.close();
  await sql.end();
});
