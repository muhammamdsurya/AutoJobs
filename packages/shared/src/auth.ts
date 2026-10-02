import { randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { randomToken, sha256 } from './crypto';
import { sql } from './db';
import { FREE_SEARCHES } from './tokens';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts?: ScryptOptions) => Promise<Buffer>;

// scrypt N=2^15, r=8, p=3: one of OWASP's equivalent settings, 32 MiB per hash (N=2^17 would need 128 MiB per login
// on a small VPS). "scrypt$" hashes from before used Node's defaults (N=2^14, p=1): they still verify, and the
// sign-in actions upgrade them (needsRehash).
const COST: ScryptOptions = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt2$${salt.toString('base64')}$${(await scryptAsync(pw, salt, 64, COST)).toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [kind, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  return timingSafeEqual(await scryptAsync(pw, Buffer.from(salt, 'base64'), expected.length, kind === 'scrypt2' ? COST : undefined), expected);
}

export const needsRehash = (stored: string) => !stored.startsWith('scrypt2$');

// 'web': the app (30 days). 'admin': the admin console (apps/admin), its own cookie and a shorter life; cookies don't
// separate ports, so on localhost the names must differ.
export type Scope = 'web' | 'admin';
const COOKIE: Record<Scope, string> = { web: 'sid', admin: 'admin_sid' };
const SESSION_HOURS: Record<Scope, number> = { web: 30 * 24, admin: 12 };

export async function startSession(userId: string, scope: Scope = 'web') {
  const token = randomToken();
  await sql`insert into sessions (token_hash, user_id, expires_at, scope)
    values (${sha256(token)}, ${userId}, now() + ${SESSION_HOURS[scope]} * interval '1 hour', ${scope})`;
  (await cookies()).set(COOKIE[scope], token, {
    httpOnly: true,
    sameSite: 'lax',
    // Always in production (browsers also accept Secure cookies on http://localhost); in development only over https.
    secure: process.env.NODE_ENV === 'production' || ((scope === 'admin' ? process.env.ADMIN_URL : process.env.APP_URL) ?? '').startsWith('https'),
    path: '/',
    maxAge: SESSION_HOURS[scope] * 3600,
  });
}

export async function endSession(scope: Scope = 'web') {
  const jar = await cookies();
  const token = jar.get(COOKIE[scope])?.value;
  if (token) await sql`delete from sessions where token_hash = ${sha256(token)}`;
  jar.delete(COOKIE[scope]);
}

export type User = { id: string; email: string; role: 'user' | 'admin'; emailVerifiedAt: Date | null };

// A suspended account has no valid session anywhere.
const sessionUser = cache(async (scope: Scope): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE[scope])?.value;
  if (!token) return null;
  const [u] = await sql<User[]>`select u.id, u.email, u.role, u.email_verified_at from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.scope = ${scope} and s.expires_at > now() and u.suspended_at is null`;
  if (!u) return null;
  // ADMIN_EMAILS decides who is an admin (console, unlimited searches): a verified account on that list. Taking an
  // address off the list, or an unverified sign-up with a listed address, means no admin rights whatever `role` says.
  return { ...u, role: u.role === 'admin' && u.emailVerifiedAt && isAdminEmail(u.email) ? 'admin' : 'user' };
});

export const currentUser = () => sessionUser('web');

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (!u.emailVerifiedAt) redirect('/verify-email');
  return u;
}

// Admin console pages and actions: its own session, admins only.
export async function requireAdmin(): Promise<User> {
  const u = await sessionUser('admin');
  if (u?.role !== 'admin') redirect('/login');
  return u;
}

export const isAdminEmail = (email: string) =>
  (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

// An email address in its normal form (case, "+tag" and Gmail dots ignored), hashed: who already had free searches.
export function emailKey(email: string) {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@');
  const name = local.split('+')[0];
  return sha256(domain === 'gmail.com' || domain === 'googlemail.com' ? `${name.replaceAll('.', '')}@gmail.com` : `${name}@${domain}`);
}

// FREE_SEARCHES once per address, when the address is proven (email code, Google): aliases, new accounts for the same
// address and re-registrations after deleting an account get none. Safe to call again for the same account.
export async function grantFreeSearches(userId: string, email: string) {
  const [fresh] = await sql`insert into free_grants (email_hash, user_id) values (${emailKey(email)}, ${userId}) on conflict do nothing returning 1`;
  if (fresh) await sql`update users set tokens = tokens + ${FREE_SEARCHES} where id = ${userId}`;
}

// users.role follows ADMIN_EMAILS for verified accounts only: promoted when listed, demoted when taken off.
export async function syncAdminRole(userId: string, email: string) {
  await sql`update users set role = ${isAdminEmail(email) ? 'admin' : 'user'} where id = ${userId} and email_verified_at is not null`;
}

// One-time codes (OTP) sent by email: 6 digits, 10 minutes, 5 tries, a new one at most once a minute.
export type CodePurpose = 'verify' | 'reset';
export const CODE_MINUTES = 10;
const CODE_TRIES = 5;
const codeHash = (userId: string, code: string) => sha256(`${userId}:${code}`);

// A new code (replacing the previous one), or null when one was sent less than a minute ago.
export async function issueEmailCode(userId: string, purpose: CodePurpose): Promise<string | null> {
  const [recent] = await sql`select 1 from email_codes where user_id = ${userId} and purpose = ${purpose} and sent_at > now() - interval '60 seconds'`;
  if (recent) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await sql`insert into email_codes (user_id, purpose, code_hash, expires_at) values (${userId}, ${purpose}, ${codeHash(userId, code)}, now() + ${CODE_MINUTES} * interval '1 minute')
    on conflict (user_id, purpose) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = now()`;
  return code;
}

// 'ok' uses the code up; after too many wrong tries (or once expired) the code is gone and a new one is needed.
export async function checkEmailCode(userId: string, purpose: CodePurpose, code: string): Promise<'ok' | 'wrong' | 'expired'> {
  const [row] = await sql<{ codeHash: string; expired: boolean; attempts: number }[]>`update email_codes set attempts = attempts + 1
    where user_id = ${userId} and purpose = ${purpose} returning code_hash, expires_at < now() as expired, attempts`;
  if (!row || row.expired || row.attempts > CODE_TRIES) {
    await sql`delete from email_codes where user_id = ${userId} and purpose = ${purpose}`;
    return 'expired';
  }
  const given = Buffer.from(codeHash(userId, code.replace(/\D/g, '')));
  if (!timingSafeEqual(given, Buffer.from(row.codeHash))) return 'wrong';
  await sql`delete from email_codes where user_id = ${userId} and purpose = ${purpose}`;
  return 'ok';
}

// ponytail: in-memory brute-force guard per web process; move to the DB when running several web instances
const attempts = new Map<string, number[]>();
export function tooManyAttempts(key: string, max = 10, windowMs = 15 * 60_000) {
  const recent = (attempts.get(key) ?? []).filter((t) => Date.now() - t < windowMs);
  if (recent.length) attempts.set(key, recent);
  else attempts.delete(key);
  return recent.length >= max;
}
export function recordFailedAttempt(key: string) {
  // Keys of long-gone attempts are dropped now and then, so the map can't grow without bound.
  if (attempts.size > 10_000) for (const [k, ts] of attempts) if (Date.now() - ts[ts.length - 1] > 24 * 3600_000) attempts.delete(k);
  attempts.set(key, [...(attempts.get(key) ?? []), Date.now()]);
}
