import { rp } from '@autojobs/shared/tokens';

// audit_log actions in plain Indonesian (unknown ones are shown as they are).
export const ACTION_LABEL: Record<string, string> = {
  signup: 'Mendaftar',
  login: 'Masuk',
  login_failed: 'Gagal masuk',
  password_reset_requested: 'Minta atur ulang kata sandi',
  extension_paired: 'Ekstensi dipasangkan',
  extension_unpaired: 'Ekstensi diputuskan',
  admin_login_failed: 'Gagal masuk konsol admin',
  notify_rejected: 'Notifikasi DANA ditolak (kunci salah)',
  email_verified: 'Email terverifikasi',
  google_linked: 'Akun Google ditautkan',
  password_reset: 'Kata sandi diatur ulang',
  cv_uploaded: 'CV diunggah',
  cv_deleted: 'CV dihapus',
  campaign_launched: 'Pencarian diluncurkan',
  data_exported: 'Data diunduh',
  account_deleted: 'Akun dihapus',
  settings_changed: 'Pengaturan aplikasi diubah',
  topup_requested: 'Bukti transfer dikirim (lama)',
  topup_started: 'Mulai membeli token',
  topup_proof_sent: 'Bukti pembayaran dikirim',
  topup_paid: 'Token dibeli',
  topup_rejected: 'Bukti pembayaran ditolak',
  tokens_adjusted: 'Token disesuaikan admin',
  user_suspended: 'Akun ditangguhkan',
  user_unsuspended: 'Akun diaktifkan kembali',
  pack_created: 'Paket token ditambah',
  pack_updated: 'Paket token diubah',
  qris_uploaded: 'QRIS diunggah',
  payment_hook_key_created: 'Kunci notifikasi DANA dibuat',
  dana_transaction_ignored: 'Pembayaran DANA diabaikan',
  admin_login: 'Masuk konsol admin',
};

const KEY_LABEL: Record<string, string> = {
  tokens: 'token', amount: 'dibayar', price: 'harga', method: 'cara', delta: 'perubahan', reason: 'alasan', balance: 'saldo',
  trxId: 'transaksi DANA', note: 'catatan', ip: 'IP', name: 'nama', merchant: 'merchant', consent: 'persetujuan',
};
const MONEY = new Set(['amount', 'price']);
const METHOD: Record<string, string> = { dana: 'otomatis (DANA)', proof: 'bukti transfer', admin: 'ditandai admin' };
type PackLike = { tokens?: number; price?: number; active?: boolean };
// A token pack inside a detail (pack_updated before/after): "2 token Rp40.000, disembunyikan".
const pack = (v: PackLike) => `${v.tokens} token ${rp(v.price ?? 0)}${v.active === false ? ', disembunyikan' : ''}`;

function value(k: string, v: unknown): string {
  if (MONEY.has(k) && typeof v === 'number') return rp(v);
  if (k === 'method') return METHOD[String(v)] ?? String(v);
  if (typeof v !== 'object' || v === null) return String(v);
  return 'tokens' in v && 'price' in v ? pack(v as PackLike) : JSON.stringify(v);
}

// A detail object as short "key: value" text, skipping ids and empty values.
export function describe(detail: Record<string, unknown> | null): string {
  if (!detail) return '';
  // An edit: "before → after" (jsonb has its own key order, so not by iterating).
  if (detail.before && detail.after) return `${value('before', detail.before)} → ${value('after', detail.after)}`;
  return Object.entries(detail)
    .filter(([k, v]) => v != null && v !== '' && (k === 'trxId' || !/id$/i.test(k)))
    .map(([k, v]) => `${KEY_LABEL[k] ?? k}: ${value(k, v)}`)
    .join(' · ');
}
