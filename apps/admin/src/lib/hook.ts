import type { Hook } from '@autojobs/shared/payments';

// What happened to the last notification the phone forwarded.
export const HOOK_RESULT: Record<string, string> = {
  paid: 'pembelian dikreditkan',
  unmatched: 'nominal tidak cocok dengan pembelian (lihat Pembayaran)',
  duplicate: 'notifikasi ganda, diabaikan',
  no_amount: 'tidak ada nominal Rp di teksnya',
};

// The phone pings every 15 minutes, so silence for 30 means it is off, offline, or MacroDroid stopped.
export const phoneQuiet = (h: Hook) => !h.lastSeenAt || Date.now() - Date.parse(h.lastSeenAt) > 30 * 60_000;
