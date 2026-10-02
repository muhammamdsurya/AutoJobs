'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@autojobs/shared/auth';
import { audit, sql } from '@autojobs/shared/db';
import type { FormState } from '@autojobs/shared/forms';
import { creditTopup } from '@autojobs/shared/payments';

const UNPAID = ['pending', 'expired']; // an admin may still credit a purchase whose 24 h reservation has run out

function done(ok: string): FormState {
  revalidatePath('/payments');
  return { ok };
}

// Backup path: the user's transfer proof checks out, so the purchase is paid.
export async function approveProof(id: string): Promise<FormState> {
  const admin = await requireAdmin();
  const t = await sql.begin((tx) => creditTopup(tx, id, 'proof', { by: admin.id, from: UNPAID }));
  return t ? done(`Disetujui: ${t.tokens} token ditambahkan.`) : { error: 'Pembelian ini sudah diproses.' };
}

export async function rejectProof(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const note = String(fd.get('note') ?? '').trim().slice(0, 300);
  if (!note) return { error: 'Tulis alasan penolakan. Pengguna melihatnya di riwayat token.' };
  const [t] = await sql<{ userId: string }[]>`update topups set status = 'rejected', note = ${note}, decided_by = ${admin.id}
    where id = ${id} and status = any(${UNPAID}) and proof_key is not null returning user_id`;
  if (!t) return { error: 'Pembelian ini sudah diproses.' };
  await audit(t.userId, 'topup_rejected', { topupId: id, note }, admin.id);
  return done('Bukti ditolak.');
}

// The admin saw the money arrive (e.g. in the DANA app while the automatic check was down).
export async function markPaid(id: string): Promise<FormState> {
  const admin = await requireAdmin();
  const t = await sql.begin((tx) => creditTopup(tx, id, 'admin', { by: admin.id, from: UNPAID }));
  return t ? done(`Ditandai lunas: ${t.tokens} token ditambahkan.`) : { error: 'Pembelian ini sudah diproses.' };
}

// An incoming DANA payment no purchase matched (wrong amount typed, paid after 24 h, ...): credit it to a purchase.
export async function assignTransaction(trxId: string, _: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const topupId = String(fd.get('topupId') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(topupId)) return { error: 'Pilih pembelian yang dibayar dengan transaksi ini.' };
  const result = await sql.begin(async (tx) => {
    const [d] = await tx`select 1 from dana_transactions where trx_id = ${trxId} and status = 'unmatched' for update`;
    if (!d) return 'gone';
    const t = await creditTopup(tx, topupId, 'admin', { trxId, by: admin.id, from: UNPAID });
    if (!t) return 'paid';
    await tx`update dana_transactions set status = 'matched', topup_id = ${topupId} where trx_id = ${trxId}`;
    return t;
  });
  if (result === 'gone') return { error: 'Transaksi ini sudah dikaitkan atau diabaikan.' };
  if (result === 'paid') return { error: 'Pembelian itu sudah diproses. Pilih yang lain.' };
  return done(`Dikaitkan: ${result.tokens} token ditambahkan.`);
}

export async function ignoreTransaction(trxId: string): Promise<FormState> {
  const admin = await requireAdmin();
  const [d] = await sql<{ amount: number }[]>`update dana_transactions set status = 'ignored' where trx_id = ${trxId} and status = 'unmatched' returning amount`;
  if (!d) return { error: 'Transaksi ini sudah diproses.' };
  await audit(null, 'dana_transaction_ignored', { trxId, amount: d.amount }, admin.id);
  return done('Transaksi diabaikan.');
}
