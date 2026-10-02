'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  checkEmailCode, CODE_MINUTES, currentUser, endSession, grantFreeSearches, hashPassword, issueEmailCode, needsRehash,
  recordFailedAttempt, startSession, syncAdminRole, tooManyAttempts, verifyPassword,
} from '@autojobs/shared/auth';
import { audit, sql } from '@autojobs/shared/db';
import { appUrl, sendMail, validEmail } from '@/lib/mail';
import { CONSENT_COOKIE } from '@/lib/google';
import type { FormState } from '@autojobs/shared/forms';
import { SUSPENDED } from './suspended';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const RESET_COOKIE = 'reset_email'; // the address being reset, between "Lupa kata sandi" and entering the code
const ipOf = async () => (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
const secure = (process.env.APP_URL ?? '').startsWith('https');
const DAY = 24 * 3600_000;

// Emails a fresh one-time code: 'wait' when one was sent less than a minute ago, 'limit' after 8 codes in a day (with 5
// tries per code, a 6-digit code then can't be guessed by asking for new ones). The email is sent in the background,
// so the response takes as long whether or not the address is registered.
async function sendCode(userId: string, email: string, purpose: 'verify' | 'reset'): Promise<'sent' | 'wait' | 'limit'> {
  const daily = `code|${purpose}|${userId}`;
  if (tooManyAttempts(daily, 8, DAY)) return 'limit';
  const code = await issueEmailCode(userId, purpose);
  if (!code) return 'wait';
  recordFailedAttempt(daily);
  const [subject, what] = purpose === 'verify'
    ? ['Kode verifikasi AutoJobs', 'memverifikasi email Anda']
    : ['Kode atur ulang kata sandi AutoJobs', 'membuat kata sandi baru'];
  void sendMail(email, `${code}: ${subject}`,
    `Kode untuk ${what}:\n\n    ${code}\n\nBerlaku ${CODE_MINUTES} menit. Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari AutoJobs.\nAbaikan email ini jika Anda tidak memintanya.`)
    .catch((e) => console.error('[mail] gagal mengirim kode', e));
  return 'sent';
}

export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  // "Daftar dengan Google": the same two consents first, then Google (the account is created on its return).
  if (fd.get('method') === 'google') {
    if (fd.get('consent') !== 'on' || fd.get('risk') !== 'on') return { error: 'Centang kedua persetujuan di atas tombol Buat akun dulu, lalu klik Daftar dengan Google.' };
    (await cookies()).set(CONSENT_COOKIE, '1', { httpOnly: true, sameSite: 'lax', secure, path: '/api/auth/google', maxAge: 600 });
    redirect(`${appUrl('/api/auth/google')}?mode=signup`);
  }
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (!validEmail(email)) return { error: 'Alamat email tidak valid.' };
  if (password.length < 8 || password.length > 200) return { error: 'Kata sandi minimal 8 karakter.' };
  // Sign-ups send an email each: a few per IP per hour, so nobody scripts mail to strangers or squats addresses.
  const byIp = `signup|${await ipOf()}`;
  if (tooManyAttempts(byIp, 10, 3600_000)) return { error: 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi dalam 1 jam.' };
  recordFailedAttempt(byIp);
  if (fd.get('consent') !== 'on') return { error: 'Anda perlu menyetujui Ketentuan Layanan dan pemrosesan data pribadi.' };
  if (fd.get('risk') !== 'on') return { error: 'Anda perlu menyatakan memahami risiko otomatisasi pada akun portal.' };
  // Always 'user': an address on ADMIN_EMAILS becomes admin only once it is verified (syncAdminRole).
  const [u] = await sql<{ id: string }[]>`insert into users (email, password_hash, role, consent_at)
    values (${email}, ${await hashPassword(password)}, 'user', now())
    on conflict do nothing returning id`;
  if (!u) return { error: 'Email sudah terdaftar. Silakan masuk.' };
  await sql`insert into candidate_profiles (user_id, email) values (${u.id}, ${email})`;
  await audit(u.id, 'signup', { consent: 'terms+privacy+automation-risk' });
  await sendCode(u.id, email, 'verify');
  await startSession(u.id);
  redirect('/verify-email');
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, 'email').toLowerCase().slice(0, 254);
  const password = String(fd.get('password') ?? '').slice(0, 200);
  // Per account (whatever the IP: no endless guessing from many addresses) and per IP (no spraying one password over
  // many accounts).
  const addr = await ipOf();
  const [acct, ip] = [`login|${email}`, `login-ip|${addr}`];
  if (tooManyAttempts(acct) || tooManyAttempts(ip, 30)) return { error: 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.' };
  const [u] = await sql<{ id: string; passwordHash: string | null; emailVerifiedAt: Date | null; suspendedAt: Date | null }[]>`
    select id, password_hash, email_verified_at, suspended_at from users where lower(email) = ${email}`;
  // Accounts made with Google have no password (until one is set via "Lupa kata sandi").
  const ok = u?.passwordHash ? await verifyPassword(password, u.passwordHash) : (await hashPassword(password), false); // same cost either way
  if (!u || !ok) {
    recordFailedAttempt(acct);
    recordFailedAttempt(ip);
    await audit(u?.id ?? null, 'login_failed', { email, ip: addr });
    return { error: 'Email atau kata sandi salah.' };
  }
  if (u.suspendedAt) return { error: SUSPENDED };
  if (needsRehash(u.passwordHash!)) await sql`update users set password_hash = ${await hashPassword(password)} where id = ${u.id}`;
  await syncAdminRole(u.id, email);
  await startSession(u.id);
  await audit(u.id, 'login', { ip: addr });
  redirect(u.emailVerifiedAt ? '/campaigns' : '/verify-email');
}

export async function logout() {
  await endSession();
  redirect('/login');
}

export async function resendVerification(_: FormState): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (u.emailVerifiedAt) redirect('/campaigns');
  const sent = await sendCode(u.id, u.email, 'verify');
  if (sent === 'wait') return { error: 'Tunggu 1 menit sebelum meminta kode baru.' };
  if (sent === 'limit') return { error: 'Terlalu sering meminta kode. Coba lagi besok.' };
  return { ok: 'Kode baru telah dikirim ke email Anda.' };
}

