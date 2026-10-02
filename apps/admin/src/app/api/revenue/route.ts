import { requireAdmin } from '@autojobs/shared/auth';
import { csvHeaders, excelCsv, wib } from '@autojobs/shared/csv';
import { audit, sql } from '@autojobs/shared/db';
import { period } from '@/lib/period';

const METHOD: Record<string, string> = { dana: 'Otomatis (DANA)', proof: 'Bukti transfer', admin: 'Ditandai admin' };

// The revenue page's period as a spreadsheet: one row per paid purchase.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const [from, to] = period({ from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined });
  const rows = await sql<{ paidAt: Date; email: string; name: string | null; tokens: number; price: number; amount: number; method: string; danaTrxId: string | null }[]>`
    select t.paid_at, u.email, nullif(p.full_name, '') as name, t.tokens, t.price, t.amount, t.method, t.dana_trx_id
    from topups t join users u on u.id = t.user_id left join candidate_profiles p on p.user_id = t.user_id
    where t.status = 'paid' and t.paid_at >= (${from}::date)::timestamp at time zone 'Asia/Jakarta'
      and t.paid_at < (${to}::date + 1)::timestamp at time zone 'Asia/Jakarta'
    order by t.paid_at`;
  const table = [
    ['Waktu bayar (WIB)', 'Email', 'Nama', 'Token', 'Harga paket', 'Kode unik', 'Dibayar', 'Cara bayar', 'ID transaksi DANA'],
    ...rows.map((r) => [wib(r.paidAt), r.email, r.name, r.tokens, r.price, r.price - r.amount, r.amount, METHOD[r.method] ?? r.method, r.danaTrxId]),
    [],
    ['Total', '', '', rows.reduce((s, r) => s + r.tokens, 0), '', '', rows.reduce((s, r) => s + r.amount, 0)],
  ];
  await audit(null, 'data_exported', { report: 'pendapatan', from, to }, admin.id); // names and emails of buyers
  return new Response(new Uint8Array(excelCsv(table)), { headers: csvHeaders(`pendapatan-${from}-sd-${to}.csv`) });
}
