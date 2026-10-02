'use server';

import { revalidatePath } from 'next/cache';
import { isAdminEmail, requireAdmin } from '@autojobs/shared/auth';
import { audit, sql } from '@autojobs/shared/db';
import type { FormState } from '@autojobs/shared/forms';

// Add or remove tokens (compensation, refunds) with a reason; the balance never goes below 0. Audited.
export async function adjustTokens(userId: string, _: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const delta = Math.trunc(Number(fd.get('delta')));
  const reason = String(fd.get('reason') ?? '').trim().slice(0, 300);
  if (!delta || Math.abs(delta) > 1000) return { error: 'Isi jumlah token antara -1000 dan 1000, selain 0.' };
  if (!reason) return { error: 'Tulis alasannya. Alasan dicatat di audit.' };
  const balance = await sql.begin(async (tx) => {
    const [u] = await tx<{ tokens: number }[]>`update users set tokens = tokens + ${delta} where id = ${userId} and tokens + ${delta} >= 0 returning tokens`;
    if (u) await audit(userId, 'tokens_adjusted', { delta, reason, balance: u.tokens }, admin.id, tx);
    return u?.tokens ?? null;
  });
  if (balance == null) return { error: 'Saldo token tidak boleh kurang dari 0.' };
  revalidatePath(`/users/${userId}`);
  return { ok: `Token ${delta > 0 ? 'ditambah' : 'dikurangi'} ${Math.abs(delta)}. Saldo sekarang ${balance}.` };
}

// Suspend: no sign-in (sessions ended), the extension pauses its queue (403), searches wait. Admin accounts can't be
// suspended here (remove them from ADMIN_EMAILS first).
export async function setSuspended(userId: string, _: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const on = fd.get('on') === '1';
  const reason = String(fd.get('reason') ?? '').trim().slice(0, 300);
  if (on && !reason) return { error: 'Tulis alasan penangguhan. Alasan dicatat di audit.' };
  // An admin is an address on ADMIN_EMAILS: one taken off the list can be suspended (and loses the role) like anyone.
  const [target] = await sql<{ email: string }[]>`select email from users where id = ${userId}`;
  if (!target) return { error: 'Akun tidak ditemukan.' };
  if (on && isAdminEmail(target.email)) return { error: 'Akun admin tidak bisa ditangguhkan. Hapus dulu dari ADMIN_EMAILS.' };
  const [u] = await sql`update users set suspended_at = ${on ? new Date() : null}, role = case when ${on} then 'user' else role end
    where id = ${userId} and (suspended_at is null) = ${on} returning id`;
  if (!u) return { error: on ? 'Akun ini sudah ditangguhkan.' : 'Akun ini tidak sedang ditangguhkan.' };
  if (on) await sql`delete from sessions where user_id = ${userId}`; // paired extensions get 403 while suspended
  await audit(userId, on ? 'user_suspended' : 'user_unsuspended', reason ? { reason } : undefined, admin.id);
  revalidatePath(`/users/${userId}`);
  return { ok: on ? 'Akun ditangguhkan.' : 'Akun aktif kembali. Pengguna bisa masuk lagi.' };
}
