'use server';

import { networkInterfaces } from 'node:os';
import jsQR from 'jsqr';
import { revalidatePath } from 'next/cache';
import sharp from 'sharp';
import { requireAdmin } from '@autojobs/shared/auth';
import { deleteFile, saveFile } from '@autojobs/shared/crypto';
import { audit, sql } from '@autojobs/shared/db';
import type { FormState } from '@autojobs/shared/forms';
import { newHookKey } from '@autojobs/shared/payments';
import { PORTALS } from '@autojobs/shared/portals';
import { isQris, merchantName } from '@autojobs/shared/qris';
import { getQris, MAX_DELAY_SEC, MIN_DELAY_SEC, saveSettings } from '@autojobs/shared/settings';
import { proofMime } from '@autojobs/shared/tokens';

const ok = (msg: string): FormState => {
  revalidatePath('/settings');
  return { ok: msg };
};

// The merchant's static QRIS as an image (as the DANA Bisnis app or the bank provides it). Its code is read here, so
// each purchase's QR can carry the amount; the image itself is the "QRIS statis" fallback for users.
export async function uploadQris(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const file = fd.get('qris');
  if (!(file instanceof File) || file.size === 0) return { error: 'Pilih gambar QRIS terlebih dulu.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'Ukuran gambar maksimal 5 MB.' };
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = proofMime(buf);
  if (!mime || mime === 'application/pdf') return { error: 'QRIS harus berupa gambar JPG, PNG, atau WebP.' };
  // ponytail: one decode at ≤1600 px; a blurry photo can still fail, then a cleaner screenshot of the QRIS is needed
  const pixels = await sharp(buf).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true }).catch(() => null); // damaged file: refused below
  if (!pixels) return { error: 'Gambar tidak bisa dibaca (rusak atau terpotong). Unggah ulang file QRIS-nya.' };
  const { data, info } = pixels;
  const payload = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: 'attemptBoth' })?.data.trim();
  if (!payload) return { error: 'Kode QR tidak terbaca di gambar ini. Unggah tangkapan layar QRIS yang tajam dan utuh.' };
  if (!isQris(payload)) return { error: 'Kode QR terbaca, tetapi bukan QRIS yang valid.' };
  if (/^000201010212/.test(payload)) return { error: 'Ini QRIS dinamis (sekali pakai). Unggah QRIS statis milik merchant.' };
  const old = await getQris();
  const fileKey = await saveFile(buf);
  await sql`insert into settings (key, value) values ('qris', ${sql.json({ fileKey, mime, payload })})
    on conflict (key) do update set value = excluded.value`;
  await deleteFile(old?.fileKey);
  await audit(null, 'qris_uploaded', { merchant: merchantName(payload) }, admin.id);
  return ok(`QRIS tersimpan (${merchantName(payload) ?? 'merchant'}). Pembelian baru memakai QRIS ini.`);
}

// A new key for the phone (the old one stops working), shown once inside the URL MacroDroid posts to. In development,
// also the address on this computer's Wi-Fi: the phone can't reach "localhost".
export async function createHookKey(): Promise<FormState> {
  const admin = await requireAdmin();
  const key = await newHookKey();
  await audit(null, 'payment_hook_key_created', undefined, admin.id);
  const url = new URL('/api/payments/notify', process.env.APP_URL ?? 'http://localhost:3000');
  url.searchParams.set('key', key);
  const lan = Object.values(networkInterfaces()).flat().find((i) => i?.family === 'IPv4' && !i.internal)?.address;
  if (['localhost', '127.0.0.1'].includes(url.hostname) && lan) {
    const local = new URL(url);
    local.hostname = lan;
    return ok(`Salin sekarang (tidak ditampilkan lagi): ${url}  ·  Uji dari HP di Wi-Fi yang sama: ${local}`);
  }
  return ok(`Salin sekarang (tidak ditampilkan lagi): ${url}`);
}

// Queue pacing, monitoring and portal switches (formerly the app's Admin page).
export async function saveAppSettings(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const n = (k: string) => Number(fd.get(k));
  const s = {
    delaySec: Math.round(n('delaySec')),
    dailyCap: Math.round(n('dailyCap')),
    screenshotRetentionDays: Math.round(n('screenshotRetentionDays')),
    alertFailureRatio: n('alertFailurePercent') / 100,
    portalEnabled: Object.fromEntries(PORTALS.map((p) => [p, fd.get(`enabled_${p}`) === 'on'])) as Record<(typeof PORTALS)[number], boolean>,
    dryRunFast: fd.get('dryRunFast') === 'on',
    dryRunDelaySec: Math.round(n('dryRunDelaySec')),
  };
  if (!(s.dryRunDelaySec >= 5 && s.dryRunDelaySec <= 120)) return { error: 'Jeda uji coba harus antara 5 dan 120 detik.' };
  if (!(s.delaySec >= MIN_DELAY_SEC && s.delaySec <= MAX_DELAY_SEC)) return { error: `Jeda antar-putaran harus antara ${MIN_DELAY_SEC} dan ${MAX_DELAY_SEC} detik.` };
  if (!(s.dailyCap >= 1 && s.dailyCap <= 500)) return { error: 'Batas harian harus antara 1 dan 500.' };
  if (!(s.screenshotRetentionDays >= 1 && s.screenshotRetentionDays <= 3650)) return { error: 'Masa simpan harus antara 1 dan 3650 hari.' };
  if (!(s.alertFailureRatio > 0 && s.alertFailureRatio <= 1)) return { error: 'Ambang peringatan harus antara 1% dan 100%.' };
  await saveSettings(s);
  await audit(null, 'settings_changed', s, admin.id);
  return ok('Pengaturan disimpan. Nilai baru berlaku untuk lamaran berikutnya.');
}
