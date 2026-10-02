// AutoJobs extension service worker. Pulls work from the user's AutoJobs account and carries it out in this browser,
// in a dedicated "AutoJobs" window. Portal patterns, answers, the gap between applications and daily caps all come from the server.
// CAPTCHAs, verification codes and sign-in are always left to the user.

const TICK = 'autojobs-tick';
chrome.alarms.create(TICK, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === TICK) void loop(); });
chrome.runtime.onStartup.addListener(() => void holdAtStartup());
chrome.runtime.onInstalled.addListener(() => void loop());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const local = () => chrome.storage.local.get(['appUrl', 'token', 'email']);
const setState = (s) => chrome.storage.session.set(s);

async function api(path, body, method = 'POST') {
  const { appUrl, token } = await local();
  const res = await fetch(`${appUrl}/api/extension/${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== 'pair') await chrome.storage.local.remove(['token', 'email']);
  if (!res.ok) throw new Error(data.error || `AutoJobs HTTP ${res.status}`);
  return data;
}

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icon128.png', title, message, priority: 2 }).catch(() => {});
}

// This service worker just started (extension reloaded, browser restarted, or woken up), so nothing is running in it:
// hand back an application a previous run left half-done, so the queue doesn't wait out the server's 15-minute lease.
const restarted = local().then(({ token }) => token && api('restart').catch(() => {}));

// Chrome just started: don't open the AutoJobs window out of the blue. With applications waiting, hold the queue and
// ask with a notification; searches the user starts still run. Released by the notification or the popup.
const HOLD_NOTE = 'autojobs-resume';
async function holdAtStartup() {
  if (!(await local()).token) return;
  await setState({ held: true }); // first, so an alarm tick can't start applying meanwhile
  const st = await api('status', null, 'GET').catch(() => null);
  if (!st?.queued) return resumeQueue(); // nothing waiting: nothing to hold
  chrome.notifications.create(HOLD_NOTE, {
    type: 'basic', iconUrl: 'icon128.png', priority: 2, requireInteraction: true,
    title: `AutoJobs: ${st.queued} lamaran menunggu`,
    message: 'Klik "Lanjutkan" untuk mulai melamar di jendela AutoJobs.',
    buttons: [{ title: 'Lanjutkan' }],
  });
}
async function resumeQueue() {
  await setState({ held: false });
  chrome.notifications.clear(HOLD_NOTE);
  void loop();
}
chrome.notifications.onButtonClicked.addListener((id) => { if (id === HOLD_NOTE) void resumeQueue(); });
chrome.notifications.onClicked.addListener((id) => { if (id === HOLD_NOTE) void resumeQueue(); });

// ---- the AutoJobs window: one tab, reused for every page load and application ----

let tabId = null; // the work tab; everything below acts on it
let onIdlePage = false;
const IDLE = chrome.runtime.getURL('idle.html');

// Chrome can swap a tab for a prerendered one with a new id; keep following ours.
chrome.tabs.onReplaced.addListener((added, removed) => {
  if (tabId === removed) {
    tabId = added;
    void setState({ tabId: added });
  }
});

// The AutoJobs window was closed: forget it. The next task opens a new, visible one; without this a window closed
// while hidden kept "not visible" forever, and the queue never asked for the task that would reopen it.
chrome.tabs.onRemoved.addListener(async (removed) => {
  const saved = tabId ?? (await chrome.storage.session.get('tabId')).tabId;
  if (removed !== saved) return;
  tabId = null;
  onIdlePage = false;
  await setState({ tabId: null, workVisible: true, waitingNotified: false, activity: null });
});

// The window came back into view (reported by idle.js): carry on with the queue right away.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.workVisible?.newValue === true && changes.workVisible.oldValue === false) void loop();
});

async function openWorkTab() {
  const saved = tabId ?? (await chrome.storage.session.get('tabId')).tabId;
  if (saved && (await chrome.tabs.get(saved).catch(() => null))) return (tabId = saved);
  const w = await chrome.windows.create({ url: IDLE, focused: false, width: 1280, height: 900 });
  tabId = w.tabs[0].id;
  onIdlePage = true;
  await setState({ tabId, workVisible: true });
  return tabId;
}

// Between tasks the window shows idle.html, which reports whether the window is visible.
async function goIdle() {
  if (!tabId || onIdlePage) return;
  await chrome.tabs.update(tabId, { url: IDLE }).catch(() => {});
  onIdlePage = true;
}

// Chrome stops rendering covered/minimized windows, so the queue waits instead of burning attempts.
async function waiting(on) {
  const { waitingNotified } = await chrome.storage.session.get('waitingNotified');
  if (on) {
    await setState({ activity: 'Antrean menunggu: jendela AutoJobs tertutup aplikasi lain atau diperkecil.' });
    if (!waitingNotified) {
      notify('Antrean AutoJobs menunggu', 'Jendela AutoJobs tertutup aplikasi lain atau diperkecil. Sisakan sebagian jendela itu terlihat; antrean lanjut otomatis.');
      await setState({ waitingNotified: true });
    }
  } else if (waitingNotified) {
    await setState({ waitingNotified: false, activity: null });
  }
}

async function waitComplete(timeout = 45_000, settle = 1200) {
  await sleep(600);
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(300)) {
    if ((await chrome.tabs.get(tabId)).status === 'complete') break;
  }
  await sleep(settle); // let client-side apps start rendering
}

// Only hosts the manifest grants (the portals, the AutoJobs server; localhost when developing): a task pointing anywhere
// else is refused, whatever the server sends, so this browser can't be steered to other sites.
function allowedUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return (chrome.runtime.getManifest().host_permissions || []).some((p) => {
    const m = p.match(/^(\*|https?):\/\/([^/]+)\//);
    if (!m || (m[1] !== '*' && u.protocol !== `${m[1]}:`)) return false;
    return m[2].startsWith('*.') ? u.hostname === m[2].slice(2) || u.hostname.endsWith(m[2].slice(1)) : u.hostname === m[2];
  });
}

async function navigate(url, settle) {
  if (!allowedUrl(url)) throw new Error(`Alamat di luar portal yang diizinkan: ${url}`);
  onIdlePage = false;
  await chrome.tabs.update(tabId, { url });
  await waitComplete(45_000, settle);
}

async function showWorkTab() {
  const tab = await chrome.tabs.get(tabId);
  await chrome.windows.update(tab.windowId, { state: 'normal', focused: true }).catch(() => {});
  await chrome.tabs.update(tabId, { active: true }).catch(() => {});
  return tab;
}

// Runs a page.js function in the work tab (injecting page.js first when the page is new).
async function call(name, arg) {
  for (let attempt = 0; ; attempt++) {
    try {
      const [{ result: ready }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!self.__aj });
      if (!ready) await chrome.scripting.executeScript({ target: { tabId }, files: ['page.js'] });
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: (n, a) => self.__aj[n](a), args: [name, arg ?? {}] }); // {} not null: page.js destructures its argument
      if (name === 'inspect' && result) await setState({ workVisible: !result.hidden }); // keep tracking visibility during tasks
      return result;
    } catch (e) {
      if (attempt >= 2 || /No tab with id/i.test(String(e.message))) throw e; // the page was navigating; try again once it settles
      await waitComplete(15_000);
    }
  }
}

// "The job pauses and asks the user": bring the window forward and wait for them to finish the check.
async function waitForHuman(challenge, label) {
  await showWorkTab();
  notify(`${label} meminta verifikasi`, 'Selesaikan verifikasi di jendela AutoJobs dalam 3 menit. AutoJobs tidak pernah mengisinya sendiri.');
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    if (!(await call('isChallenge', challenge).catch(() => true))) {
      await waitComplete(15_000);
      return true;
    }
  }
  return false;
}

// Optional proof screenshot: only when the user granted "access to all sites" in the popup.
async function screenshot() {
  if (!(await chrome.permissions.contains({ origins: ['<all_urls>'] }))) return undefined;
  const tab = await chrome.tabs.update(tabId, { active: true });
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  return dataUrl.split(',')[1];
}

// ---- tasks ----

// Once the AutoJobs tab is on the portal (cookies and Cloudflare clearance in place), further pages are downloaded
// with fetch() from inside it: ~0.3 s instead of opening and rendering each one. null → load the page normally.
async function fetchInTab(url, challenge) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!allowedUrl(url) || !tab?.url || new URL(tab.url).origin !== new URL(url).origin) return null;
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (u, ch) => {
      try {
        const res = await fetch(u, { credentials: 'include' });
        if (!res.ok) return null;
        const html = await res.text();
        const head = html.slice(0, 30000);
        const title = (head.match(/<title[^>]*>([^<]*)/i) || [])[1] || '';
        return new RegExp(ch.title, 'i').test(title) || new RegExp(ch.text, 'i').test(head) ? null : html; // a check page
      } catch {
        return null;
      }
    },
    args: [url, challenge],
  });
  return result;
}

async function runFetch(t) {
  const host = new URL(t.url).hostname.replace(/^www\./, '');
  await setState({ activity: `Memuat halaman ${host} untuk pencarian` });
  try {
    await openWorkTab();
    const fast = await fetchInTab(t.url, t.challenge).catch(() => null);
    if (fast != null) {
      await api('fetch-result', { id: t.id, ok: true, body: fast });
      return;
    }
    await navigate(t.url, 0); // search pages carry their data in the server-rendered HTML: no render wait needed
    if ((await call('isChallenge', t.challenge)) && !(await waitForHuman(t.challenge, host))) {
      await api('fetch-result', { id: t.id, ok: false, error: `${host} meminta verifikasi CAPTCHA. Buka ${host} di Chrome, selesaikan verifikasinya, lalu klik "Cari ulang".` });
      return;
    }
    await api('fetch-result', { id: t.id, ok: true, body: await call('html') });
  } catch (e) {
    await api('fetch-result', { id: t.id, ok: false, error: String(e.message || e) }).catch(() => {});
  }
}

const stop = (result) => Object.assign(new Error(result.reason || result.kind), { result });

// Wait until the page shows something to act on (a form, a button, a message); client-side apps render late.
// Chrome slows pages in hidden/minimized windows, so if it's still loading after 20 s, bring the window forward once.
async function settled(inspect) {
  let info;
  let hiddenFor = 0;
  for (let i = 0; i < 40; i++) {
    info = await inspect();
    const actionable = info.applyVisible || info.submitVisible || info.nextVisible || info.fieldCount > 0 || info.confirmation ||
      info.login || info.challenge || info.otp || info.closed || info.applied;
    if (!info.loading && actionable) return info;
    // A covered/minimized window doesn't finish rendering: hand it back without using up an attempt.
    hiddenFor = info.hidden ? hiddenFor + 1 : 0;
    if (hiddenFor >= 5)
      throw stop({ kind: 'postponed', reason: 'Jendela AutoJobs tertutup aplikasi lain atau diperkecil; ditunda sampai jendela terlihat lagi (tidak dihitung sebagai percobaan)' });
    if (i === 20) await showWorkTab();
    await sleep(1000);
  }
  if (info.loading)
    throw stop({ kind: 'failed', transient: true, reason: `Halaman masih memuat setelah 40 detik${info.hidden ? ' (jendela AutoJobs tersembunyi/diperkecil)' : ''}; dicoba lagi otomatis` });
  return info;
}

async function applyFlow(t, answers) {
  const { spec, challenge, portalLabel: label } = t;
  const inspect = () => settled(() => call('inspect', { spec, challenge }));
  const guard = async (info) => {
    if (info.challenge) {
      if (!(await waitForHuman(challenge, label)))
        throw stop({ kind: 'needs_action', accountStatus: 'needs_verification', reason: `${label} meminta verifikasi CAPTCHA yang belum diselesaikan. Selesaikan di Chrome, lalu klik "Coba lagi".` });
      info = await inspect();
    }
    if (info.login) throw stop({ kind: 'needs_action', accountStatus: 'expired', reason: `Anda belum masuk ke ${label} di Chrome ini. Masuk dulu, lalu klik "Coba lagi".` });
    if (info.otp) throw stop({ kind: 'needs_action', accountStatus: 'needs_verification', reason: `${label} meminta kode verifikasi (OTP). Selesaikan di Chrome, lalu klik "Coba lagi".` });
    return info;
  };

  await navigate(t.url);
  let info = await guard(await inspect());
  if (info.closed) throw stop({ kind: 'skipped', reason: 'Lowongan sudah ditutup' });
  if (info.applied) return { kind: 'already_applied' };
  const click = await call('clickApply', { spec });
  if (!click.found) throw stop({ kind: 'failed', reason: 'Tombol lamar tidak ditemukan (struktur halaman berubah?)' });
  if (click.external) throw stop({ kind: 'skipped', reason: 'Eksternal: lamar manual' });
  await waitComplete();

  let submitted = false;
  let lastSignature = '';
  let stuck = 0;
  for (let step = 1; step <= 12; step++) {
    info = await guard(await inspect());
    if (info.confirmation) return { kind: 'submitted', confirmation: info.confirmation, answers };
    if (submitted) {
      if (info.errors) throw stop({ kind: 'needs_action', reason: `Portal menolak pengiriman: ${info.errors}` });
      throw stop({ kind: 'failed', transient: true, reason: 'Konfirmasi pengiriman tidak terdeteksi; status diperiksa ulang pada percobaan berikutnya' });
    }
    // The page didn't advance. JobStreet renders its employer questions only after the step appears, so the first
    // read can miss them: read and fill the form once more before giving up.
    if (info.signature === lastSignature && stuck++) {
      // Still stuck: every required field left empty goes to the user, with the portal's options, so it can be
      // answered in the report and the application re-queued.
      // Required fields left empty; when none, every empty field is a suspect (the portal may require it unmarked).
      const empty = (await call('collectFields', { spec })).filter((f) => !f.filled || f.invalid); // or rejected by the portal
      const open = (empty.some((f) => f.required) ? empty.filter((f) => f.required) : empty)
        .map((f) => ({ question: f.label || '(pertanyaan tanpa label)', options: f.options.map((o) => o.label), multiple: f.kind === 'checkbox' && f.options.length > 1 }));
      const questions = open.filter((q, i) => open.findIndex((x) => x.question === q.question) === i);
      throw stop({
        kind: 'needs_action',
        reason: `Formulir tidak bisa dilanjutkan${info.errors ? `: ${info.errors}` : ''}${questions.length ? `. Pertanyaan yang belum dijawab: ${questions.map((q) => `"${q.question}"`).join('; ')}` : ''}`,
        questions,
      });
    }
    if (info.signature !== lastSignature) stuck = 0;
    lastSignature = info.signature;

    await call('prepare', { spec, hasCoverLetter: t.hasCoverLetter });
    await call('attachCv', { cv: t.cv, fromPortal: t.cvFromPortal });
    const plan = await api('plan', { applicationId: t.applicationId, fields: await call('collectFields', { spec }) });
    if (plan.needsAction) throw stop({ kind: 'needs_action', reason: plan.needsAction, questions: plan.questions ?? [] });
    const done = await call('applyActions', { actions: plan.actions });
    if (done && done.needsAction) throw stop({ kind: 'needs_action', reason: done.needsAction });
    answers.push(...plan.answers);

    // Portals keep Next/Submit disabled while a just-attached CV uploads (Glints sends it right away).
    let after = await inspect();
    for (let i = 0; i < 30 && !after.submitVisible && !after.nextVisible; i++) {
      await sleep(1000);
      after = await call('inspect', { spec, challenge });
    }
    if (after.submitVisible) {
      if (t.dryRun) return { kind: 'dry_run', answers };
      await call('clickSubmit', { spec });
      submitted = true;
      for (let i = 0; i < 20 && !(await call('inspect', { spec, challenge }).catch(() => ({}))).confirmation; i++) await sleep(1000);
      continue;
    }
    if (!(await call('clickNext', { spec })))
      throw stop({ kind: 'failed', reason: `Tombol lanjut/kirim tidak ditemukan atau tetap nonaktif di langkah ${step} (ada isian yang belum terbaca?)` });
    await waitComplete(20_000);
  }
  throw stop({ kind: 'failed', reason: 'Formulir melebihi 12 langkah' });
}

async function runApply(t) {
  await setState({ activity: `Melamar: ${t.title}, ${t.company} (${t.portalLabel}${t.dryRun ? ', uji coba' : ''})` });
  const answers = [];
  let opened = false;
  let result;
  try {
    await openWorkTab();
    opened = true;
    result = await applyFlow(t, answers);
  } catch (e) {
    // Anything unexpected (tab closed, page crashed) is retried by the server, up to its attempt limit.
    const msg = String(e.message || e);
    result = e.result ?? {
      kind: 'failed',
      transient: true,
      reason: /No (tab|window) with id/i.test(msg) ? 'Jendela AutoJobs tertutup saat sedang melamar; dicoba lagi otomatis. Biarkan jendela itu terbuka selama pencarian berjalan.' : msg,
    };
  }
  if (result.kind === 'postponed') {
    await setState({ workVisible: false, activity: null }); // idle.js reports when the window is visible again
    await api('apply-result', { applicationId: t.applicationId, result });
    return;
  }
  result.answers ??= answers;
  let html, shot;
  if (opened) {
    html = await call('html').catch(() => undefined);
    shot = await screenshot().catch(() => undefined);
  }
  if (result.kind === 'needs_action') notify(`Perlu tindakan: ${t.title}`, result.reason);
  await api('apply-result', { applicationId: t.applicationId, result, html, screenshot: shot });
  await setState({ activity: null });
}

// PC-02: open each portal's members-only page and see whether the user is signed in here.
async function checkPortals() {
  const st = await api('status', null, 'GET');
  const portals = {};
  await openWorkTab();
  for (const p of st.portals.filter((x) => x.enabled)) {
    await setState({ activity: `Memeriksa login ${p.label}` });
    try {
      await navigate(p.checkUrl);
      await sleep(2500); // client-side redirects to the sign-in page
      const none = '(?!)';
      const info = await call('inspect', {
        spec: { loginUrl: p.loginUrl || none, confirmation: none, closed: none, alreadyApplied: none, submit: none },
        challenge: st.challenge,
      });
      portals[p.portal] = info.challenge ? 'needs_verification' : info.login ? 'expired' : 'connected';
    } catch {
      // leave this portal's status as it was
    }
  }
  await setState({ activity: null });
  const res = await api('status', { portals });
  await setState({ status: res });
  return res;
}

// "Muat ulang" in the popup (e.g. after the AutoJobs window was closed and the queue got stuck): bring the window
// straight back when applications are waiting, instead of only when the next one is due, and carry on with the queue.
async function reopenAfterReload() {
  const { reopenAfterReload: asked } = await chrome.storage.local.get('reopenAfterReload');
  if (!asked) return;
  await chrome.storage.local.remove('reopenAfterReload');
  const st = await api('status', null, 'GET').catch(() => null);
  if (st) await setState({ status: st }); // the last known portal logins, so the popup doesn't ask to check again
  if (st?.queued) {
    await openWorkTab();
    await showWorkTab();
  }
}
// Only after that explicit reload: a plain browser start keeps its hold on the queue (holdAtStartup).
void chrome.storage.local.get('reopenAfterReload').then(({ reopenAfterReload: asked }) => { if (asked) void loop(); });

let busy = false;
async function loop() {
  if (busy) return;
  busy = true;
  try {
    await restarted;
    if (!(await local()).token) return;
    await reopenAfterReload();
    for (let i = 0; i < 500; i++) {
      // No AutoJobs window any more → the next task opens a new one, so "hidden" no longer applies.
      const { workVisible, tabId: saved, held } = await chrome.storage.session.get(['workVisible', 'tabId', 'held']);
      const windowGone = !(saved && (await chrome.tabs.get(saved).catch(() => null)));
      const canApply = !held && (windowGone || workVisible !== false);
      const task = await api('work', { canApply, held: !!held });
      await setState({ lastPoll: Date.now(), lastError: null });
      if (task.type === 'fetch') await runFetch(task);
      else if (task.type === 'apply') await runApply(task);
      else if (task.type !== 'again') {
        await waiting(!held && !canApply && task.pending > 0);
        // Next item due soon (short gaps in debug mode): wait here instead of until the next alarm.
        if ((canApply || task.searching) && task.retryInSec && task.retryInSec <= 25) { await sleep(task.retryInSec * 1000); continue; }
        break;
      }
    }
  } catch (e) {
    await setState({ lastError: String(e.message || e) });
  } finally {
    await goIdle();
    busy = false;
  }
}

async function pair(appUrl, code) {
  // The token travels with every request: HTTPS only (plain http just for a server on this computer).
  const u = new URL(appUrl);
  if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error('Alamat AutoJobs harus diawali https://');
  await chrome.storage.local.set({ appUrl: appUrl.replace(/\/+$/, '') });
  const { token, email } = await api('pair', { code });
  await chrome.storage.local.set({ token, email });
  return { email };
}

self.pair = pair;
self.loop = loop;
self.checkPortals = checkPortals;
self.holdAtStartup = holdAtStartup;
self.resumeQueue = resumeQueue;

// Messages from the popup.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const run = async () => {
    if (msg.type === 'pair') {
      const r = await pair(msg.appUrl, msg.code);
      await checkPortals().catch(() => {});
      void loop();
      return r;
    }
    if (msg.type === 'check') return checkPortals();
    if (msg.type === 'resume') return resumeQueue();
    if (msg.type === 'status') {
      const session = await chrome.storage.session.get(null);
      // A reload empties session storage: show the portal logins the server last recorded instead of "not checked".
      if (!session.status && (await local()).token) {
        const st = await api('status', null, 'GET').catch(() => null);
        if (st) await setState({ status: (session.status = st) });
      }
      return { ...session, ...(await local()), token: undefined };
    }
    if (msg.type === 'unpair') {
      await api('unpair', {}).catch(() => {});
      await chrome.storage.local.remove(['token', 'email']);
      return { ok: true };
    }
  };
  run().then((r) => reply({ ok: true, ...r }), (e) => reply({ ok: false, error: String(e.message || e) }));
  return true;
});