export async function verifyEmailCode(_: FormState, fd: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (u.emailVerifiedAt) redirect('/campaigns');
  const key = `verify|${u.id}`;
  if (tooManyAttempts(key)) return { error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' };
  const result = await checkEmailCode(u.id, 'verify', str(fd, 'code'));
  if (result !== 'ok') recordFailedAttempt(key);
  if (result === 'wrong') return { error: 'Kode salah. Periksa lagi email Anda.' };
  if (result === 'expired') return { error: 'Kode kedaluwarsa atau sudah terlalu sering salah. Klik "Kirim ulang kode".' };
  await sql`update users set email_verified_at = now() where id = ${u.id}`;
  await grantFreeSearches(u.id, u.email);
  await syncAdminRole(u.id, u.email);
  await audit(u.id, 'email_verified', { method: 'code' });
  redirect('/profile');
}

// Step 1: a code to the address (the same answer whether or not it's registered), then the code page.
export async function forgotPassword(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, 'email').toLowerCase();
  if (!validEmail(email)) return { error: 'Alamat email tidak valid.' };
  const addr = await ipOf();
  const byIp = `forgot|${addr}`;
  if (tooManyAttempts(byIp)) return { error: 'Terlalu banyak permintaan. Coba lagi dalam 15 menit.' };
  recordFailedAttempt(byIp);
  const [u] = await sql<{ id: string }[]>`select id from users where lower(email) = ${email}`;
  if (u) {
    await sendCode(u.id, email, 'reset');
    await audit(u.id, 'password_reset_requested', { ip: addr });
  }
  (await cookies()).set(RESET_COOKIE, email, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 60 });
  redirect('/reset-password');
}

// Step 2: the emailed code and the new password.
export async function resetPassword(_: FormState, fd: FormData): Promise<FormState> {
  const jar = await cookies();
  const email = jar.get(RESET_COOKIE)?.value ?? '';
  if (!email) redirect('/forgot-password');
  const password = String(fd.get('password') ?? '');
  if (password.length < 8 || password.length > 200) return { error: 'Kata sandi minimal 8 karakter.' };
  const [byIp, byAcct] = [`reset|${await ipOf()}`, `reset|${email}`];
  if (tooManyAttempts(byIp) || tooManyAttempts(byAcct)) return { error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' };
  const [u] = await sql<{ id: string }[]>`select id from users where lower(email) = ${email}`;
  const result = u ? await checkEmailCode(u.id, 'reset', str(fd, 'code')) : 'wrong';
  if (!u || result !== 'ok') {
    recordFailedAttempt(byIp);
    recordFailedAttempt(byAcct);
    return { error: result === 'expired' ? 'Kode kedaluwarsa atau sudah terlalu sering salah. Minta kode baru.' : 'Kode salah. Periksa lagi email Anda.' };
  }
  // The code proved the user owns the address, so it also counts as verification.
  await sql`update users set password_hash = ${await hashPassword(password)}, email_verified_at = coalesce(email_verified_at, now()) where id = ${u.id}`;
  // A new password locks out whoever had the old one: sessions, paired extensions (they can read the CV and answers)
  // and pending pairing codes all go.
  await sql`delete from sessions where user_id = ${u.id}`;
  await sql`delete from extension_tokens where user_id = ${u.id}`;
  await sql`delete from pairing_codes where user_id = ${u.id}`;
  await grantFreeSearches(u.id, email);
  await syncAdminRole(u.id, email);
  await audit(u.id, 'password_reset', { method: 'code' });
  jar.delete(RESET_COOKIE);
  await startSession(u.id);
  redirect('/campaigns');
}

export async function resendResetCode(_: FormState): Promise<FormState> {
  const email = (await cookies()).get(RESET_COOKIE)?.value ?? '';
  if (!email) redirect('/forgot-password');
  const byIp = `forgot|${await ipOf()}`;
  if (tooManyAttempts(byIp)) return { error: 'Terlalu banyak permintaan. Coba lagi dalam 15 menit.' };
  recordFailedAttempt(byIp);
  const [u] = await sql<{ id: string }[]>`select id from users where lower(email) = ${email}`;
  if (u) await sendCode(u.id, email, 'reset');
  // The same answer whether the address is registered or a code was sent a moment ago: nothing to learn from it.
  return { ok: 'Jika email terdaftar, kode baru sudah dikirim (paling cepat 1 menit sekali).' };
}
