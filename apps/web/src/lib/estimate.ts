// SQ-04 estimate, shared by the server and the launch screen (pure: safe in client components).
import type { Portal } from '@autojobs/shared/portals';

export type EstimateSettings = { delaySec: number; dailyCap: number };

// Rounds: one application per portal, then one pause. So the portal with the most items decides: its count × the pause.
export function estimateFinish(
  perPortal: Partial<Record<Portal, number>>,
  sentToday: Partial<Record<Portal, number>>,
  s: EstimateSettings,
  dryRun: boolean,
) {
  const avg = s.delaySec;
  let seconds = 0;
  const overflow: Partial<Record<Portal, number>> = {};
  for (const [portal, n] of Object.entries(perPortal) as [Portal, number][]) {
    const room = dryRun ? n : Math.max(0, s.dailyCap - (sentToday[portal] ?? 0));
    const today = Math.min(n, room);
    if (n > today) overflow[portal] = n - today;
    seconds = Math.max(seconds, today * avg);
  }
  return { seconds, overflow };
}

export function formatDuration(seconds: number) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} menit`;
  return `${Math.floor(m / 60)} jam ${m % 60} menit`;
}
