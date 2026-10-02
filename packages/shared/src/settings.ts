import { sql } from './db';
import type { Portal } from './portals';

// The pause between rounds (one application per portal) is set in Admin, always within these bounds.
export const MIN_DELAY_SEC = 20;
export const MAX_DELAY_SEC = 60;

export type Settings = {
  delaySec: number; // fixed pause after each round
  dailyCap: number; // per portal account (SQ-05)
  portalEnabled: Record<Portal, boolean>; // per-portal kill switch
  screenshotRetentionDays: number;
  alertFailureRatio: number; // selector-health alert: failed share of the last 20 attempts
  // Debug mode: dry runs (never submitted) use a short gap so apply flows can be fixed quickly.
  dryRunFast: boolean;
  dryRunDelaySec: number;
};

export const DEFAULT_SETTINGS: Settings = {
  delaySec: 20,
  dailyCap: 25,
  portalEnabled: { jobstreet: true, glints: true, linkedin: true },
  screenshotRetentionDays: 90,
  alertFailureRatio: 0.3,
  dryRunFast: false,
  dryRunDelaySec: 15,
};

export async function getSettings(): Promise<Settings> {
  const [row] = await sql<{ value: Partial<Settings> & { delayMinSec?: number; delayMaxSec?: number } }[]>`select value from settings where key = 'app'`;
  // delayMinSec/delayMaxSec: the old random range; its minimum carries over as the fixed pause.
  const { delayMinSec, delayMaxSec: _, ...v } = row?.value ?? {};
  const s = { ...DEFAULT_SETTINGS, ...v, portalEnabled: { ...DEFAULT_SETTINGS.portalEnabled, ...v.portalEnabled } };
  s.delaySec = Math.min(MAX_DELAY_SEC, Math.max(MIN_DELAY_SEC, v.delaySec ?? delayMinSec ?? DEFAULT_SETTINGS.delaySec));
  return s;
}

export async function saveSettings(s: Settings) {
  await sql`insert into settings (key, value) values ('app', ${sql.json(s)})
    on conflict (key) do update set value = excluded.value`;
}

// The merchant's static QRIS, uploaded in the admin console (own settings row, so saving the other settings never
// touches it): the image (shown as the "QRIS statis" fallback) and the payload decoded from it (each purchase's QR
// is made from it); null until there is one.
export async function getQris() {
  const [r] = await sql<{ value: { fileKey: string; mime: string; payload: string } }[]>`select value from settings where key = 'qris'`;
  return r?.value ?? null;
}

// Pause after a round, before the user's next attempt on any portal.
export const gapSec = (s: Pick<Settings, 'delaySec' | 'dryRunFast' | 'dryRunDelaySec'>, dryRun: boolean) =>
  dryRun && s.dryRunFast ? s.dryRunDelaySec : s.delaySec;
