// Sign in with Google: the ID token's claims decide who signs in, so every check must hold.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authRequest, finishAuth } from '../src/lib/google';

process.env.GOOGLE_CLIENT_ID = 'client-123.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'secret';

const token = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
const ok = { aud: 'client-123.apps.googleusercontent.com', iss: 'https://accounts.google.com', exp: Date.now() / 1000 + 600,
  sub: '1097', email: 'Budi@Gmail.com', email_verified: true, name: 'Budi Santoso' };

async function withGoogle(claims: object, fn: () => Promise<unknown>) {
  const real = globalThis.fetch;
  let body = '';
  globalThis.fetch = (async (_: unknown, init?: RequestInit) => {
    body = String(init?.body);
    return new Response(JSON.stringify({ id_token: token(claims) }), { status: 200 });
  }) as typeof fetch;
  try { return { result: await fn(), body }; } finally { globalThis.fetch = real; }
}

test('Google sign-in: PKCE request, and only a valid token for this app with a verified email gets in', async () => {
  const req = authRequest('signup');
  const url = new URL(req.url);
  const saved = JSON.parse(req.cookie);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), saved.state);
  assert.match(url.searchParams.get('redirect_uri')!, /\/api\/auth\/google\/callback$/);
  assert.equal(saved.mode, 'signup');

  const { result, body } = await withGoogle(ok, () => finishAuth('code-1', saved.verifier)) as { result: unknown; body: string };
  assert.deepEqual(result, { sub: '1097', email: 'budi@gmail.com', name: 'Budi Santoso' });
  assert.match(body, new RegExp(`code_verifier=${saved.verifier}`), 'the verifier goes to Google with the code');

  for (const [bad, why] of [
    [{ ...ok, aud: 'another-app' }, 'token for another app'],
    [{ ...ok, iss: 'https://evil.example' }, 'wrong issuer'],
    [{ ...ok, exp: Date.now() / 1000 - 1 }, 'expired'],
    [{ ...ok, email_verified: false }, 'unverified email'],
  ] as const) await assert.rejects(withGoogle(bad, () => finishAuth('code', 'v')), Error, why);
});
