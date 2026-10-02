// Token rules against a real PostgreSQL (needs DATABASE_URL + migrations): 3 free tokens once per proven address,
// spending stops at 0 and never goes negative, admins spend none; only images and PDF count as transfer proof.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { emailKey, grantFreeSearches } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { proofMime, spendToken } from '@autojobs/shared/tokens';

const tag = `tokens-test-${Date.now()}`;
const tokensOf = async (id: string) => (await sql<{ tokens: number }[]>`select tokens from users where id = ${id}`)[0].tokens;

test('3 free tokens once per address when it is proven: aliases and new accounts for it get none', async () => {
  const email = `${tag}.free@gmail.com`;
  const [u] = await sql<{ id: string; tokens: number }[]>`insert into users (email, password_hash, consent_at)
    values (${email}, 'x', now()) returning id, tokens`;
  assert.equal(u.tokens, 0, 'nothing before the address is proven');
  await grantFreeSearches(u.id, email);
  await grantFreeSearches(u.id, email);
  assert.equal(await tokensOf(u.id), 3, 'given once');
  assert.equal(emailKey('A.B+x@GoogleMail.com'), emailKey('ab@gmail.com'), 'case, +tag, dots and googlemail ignored');
  const [v] = await sql<{ id: string }[]>`insert into users (email, password_hash, consent_at) values (${tag + '-alias@example.test'}, 'x', now()) returning id`;
  await grantFreeSearches(v.id, email.replace('@', '+again@'));
  assert.equal(await tokensOf(v.id), 0, 'an alias of an address that had them');
});

test('a search spends one token until none are left; admins spend none', async () => {
  const [u] = await sql<{ id: string; tokens: number }[]>`insert into users (email, password_hash, consent_at, tokens)
    values (${tag + '@example.test'}, 'x', now(), 3) returning id, tokens`;
  assert.equal(u.tokens, 3);
  const spend = (role: string) => sql.begin((tx) => spendToken(tx, { id: u.id, role }));
  assert.deepEqual([await spend('user'), await spend('user'), await spend('user'), await spend('user')], [true, true, true, false]);
  assert.equal(await spend('admin'), true);
  const [{ tokens }] = await sql<{ tokens: number }[]>`select tokens from users where id = ${u.id}`;
  assert.equal(tokens, 0);
  await assert.rejects(sql`update users set tokens = -1 where id = ${u.id}`, /check constraint/);
});

test('transfer proof is recognised by content: JPEG, PNG, WebP, PDF only', () => {
  const b = (s: string) => Buffer.from(s, 'latin1');
  assert.equal(proofMime(b('\xff\xd8\xff\xe0\0\x10JFIF')), 'image/jpeg');
  assert.equal(proofMime(b('\x89PNG\r\n\x1a\n\0\0\0\rIHDR')), 'image/png');
  assert.equal(proofMime(b('RIFF\x24\0\0\0WEBPVP8 ')), 'image/webp');
  assert.equal(proofMime(b('%PDF-1.7\n')), 'application/pdf');
  assert.equal(proofMime(b('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')), null);
  assert.equal(proofMime(b('RIFF\x24\0\0\0WAVEfmt ')), null);
});

after(async () => {
  await sql`delete from free_grants where user_id in (select id from users where email like ${tag + '%'})`;
  await sql`delete from users where email like ${tag + '%'}`;
  await sql.end();
});
