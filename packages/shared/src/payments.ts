// Token purchases paid by QRIS, credited automatically: each purchase pays a unique amount (pack price minus a code).
// The merchant's Android phone forwards each DANA Bisnis "payment received" notification (MacroDroid → POST
// /api/payments/notify), and the amount in it pays the pending purchase with that amount. Backup: a transfer proof that
// an admin approves, or an admin assigning an unmatched payment.
import { timingSafeEqual } from 'node:crypto';
import type postgres from 'postgres';
import { randomToken, sha256 } from './crypto';
import { audit, sql } from './db';
import { withAmount } from './qris';
import { getQris } from './settings';
import type { Pack } from './tokens';

// An incoming payment (one DANA notification), recorded once in dana_transactions.
export type IncomingPayment = { id: string; amount: number; time: Date; raw: unknown };

export const PAY_MINUTES = 15; // a purchase's QR is payable this long; its amount stays reserved 24 h (late payments)
const MAX_OPEN = 3; // payable purchases per user at once, so nobody can reserve many amounts

export type Topup = { id: string; tokens: number; price: number; amount: number; status: string; expiresAt: Date; createdAt: Date };
const TOPUP_COLS = sql`id, tokens, price, amount, status, expires_at, created_at`;

export const getPacks = (all = false) =>
  sql<(Pack & { active: boolean })[]>`select id, tokens, price, active from token_packs where active or ${all} order by tokens, price`;

// A free amount for a pack price: price minus a code of 1–99, then 100–999, but never more than 10% off. Codes all
// taken → null ("try again"), never the round price: that is what people paying the static QRIS type in, and it would
// pay whoever held it. Only prices under Rp10 (test packs), too small for a code, are paid exactly, one buyer at a time.
export function pickAmount(price: number, taken: Set<number>): number | null {
  const maxCode = Math.min(999, Math.floor(price / 10));
  if (maxCode < 1) return taken.has(price) ? null : price;
  for (const [lo, hi] of [[1, Math.min(99, maxCode)], [100, maxCode]]) {
    const free: number[] = [];
    for (let code = lo; code <= hi; code++) if (!taken.has(price - code)) free.push(price - code);
    if (free.length) return free[Math.floor(Math.random() * free.length)];
  }
  return null;
}

// "Beli": the user's own unpaid purchase of this pack (its amount is still reserved; payable for another 15 minutes),
// or a new one with a fresh unique amount; with the QR payload.
export async function startTopup(userId: string, packId: number): Promise<{ topup: Topup; payload: string } | { error: string }> {
  const [pack] = await sql<Pack[]>`select id, tokens, price from token_packs where id = ${packId} and active`;
  if (!pack) return { error: 'Paket ini sudah tidak tersedia. Muat ulang halaman.' };
  const qris = await getQris();
  if (!qris?.payload) return { error: 'Pembayaran QRIS belum tersedia. Coba lagi nanti atau hubungi admin AutoJobs.' };
  const mine = await sql<Topup[]>`select ${TOPUP_COLS} from topups where user_id = ${userId} and status = 'pending' order by created_at desc`;
  const same = mine.find((t) => t.tokens === pack.tokens && t.price === pack.price);
  if (same) {
    const [t] = await sql<Topup[]>`update topups set expires_at = greatest(expires_at, now() + ${PAY_MINUTES} * interval '1 minute')
      where id = ${same.id} returning ${TOPUP_COLS}`;
    return { topup: t, payload: withAmount(qris.payload, t.amount) };
  }
  if (mine.filter((t) => new Date(t.expiresAt) > new Date()).length >= MAX_OPEN) return { error: `Selesaikan atau tunggu ${MAX_OPEN} pembayaran yang sedang berjalan dulu.` };
  for (let attempt = 0; attempt < 5; attempt++) {
    // Amounts of purchases from the last 48 h stay out too, even when already paid or expired: a late or repeated
    // notification for them then can't pay somebody else's new purchase.
    const taken = new Set((await sql<{ amount: number }[]>`select amount from topups
      where status = 'pending' or created_at > now() - interval '48 hours'`).map((r) => r.amount));
    const amount = pickAmount(pack.price, taken);
    if (amount == null) return { error: 'Sedang banyak pembayaran untuk paket ini. Coba lagi beberapa menit lagi.' };
    try {
      const [t] = await sql<Topup[]>`insert into topups (user_id, tokens, price, amount, expires_at)
        values (${userId}, ${pack.tokens}, ${pack.price}, ${amount}, now() + ${PAY_MINUTES} * interval '1 minute') returning ${TOPUP_COLS}`;
      await audit(userId, 'topup_started', { tokens: t.tokens, price: t.price, amount: t.amount });
      return { topup: t, payload: withAmount(qris.payload, t.amount) };
    } catch (e) {
      if ((e as { code?: string }).code !== '23505') throw e;
      // Either someone took this amount a moment ago (pick again), or a parallel "Beli" of this pack by the same user
      // just created one (one pending purchase per user and pack): that one is the answer.
      const [own] = await sql<Topup[]>`select ${TOPUP_COLS} from topups
        where user_id = ${userId} and tokens = ${pack.tokens} and price = ${pack.price} and status = 'pending'`;
      if (own) return { topup: own, payload: withAmount(qris.payload, own.amount) };
    }
  }
  return { error: 'Gagal membuat pembayaran. Coba lagi.' };
}

