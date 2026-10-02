// Sign in / sign up with Google: OAuth 2.0 authorization-code flow with PKCE, straight against Google's endpoints.
// The ID token comes from Google's token endpoint over TLS, so its claims are checked without verifying the signature
// (OpenID Connect Core 3.1.3.7).
import { createHash, randomBytes } from 'node:crypto';
import { appUrl } from './mail';

export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const GOOGLE_REDIRECT_PATH = '/api/auth/google/callback';
export const STATE_COOKIE = 'g_oauth';
export const CONSENT_COOKIE = 'g_consent'; // the sign-up form's ticked consents, on their way to the Google route

const b64url = (b: Buffer) => b.toString('base64url');

export type Mode = 'login' | 'signup';

// A fresh state + PKCE verifier (kept in a short-lived cookie) and the Google consent-screen URL.
export function authRequest(mode: Mode) {
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(32));
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: appUrl(GOOGLE_REDIRECT_PATH),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { url: url.toString(), cookie: JSON.stringify({ state, verifier, mode }) };
}

export type GoogleProfile = { sub: string; email: string; name: string };

// Exchanges the code and returns the verified account, or throws with a message for the user.
export async function finishAuth(code: string, verifier: string): Promise<GoogleProfile> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: appUrl(GOOGLE_REDIRECT_PATH),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { id_token?: string; error_description?: string };
  if (!res.ok || !data.id_token) throw new Error(`Google menolak masuk: ${data.error_description ?? res.status}`);
  const claims = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString('utf8'));
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('Token Google tidak ditujukan untuk aplikasi ini.');
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)) throw new Error('Token Google tidak sah.');
  if (!(claims.exp * 1000 > Date.now())) throw new Error('Token Google kedaluwarsa. Coba lagi.');
  if (claims.email_verified !== true || !claims.email) throw new Error('Email akun Google ini belum terverifikasi.');
  return { sub: String(claims.sub), email: String(claims.email).toLowerCase(), name: String(claims.name ?? '') };
}
