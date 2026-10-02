const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

// Lucide icons (same set as the web app), as SVG markup.
const ICONS = {
  ok: '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
  danger: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  neutral: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  open: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
};
const STATUS = {
  connected: ['Sudah masuk', 'ok'],
  expired: ['Belum masuk', 'danger'],
  needs_verification: ['Perlu verifikasi', 'warn'],
  unknown: ['Belum diperiksa', 'neutral'],
};

const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'lucide');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
};

function show(msg, isError) {
  $('msg').textContent = msg || '';
  $('msg').className = isError ? 'msg err' : 'msg';
}

async function render() {
  const s = await send({ type: 'status' });
  const paired = !!s.email;
  $('unpaired').hidden = paired;
  $('paired').hidden = !paired;
  if (s.appUrl) $('appUrl').value = s.appUrl;
  if (!paired) return;
  $('email').textContent = s.email;
  $('held').hidden = !s.held;
  $('server').textContent = s.appUrl;
  $('activity').textContent = s.activity || (s.lastError ? `Kesalahan terakhir: ${s.lastError}` : 'Menunggu lamaran berikutnya.');
  const list = $('portals');
  list.replaceChildren();
  for (const p of s.status?.portals ?? []) {
    const [label, tone] = STATUS[p.status] ?? [p.status, 'neutral'];
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.label;
    const badge = document.createElement('span');
    badge.className = `badge tone-${tone}`;
    badge.append(icon(tone), label);
    li.append(name, badge);
    if (p.status !== 'connected') {
      const a = document.createElement('a');
      a.href = p.signInUrl;
      a.target = '_blank';
      a.append('Buka', icon('open'));
      li.append(a);
    }
    list.append(li);
  }
  if (!list.children.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Belum diperiksa. Klik "Periksa login portal".';
    list.append(li);
  }
  $('shots').checked = await chrome.permissions.contains({ origins: ['<all_urls>'] });
}

$('pair').onclick = async () => {
  show('Memasangkan…');
  const r = await send({ type: 'pair', appUrl: $('appUrl').value.trim(), code: $('code').value.trim() });
  show(r.ok ? 'Terpasang. Status login portal sudah diperiksa.' : r.error, !r.ok);
  await render();
};

$('check').onclick = async () => {
  show('Memeriksa login di jendela AutoJobs…');
  const r = await send({ type: 'check' });
  show(r.ok ? 'Selesai diperiksa.' : r.error, !r.ok);
  await render();
};

$('resume').onclick = async () => {
  await send({ type: 'resume' });
  show('Antrean dilanjutkan.');
  await render();
};

$('unpair').onclick = async () => {
  await send({ type: 'unpair' });
  show('Ekstensi diputuskan dari akun AutoJobs.');
  await render();
};

// Same as the reload button in chrome://extensions (reads the files from disk again), for when the AutoJobs window
// was closed and the queue got stuck. The old work window is closed first: its id lives in session storage, which a
// reload clears, so it would otherwise stay open next to the new one. After the reload the extension reopens the
// window and carries on with the queue; an application that was in progress goes back to the queue.
$('reload').onclick = async () => {
  show('Memuat ulang ekstensi dan melanjutkan antrean…');
  const { tabId } = await chrome.storage.session.get('tabId');
  if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
  await chrome.storage.local.set({ reopenAfterReload: true });
  chrome.runtime.reload();
};

$('shots').onchange = async (e) => {
  const origins = ['<all_urls>'];
  const ok = e.target.checked ? await chrome.permissions.request({ origins }) : !(await chrome.permissions.remove({ origins }));
  e.target.checked = e.target.checked && ok;
};

render();
