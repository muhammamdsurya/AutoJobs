import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authRequest, CONSENT_COOKIE, googleEnabled, STATE_COOKIE } from '@/lib/google';
import { appUrl } from '@/lib/mail';

// Starts "Masuk/Daftar dengan Google". Sign-up arrives here only from the sign-up form, after both consents were ticked.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!googleEnabled()) redirect('/login?error=google_off');
  // The state cookie must live on the host Google sends the user back to (APP_URL), e.g. localhost vs 127.0.0.1.
  const home = new URL(appUrl('/'));
  // The browser's Host header: req.url reports Next's own hostname (localhost) even when opened as 127.0.0.1.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  if (host !== home.host) redirect(appUrl(url.pathname + url.search));
  const mode = url.searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  // The consents ticked on the sign-up form arrive as a short-lived cookie set by that form's action: a plain link to
  // this route can't claim them.
  const jar = await cookies();
  const consented = jar.get(CONSENT_COOKIE)?.value === '1';
  jar.delete({ name: CONSENT_COOKIE, path: '/api/auth/google' });
  if (mode === 'signup' && !consented) redirect('/signup?error=consent');
  const { url: google, cookie } = authRequest(mode);
  jar.set(STATE_COOKIE, cookie, {
    httpOnly: true, sameSite: 'lax', secure: home.protocol === 'https:', path: '/api/auth/google', maxAge: 600,
  });
  redirect(google);
}