// Marks a purchase paid and adds its tokens, in the caller's transaction. Null when it isn't in one of `from` (already
// paid or rejected), so a payment can never be credited twice.
export async function creditTopup(tx: postgres.TransactionSql, id: string, method: 'dana' | 'proof' | 'admin',
  o: { trxId?: string; by?: string; from?: string[] } = {}) {
  const [t] = await tx<{ userId: string; tokens: number; amount: number }[]>`update topups
    set status = 'paid', paid_at = now(), method = ${method}, dana_trx_id = ${o.trxId ?? null}, decided_by = ${o.by ?? null}
    where id = ${id} and status = any(${o.from ?? ['pending']}) returning user_id, tokens, amount`;
  if (!t) return null;
  await tx`update users set tokens = tokens + ${t.tokens} where id = ${t.userId}`;
  await audit(t.userId, 'topup_paid', { topupId: id, tokens: t.tokens, amount: t.amount, method, trxId: o.trxId ?? null }, o.by ?? null, tx);
  return t;
}

// Each incoming payment is recorded once; one with the exact amount of a pending purchase made before it (5 min of
// clock skew allowed) pays that purchase, anything else waits in the console as "tidak dikenali".
export async function matchPayments(txs: IncomingPayment[]) {
  let credited = 0;
  for (const t of txs) {
    await sql.begin(async (tx) => {
      const [fresh] = await tx`insert into dana_transactions (trx_id, amount, paid_at, raw)
        values (${t.id}, ${t.amount}, ${t.time}, ${tx.json(t.raw as postgres.JSONValue)}) on conflict do nothing returning trx_id`;
      if (!fresh) return;
      const [p] = await tx<{ id: string }[]>`select id from topups where status = 'pending' and amount = ${t.amount}
        and created_at <= ${t.time}::timestamptz + interval '5 minutes' for update`;
      if (!p || !(await creditTopup(tx, p.id, 'dana', { trxId: t.id }))) return;
      await tx`update dana_transactions set status = 'matched', topup_id = ${p.id} where trx_id = ${t.id}`;
      credited++;
    });
  }
  return credited;
}

