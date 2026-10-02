import { Coins, Download, Percent, ReceiptText, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { sql } from '@autojobs/shared/db';
import { rp } from '@autojobs/shared/tokens';
import { EmptyState, PageHeader, Stat } from '@autojobs/shared/ui';
import { period, presets } from '@/lib/period';
import { requireAdmin } from '@autojobs/shared/auth';

const METHOD: Record<string, string> = { dana: 'Otomatis (DANA)', proof: 'Bukti transfer', admin: 'Ditandai admin' };
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtMonth = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });

type Sum = { n: number; tokens: number; revenue: number };

function Breakdown({ title, head, rows }: { title: string; head: string; rows: (Sum & { key: string; label: string })[] }) {
  return (
    <section className="glass-dense overflow-hidden rounded-card">
      <h2 className="px-4 pb-3 pt-5 sm:px-6">{title}</h2>
      {rows.length === 0 ? <p className="px-4 pb-5 text-sm text-muted sm:px-6">Belum ada penjualan.</p> : (
        <table className="table">
          <thead><tr><th className="pl-4 sm:pl-6">{head}</th><th className="text-right">Transaksi</th><th className="text-right">Token</th><th className="pr-4 text-right sm:pr-6">Pendapatan</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="tabular-nums">
                <td className="pl-4 sm:pl-6">{r.label}</td><td className="text-right">{r.n}</td><td className="text-right">{r.tokens}</td>
                <td className="pr-4 text-right font-medium sm:pr-6">{rp(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireAdmin();
  const [from, to] = period(await searchParams);
  // Paid purchases whose payment landed in [from, to] (WIB days).
  const IN = sql`status = 'paid' and paid_at >= (${from}::date)::timestamp at time zone 'Asia/Jakarta'
    and paid_at < (${to}::date + 1)::timestamp at time zone 'Asia/Jakarta'`;
  const SUM = sql`count(*)::int as n, coalesce(sum(tokens), 0)::int as tokens, coalesce(sum(amount), 0)::int as revenue`;
  const [t] = await sql<(Sum & { buyers: number; codes: number })[]>`select ${SUM}, count(distinct user_id)::int as buyers,
    coalesce(sum(price - amount), 0)::int as codes from topups where ${IN}`;
  const days = await sql<(Sum & { day: string })[]>`select to_char(paid_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as day, ${SUM}
    from topups where ${IN} group by 1 order by 1 desc`;
  const packs = await sql<(Sum & { packTokens: number; price: number })[]>`select tokens as pack_tokens, price, ${SUM}
    from topups where ${IN} group by tokens, price order by tokens, price`;
  const methods = await sql<(Sum & { method: string })[]>`select method, ${SUM} from topups where ${IN} group by method order by revenue desc`;
  const months = await sql<(Sum & { month: string })[]>`select to_char(date_trunc('month', paid_at at time zone 'Asia/Jakarta'), 'YYYY-MM-DD') as month, ${SUM}
    from topups where status = 'paid' and paid_at > now() - interval '12 months' group by 1 order by 1 desc`;
  const range = `from=${from}&to=${to}`;

  return (
    <>
      <PageHeader title="Pendapatan" subtitle="Penjualan token yang sudah lunas, menurut tanggal pembayaran (WIB). Nilai = uang yang benar-benar dibayar, setelah potongan kode unik.">
        <a href={`/api/revenue?${range}`} className="btn btn-secondary"><Download aria-hidden />Unduh (Excel/CSV)</a>
      </PageHeader>

      <form className="card flex flex-col gap-4 lg:flex-row lg:items-end">
        <label className="block"><span className="label">Dari</span><input className="input num" type="date" name="from" defaultValue={from} /></label>
        <label className="block"><span className="label">Sampai</span><input className="input num" type="date" name="to" defaultValue={to} /></label>
        <button className="btn btn-primary">Tampilkan</button>
        <nav className="flex flex-wrap gap-2 lg:ml-auto" aria-label="Periode cepat">
          {Object.entries(presets()).map(([label, [a, b]]) => (
            <Link key={label} href={`/revenue?from=${a}&to=${b}`} aria-current={a === from && b === to ? 'true' : undefined}
              className={`rounded-chip border px-3 py-1.5 text-sm no-underline hover:no-underline ${a === from && b === to ? 'border-accent/55 bg-accent/10 text-teal-100' : 'border-white/12 bg-white/4 text-muted hover:text-ink'}`}>
              {label}
            </Link>
          ))}
        </nav>
      </form>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Ringkasan periode">
        <Stat icon={Wallet} tone="green" label="Pendapatan" value={rp(t.revenue)} />
        <Stat icon={ReceiptText} label="Transaksi" value={t.n} />
        <Stat icon={Coins} label="Token terjual" value={t.tokens} />
        <Stat icon={Users} label="Pembeli" value={t.buyers} />
        <Stat icon={Wallet} label="Rata-rata per transaksi" value={rp(t.n ? Math.round(t.revenue / t.n) : 0)} />
        <Stat icon={Percent} label="Potongan kode unik" value={rp(t.codes)} />
      </section>

      {t.n === 0 ? (
        <section className="card"><EmptyState icon={ReceiptText} title="Belum ada penjualan di periode ini">Pilih periode lain, atau lihat pembelian yang menunggu di Pembayaran.</EmptyState></section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <Breakdown title="Per hari" head="Tanggal" rows={days.map((d) => ({ ...d, key: d.day, label: fmtDay(d.day) }))} />
          <div className="space-y-6">
            <Breakdown title="Per paket" head="Paket" rows={packs.map((p) => ({ ...p, key: `${p.packTokens}-${p.price}`, label: `${p.packTokens} token · ${rp(p.price)}` }))} />
            <Breakdown title="Per cara bayar" head="Cara" rows={methods.map((m) => ({ ...m, key: m.method, label: METHOD[m.method] ?? m.method }))} />
          </div>
        </div>
      )}
      <Breakdown title="Per bulan (12 bulan terakhir)" head="Bulan" rows={months.map((m) => ({ ...m, key: m.month, label: fmtMonth(m.month) }))} />
    </>
  );
}
