// Shown in the AutoJobs window between tasks. Tells the background worker whether the window is visible:
// Chrome stops rendering covered/minimized windows, so applications wait until it's visible again.
const report = () => {
  // A page left over from before the extension was reloaded can't reach it any more: stop instead of throwing.
  if (!chrome.runtime?.id) return document.removeEventListener('visibilitychange', report);
  void chrome.storage.session.set({ workVisible: document.visibilityState === 'visible' });
};
document.addEventListener('visibilitychange', report);
report();

const status = document.getElementById('status');
const show = async () => {
  const { activity } = await chrome.storage.session.get('activity');
  status.textContent = activity || 'Menunggu lamaran berikutnya…';
};
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && changes.activity) void show(); });
void show();
