// Token payments against a real PostgreSQL: QRIS with the amount filled in, unique amounts, reading amounts from DANA
// notifications, and the phone's notification endpoint paying each purchase exactly once.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sql } from '@autojobs/shared/db';
import { newHookKey, pickAmount, receivedAmount, startTopup } from '@autojobs/shared/payments';
import { crc16, isQris, withAmount } from '@autojobs/shared/qris';
import { POST } from '../src/app/api/payments/notify/route';

const tag = `pay-test-${Date.now()}`;
const tlv = (pairs: [string, string][]) => pairs.map(([id, v]) => `${id}${String(v.length).padStart(2, '0')}${v}`).join('');
const body = tlv([['00', '01'], ['01', '11'], ['26', '0011ID.DANA.WWW'], ['52', '5812'], ['53', '360'], ['58', 'ID'], ['59', 'AUTOJOBS'], ['60', 'JAKARTA']]) + '6304';
const STATIC = body + crc16(body);

// The test borrows the settings rows the console uses; the real ones are put back afterwards.
const KEYS = ['qris', 'payment_hook'];
let saved: { key: string; value: unknown }[] = [];
before(async () => {
  saved = await sql<{ key: string; value: unknown }[]>`select key, value from settings where key in ${sql(KEYS)}`;
  await sql`delete from settings where key in ${sql(KEYS)}`;
  await sql`insert into settings (key, value) values ('qris', ${sql.json({ fileKey: 'none', mime: 'image/png', payload: STATIC })})`;
});

test('QRIS: CRC-16/CCITT-FALSE, and the static code becomes a dynamic one carrying the amount', () => {
  assert.equal(crc16('123456789'), '29B1');
  assert.ok(isQris(STATIC));
  const dyn = withAmount(STATIC, 29957);
  assert.ok(isQris(dyn), 'CRC recomputed');
  assert.match(dyn, /^000201010212/, 'point of initiation 12 = dynamic');
  assert.match(dyn, /53033605405299575802ID/, 'amount (tag 54) right after the currency, before the country');
  assert.ok(!isQris(STATIC.slice(0, -1) + '0'), 'a broken CRC is refused');
});

test('unique amounts: price minus 1–99 first, then minus 100–999, at most 10% off, never the round price', () => {
  const taken = new Set(Array.from({ length: 99 }, (_, i) => 30000 - (i + 1)).filter((a) => a !== 29950));
  assert.equal(pickAmount(30000, taken), 29950, 'the only free code in 1–99');
  taken.add(29950);
  const wide = pickAmount(30000, taken)!;
  assert.ok(wide <= 29900 && wide >= 29001, `then 100–999 (got ${wide})`);
  for (let i = 0; i < 50; i++) assert.ok(pickAmount(1000, new Set())! >= 900, 'a Rp1.000 pack: at most Rp100 off');
  const allCodes = new Set(Array.from({ length: 100 }, (_, i) => 1000 - (i + 1)));
  assert.equal(pickAmount(1000, allCodes), null, 'every code taken: try again, never the round price people type in');
  assert.equal(pickAmount(1, new Set()), 1, 'a Rp1 test pack (too small for a code) is paid exactly');
  assert.equal(pickAmount(1, new Set([1])), null, '...by one buyer at a time');
});

test('the received amount in notification texts; the payer\'s name and the balance never count', () => {
  const amount = (t: string) => receivedAmount(t)?.amount ?? null;
  assert.equal(amount('Kamu menerima Rp29.910 dari Budi'), 29910);
  assert.equal(amount('Pembayaran Rp 29.910,00 berhasil'), 29910);
  assert.equal(amount('IDR 29,910.00 received'), 29910);
  assert.equal(amount('Rp.5.000 masuk.'), 5000);
  assert.equal(amount('Saldo Rp1.250.000. Masuk Rp29.910.'), 29910, 'the merchant balance is not a payment');
  assert.equal(amount('Saldo DANA Rp1.250.000 · Kamu menerima Rp29.910 dari BUDI'), 29910);
  assert.equal(amount('Selamat datang di DANA'), null);
  assert.deepEqual(receivedAmount('Kamu menerima Rp1.000 dari Rp49.950'), { amount: 1000, sure: true }, 'a payer named like an amount');
  assert.equal(receivedAmount('Kamu menerima Rp1.000 (Rp49.950)')?.sure, false, 'two amounts left: an admin decides');
});