// The phone link (settings row 'payment_hook'): the key's hash, and what last arrived (for the console).
export type Hook = { keyHash?: string; createdAt?: string; lastSeenAt?: string; lastText?: string; lastResult?: NotifyResult };
export type NotifyResult = 'paid' | 'unmatched' | 'duplicate' | 'no_amount';
export async function getHook(): Promise<Hook> {
  const [r] = await sql<{ value: Hook }[]>`select value from settings where key = 'payment_hook'`;
  return r?.value ?? {};
}
const patchHook = (p: Hook) => sql`insert into settings (key, value) values ('payment_hook', ${sql.json(p)})
  on conflict (key) do update set value = settings.value || excluded.value`;

// A new key for the phone (shown once in the console; only its hash is kept); the old one stops working.
export async function newHookKey() {
  const key = randomToken();
  await patchHook({ keyHash: sha256(key), createdAt: new Date().toISOString() });
  return key;
}
export async function checkHookKey(key: string) {
  const { keyHash } = await getHook();
  return !!key && !!keyHash && timingSafeEqual(Buffer.from(sha256(key)), Buffer.from(keyHash));
}

// The amount a notification says was received: "Rp29.910", "Rp 29.910,00", "Rp.5.000", "IDR 29,910.00".
// The payer's name or note ("… dari <nama>") and the merchant's balance ("Saldo Rp…") can hold any "Rp" figure (a
// payer named "Rp49.950" paying Rp1.000), so they never count. If what's left still names more than one amount,
// `sure` is false: the payment then waits for an admin instead of paying a purchase.
export function receivedAmount(text: string): { amount: number; sure: boolean } | null {
  const own = text.replace(/\b(?:dari|from)\b.*$/i, '');
  const amounts = [...own.matchAll(/(?:Rp\.?|IDR)\s*(\d[\d.,]*)/gi)]
    .filter((m) => !/\b(?:saldo|balance)\b\W*(?:\w+\W+)?$/i.test(own.slice(Math.max(0, m.index - 30), m.index)))
    .map(([, n]) => Number(n.replace(/[.,]$/, '').replace(/[.,]\d{1,2}$/, '').replace(/[.,]/g, ''))) // drop cents, then separators
    .filter((n) => Number.isInteger(n) && n > 0);
  const distinct = [...new Set(amounts)];
  return distinct.length ? { amount: distinct[0], sure: distinct.length === 1 } : null;
}

// One forwarded notification (or the phone's "ping"). Its received amount pays the pending purchase waiting for exactly
// that amount; otherwise it waits in the console as "tak dikenali". The same text again within 48 hours is the same
// notification posted twice (amounts aren't handed out again for 48 hours), not a second payment.
export async function receiveNotification(raw: string): Promise<NotifyResult | 'ping'> {
  const now = new Date();
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!text || /^ping$/i.test(text)) return (await patchHook({ lastSeenAt: now.toISOString() }), 'ping');
  const result = await (async (): Promise<NotifyResult> => {
    const got = receivedAmount(text);
    if (!got) return 'no_amount';
    const [dup] = await sql`select 1 from dana_transactions where raw->>'text' = ${text} and seen_at > now() - interval '48 hours'`;
    if (dup) return 'duplicate';
    const id = `notif-${sha256(text + now.toISOString()).slice(0, 24)}`;
    if (!got.sure) {
      await sql`insert into dana_transactions (trx_id, amount, paid_at, raw) values (${id}, ${got.amount}, ${now}, ${sql.json({ text })})`;
      return 'unmatched';
    }
    return (await matchPayments([{ id, amount: got.amount, time: now, raw: { text } }])) ? 'paid' : 'unmatched';
  })();
  await patchHook({ lastSeenAt: now.toISOString(), lastText: text.slice(0, 300), lastResult: result });
  return result;
}

// Purchases nobody paid within 24 h free their amount. One with a transfer proof waits for an admin for 3 days, then
// expires as well (an admin can still approve it), so proofs can't hold amounts forever.
export const expireTopups = () =>
  sql`update topups set status = 'expired' where status = 'pending'
    and created_at < now() - case when proof_key is null then interval '24 hours' else interval '3 days' end`;
