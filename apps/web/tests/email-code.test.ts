// One-time codes by email (sign-up verification, forgotten password): the rules that keep a 6-digit code safe.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { checkEmailCode, issueEmailCode } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';

const tag = `code-test-${Date.now()}`;

test('email codes: 6 digits, one use, a minute between sends, voided after 5 wrong tries or when expired', async () => {
  const [u] = await sql`insert into users (email, password_hash, consent_at) values (${tag + '@example.test'}, 'x', now()) returning id`;
  const code = (await issueEmailCode(u.id, 'verify'))!;
  assert.match(code, /^\d{6}$/);
  assert.equal(await issueEmailCode(u.id, 'verify'), null, 'no second code within a minute');
  const [{ codeHash }] = await sql`select code_hash from email_codes where user_id = ${u.id}`;
  assert.ok(!codeHash.includes(code), 'only a hash is stored');

  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal(await checkEmailCode(u.id, 'verify', wrong), 'wrong');
  assert.equal(await checkEmailCode(u.id, 'reset', code), 'expired', 'a verify code is not a reset code');
  assert.equal(await checkEmailCode(u.id, 'verify', ` ${code.slice(0, 3)} ${code.slice(3)} `), 'ok', 'spaces are ignored');
  assert.equal(await checkEmailCode(u.id, 'verify', code), 'expired', 'used up');

  // Five wrong tries void the code, even the right one afterwards.
  await sql`delete from email_codes where user_id = ${u.id}`;
  const second = (await issueEmailCode(u.id, 'reset'))!;
  for (let i = 0; i < 5; i++) assert.equal(await checkEmailCode(u.id, 'reset', second === '000000' ? '111111' : '000000'), 'wrong');
  assert.equal(await checkEmailCode(u.id, 'reset', second), 'expired');

  // Expired after 10 minutes.
  await sql`delete from email_codes where user_id = ${u.id}`;
  const third = (await issueEmailCode(u.id, 'reset'))!;
  await sql`update email_codes set expires_at = now() - interval '1 second' where user_id = ${u.id}`;
  assert.equal(await checkEmailCode(u.id, 'reset', third), 'expired');
});

after(async () => {
  await sql`delete from users where email like ${tag + '%'}`;
  await sql.end();
});