test('a forwarded notification pays the purchase with its amount, exactly once', async () => {
  const [a] = await sql`insert into users (email, password_hash, consent_at, email_verified_at) values (${tag + '-a@example.test'}, 'x', now(), now()) returning id, tokens`;
  const [b] = await sql`insert into users (email, password_hash, consent_at, email_verified_at) values (${tag + '-b@example.test'}, 'x', now(), now()) returning id, tokens`;
  const [pack] = await sql`insert into token_packs (tokens, price, active) values (7, 21000, true) returning id`;
  const key = await newHookKey();
  const post = (text: string, o: { key?: string; json?: boolean; form?: boolean; query?: boolean } = {}) => POST(new Request(
    `http://localhost/api/payments/notify${o.query ? `?key=${o.key ?? key}` : ''}`,
    {
      method: 'POST', body: text,
      headers: {
        'content-type': o.json ? 'application/json' : o.form ? 'application/x-www-form-urlencoded' : 'text/plain',
        ...(o.query ? {} : { authorization: `Bearer ${o.key ?? key}` }),
      },
    },
  ));
  const result = async (r: Response) => ((await r.json()) as { result: string }).result;
  try {
    const first = await startTopup(a.id, pack.id);
    assert.ok('topup' in first);
    const again = await startTopup(a.id, pack.id);
    assert.ok('topup' in again && again.topup.id === first.topup.id, 'the open purchase is reused');
    await sql`update topups set expires_at = now() - interval '1 minute' where id = ${first.topup.id}`; // QR window passed
    const reopened = await startTopup(a.id, pack.id);
    assert.ok('topup' in reopened && reopened.topup.id === first.topup.id && new Date(reopened.topup.expiresAt) > new Date(),
      'the same unpaid purchase reopens for another 15 minutes (its amount is still reserved)');
    const other = await startTopup(b.id, pack.id);
    assert.ok('topup' in other && other.topup.amount !== first.topup.amount, 'another buyer gets another amount');
    assert.ok(first.topup.amount >= 21000 - 99 && first.topup.amount < 21000);

    assert.equal((await post('ping', { key: 'salah' })).status, 401, 'a wrong key is refused');
    assert.equal(await result(await post('ping')), 'ping');

    // A's payment (the balance is mentioned first: the amount a purchase waits for wins), then the same notification again.
    const textA = `Saldo DANA Rp1.250.000 · Kamu menerima Rp${first.topup.amount.toLocaleString('id-ID')} dari BUDI ${tag}`;
    assert.equal(await result(await post(textA)), 'paid');
    assert.equal(await result(await post(textA)), 'duplicate', 'Android posted it twice: credited once');
    assert.equal(await result(await post(textA, { form: true })), 'duplicate', 'plain text labelled as a form is still read (not a ping)');
    const [paid] = await sql`select status, method from topups where id = ${first.topup.id}`;
    assert.deepEqual({ ...paid }, { status: 'paid', method: 'dana' });

    // B's payment as JSON (title + text), key in the URL; then noise.
    const bAmount = (other as { topup: { amount: number } }).topup.amount;
    const json = JSON.stringify({ title: 'Pembayaran diterima', text: `Rp${bAmount.toLocaleString('id-ID')} dari ANI ${tag}` });
    assert.equal(await result(await post(json, { json: true, query: true })), 'paid');
    assert.equal(await result(await post(`Kamu menerima Rp12.345 ${tag}`)), 'unmatched', 'an unknown payment waits for an admin');
    assert.equal(await result(await post('Selamat datang di DANA')), 'no_amount');

    const tokens = await sql<{ tokens: number }[]>`select tokens from users where id in (${a.id}, ${b.id}) order by email`;
    assert.deepEqual(tokens.map((t) => t.tokens), [a.tokens + 7, b.tokens + 7], 'each buyer credited once');
  } finally {
    await sql`delete from dana_transactions where raw->>'text' like ${'%' + tag + '%'}`;
    await sql`delete from users where email like ${tag + '%'}`;
    await sql`delete from token_packs where id = ${pack.id}`;
  }
});

after(async () => {
  await sql`delete from settings where key in ${sql(KEYS)}`;
  for (const s of saved) await sql`insert into settings (key, value) values (${s.key}, ${sql.json(s.value as never)})`;
  await sql.end();
});
