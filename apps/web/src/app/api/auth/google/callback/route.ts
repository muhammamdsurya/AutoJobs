import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { grantFreeSearches, isAdminEmail, startSession, syncAdminRole } from '@autojobs/shared/auth';
import { audit, sql } from '@autojobs/shared/db';
import { finishAuth, STATE_COOKIE, type GoogleProfile, type Mode } from '@/lib/google';

// Google sends the user back here. Same Google account or same (Google-verified) email → that AutoJobs account;
// otherwise a new account, but only when this started from the sign-up form with both consents ticked.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const saved = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: '/api/auth/google' });
  if (url.searchParams.get('error')) redirect('/login'); // cancelled on Google's screen
  let s: { state: string; verifier: string; mode: Mode };
  try {
    s = JSON.parse(saved ?? '');
  } catch {
    redirect('/login?error=google_state');
  }
  if (!s.state || s.state !== url.searchParams.get('state')) redirect('/login?error=google_state');

  let g: GoogleProfile;
  try {
    g = await finishAuth(url.searchParams.get('code') ?? '', s.verifier);
  } catch (e) {
    console.error('[google]', e);
    redirect('/login?error=google');
  }

  const [found] = await sql<{ id: string; email: string; googleSub: string | null; emailVerifiedAt: Date | null; suspendedAt: Date | null }[]>`
    select id, email, google_sub, email_verified_at, suspended_at from users
    where google_sub = ${g.sub} or lower(email) = ${g.email} order by (google_sub = ${g.sub}) desc nulls last limit 1`;
  if (found?.suspendedAt) redirect('/login?error=suspended');
  if (found) {
    // An unverified account with this address may have been signed up by someone else (signing up doesn't prove the
    // address). Google proves it now, so whatever that sign-up left (password, sessions, paired extensions) goes.
    if (!found.emailVerifiedAt) {
      await sql`update users set password_hash = null where id = ${found.id}`;
      await sql`delete from sessions where user_id = ${found.id}`;
      await sql`delete from extension_tokens where user_id = ${found.id}`;
      await sql`delete from pairing_codes where user_id = ${found.id}`;
    }
    await sql`update users set google_sub = ${g.sub}, email_verified_at = coalesce(email_verified_at, now()) where id = ${found.id}`;
    await grantFreeSearches(found.id, found.email);
    await syncAdminRole(found.id, found.email);
    if (!found.googleSub) await audit(found.id, 'google_linked', { email: g.email, wasVerified: !!found.emailVerifiedAt });
    await startSession(found.id);
    redirect('/campaigns');
  }
  if (s.mode !== 'signup') {
    // Not an error: this Google account just has no AutoJobs account yet. The sign-up page says so (by name, via a
    // short-lived cookie rather than the URL) and offers to create it.
    jar.set('g_unregistered', g.email, { httpOnly: true, sameSite: 'lax', secure: (process.env.APP_URL ?? '').startsWith('https'), path: '/', maxAge: 600 });
    redirect('/signup?error=google_new');
  }

  const [u] = await sql<{ id: string }[]>`insert into users (email, password_hash, google_sub, role, consent_at, email_verified_at)
    values (${g.email}, null, ${g.sub}, ${isAdminEmail(g.email) ? 'admin' : 'user'}, now(), now()) returning id`;
  await sql`insert into candidate_profiles (user_id, email, full_name) values (${u.id}, ${g.email}, ${g.name.slice(0, 200)})`;
  await grantFreeSearches(u.id, g.email);
  await audit(u.id, 'signup', { method: 'google', consent: 'terms+privacy+automation-risk' });
  await startSession(u.id);
  redirect('/profile');
}
