import type postgres from 'postgres';

// No runtime imports: the payment pop-up (a client component) uses this file too.
// 1 token = 1 Cari Loker. An account gets FREE_SEARCHES once its email address is proven, once per address
// (grantFreeSearches in auth.ts); after that the user buys a pack (token_packs, edited in the admin console) and pays
// it by QRIS (payments.ts).
export const FREE_SEARCHES = 3;
export type Pack = { id: number; tokens: number; price: number };
export const rp = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

// Takes one token for a new search, in the caller's transaction; false when none are left. Admins search freely.
export async function spendToken(tx: postgres.TransactionSql, user: { id: string; role: string }) {
  if (user.role === 'admin') return true;
  const [row] = await tx`update users set tokens = tokens - 1 where id = ${user.id} and tokens > 0 returning tokens`;
  return !!row;
}

// Transfer proofs: a screenshot/photo or a PDF receipt, recognised by their first bytes (not the name or the
// browser's claim). Anything else (SVG, HTML, ...) is refused.
export function proofMime(b: Buffer): string | null {
  const head = b.subarray(0, 12).toString('latin1');
  if (head.startsWith('\xff\xd8\xff')) return 'image/jpeg';
  if (head.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  if (head.startsWith('%PDF-')) return 'application/pdf';
  return null;
}
