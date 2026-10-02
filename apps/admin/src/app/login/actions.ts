'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  endSession, hashPassword, isAdminEmail, needsRehash, recordFailedAttempt, startSession, syncAdminRole, tooManyAttempts, verifyPassword,
} from '@autojobs/shared/auth';
import { audit, sql } from '@autojobs/shared/db';
import type { FormState } from '@autojobs/shared/forms';

// Console sign-in: the email and password of a verified AutoJobs account listed in ADMIN_EMAILS, its own session.
export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const [acct, byIp] = [`admin|${email}`, `admin-ip|${ip}`];
  if (tooManyAttempts(acct, 5) || tooManyAttempts(byIp)) return { error: 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.' };
  const [u] = await sql<{ id: string; passwordHash: string | null; emailVerifiedAt: Date | null; suspendedAt: Date | null }[]>`
    select id, password_hash, email_verified_at, suspended_at from users where lower(email) = ${email}`;
  const ok = u?.passwordHash ? await verifyPassword(password, u.passwordHash) : (await hashPassword(password), false); // same cost either way
  if (!u || !ok || !u.emailVerifiedAt || !isAdminEmail(email) || u.suspendedAt) {
    recordFailedAttempt(acct);
    recordFailedAttempt(byIp);
    await audit(u?.id ?? null, 'admin_login_failed', { email: email.slice(0, 254), ip });
    return { error: 'Email atau kata sandi salah, atau akun ini bukan admin.' };
  }
  if (needsRehash(u.passwordHash!)) await sql`update users set password_hash = ${await hashPassword(password)} where id = ${u.id}`;
  await syncAdminRole(u.id, email);
  await startSession(u.id, 'admin');
  await audit(u.id, 'admin_login', { ip }, u.id);
  redirect('/');
}

export async function logout() {
  await endSession('admin');
  redirect('/login');
}
