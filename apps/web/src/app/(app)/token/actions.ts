'use server';

import { revalidatePath } from 'next/cache';
import QRCode from 'qrcode';
import { requireUser } from '@autojobs/shared/auth';
import { deleteFile, saveFile } from '@autojobs/shared/crypto';
import { audit, sql } from '@autojobs/shared/db';
import type { FormState } from '@autojobs/shared/forms';
import { startTopup, type Topup } from '@autojobs/shared/payments';
import { withAmount } from '@autojobs/shared/qris';
import { getQris } from '@autojobs/shared/settings';
import { proofMime } from '@autojobs/shared/tokens';

const MAX_PROOF = 5 * 1024 * 1024;

export type Checkout = { id: string; tokens: number; price: number; amount: number; expiresAt: string; qr: string; png: string };

// The pop-up's content: the amount to pay and a QR that already carries it, as SVG to scan from the screen and as PNG
// to save (paying from the same phone: banking apps scan a picture from the gallery). Error correction L keeps the
// ~200-character QRIS at the fewest, largest modules (a screen isn't torn or dirty); margin 4 is the standard white border.
const QR = { margin: 4, errorCorrectionLevel: 'L' } as const;
const checkout = async (t: Topup, payload: string): Promise<Checkout> => ({
  id: t.id, tokens: t.tokens, price: t.price, amount: t.amount, expiresAt: new Date(t.expiresAt).toISOString(),
  qr: await QRCode.toString(payload, { ...QR, type: 'svg' }),
  png: await QRCode.toDataURL(payload, { ...QR, width: 720 }),
});

// "Beli": a purchase with its own unique amount (or the user's open one for this pack).
export async function buyPack(packId: number): Promise<Checkout | { error: string }> {
  const user = await requireUser();
  const r = await startTopup(user.id, packId);
  if ('error' in r) return r;
  revalidatePath('/token');
  return checkout(r.topup, r.payload);
}

// "Lanjutkan" in the history: the same purchase again (its amount stays reserved while it is pending).
export async function resumeTopup(id: string): Promise<Checkout | { error: string }> {
  const user = await requireUser();
  const [t] = await sql<Topup[]>`select id, tokens, price, amount, status, expires_at, created_at from topups
    where id = ${id} and user_id = ${user.id} and status = 'pending'`;
  const qris = await getQris();
  if (!t) return { error: 'Pembayaran ini sudah diproses. Muat ulang halaman.' };
  if (!qris?.payload) return { error: 'Pembayaran QRIS belum tersedia. Coba lagi nanti.' };
  return checkout(t, withAmount(qris.payload, t.amount));
}

// The pop-up asks every few seconds whether the payment has been seen.
export async function topupStatus(id: string): Promise<string | null> {
  const user = await requireUser();
  const [t] = await sql<{ status: string }[]>`select status from topups where id = ${id} and user_id = ${user.id}`;
  return t?.status ?? null;
}

// Backup: paid but not recognised (e.g. a mistyped amount on the static QRIS): the transfer proof, for an admin to
// approve. Also after the 24 h reservation ran out.
export async function attachProof(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const file = fd.get('proof');
  if (!(file instanceof File) || file.size === 0) return { error: 'Pilih file bukti pembayaran terlebih dulu.' };
  if (file.size > MAX_PROOF) return { error: 'Ukuran bukti pembayaran maksimal 5 MB.' };
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = proofMime(buf);
  if (!mime) return { error: 'Bukti pembayaran harus berupa gambar (JPG, PNG, WebP) atau PDF.' };
  const [t] = await sql<{ proofKey: string | null }[]>`select proof_key from topups where id = ${id} and user_id = ${user.id} and status in ('pending', 'expired')`;
  if (!t) return { error: 'Pembayaran ini sudah diproses. Muat ulang halaman.' };
  const key = await saveFile(buf);
  await sql`update topups set proof_key = ${key}, proof_mime = ${mime} where id = ${id}`;
  await deleteFile(t.proofKey); // a replaced proof
  await audit(user.id, 'topup_proof_sent', { topupId: id });
  revalidatePath('/token');
  return { ok: 'Bukti terkirim. Admin akan memeriksanya; token ditambahkan setelah disetujui.' };
}
