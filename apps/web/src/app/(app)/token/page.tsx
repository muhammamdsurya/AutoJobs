import { CircleCheck, CircleSlash, CircleX, Clock, Hourglass, Plus, ReceiptText, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { requireUser } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { getPacks } from '@autojobs/shared/payments';
import { getQris } from '@autojobs/shared/settings';
import { rp } from '@autojobs/shared/tokens';
import { Badge, EmptyState, fmtDateTime, Notice, PackList, PageHeader, type Tone } from '@autojobs/shared/ui';
import { PayButton } from './pay-dialog';

type Row = { id: string; tokens: number; price: number; amount: number; status: string; note: string | null; proof: boolean; payable: boolean; createdAt: Date };

// What a purchase looks like to the user (pending splits into: payable now / proof under review / past its QR time).
function state(r: Row): [string, Tone, LucideIcon] {
  if (r.status === 'paid') return ['Berhasil', 'green', CircleCheck];
  if (r.status === 'rejected') return ['Ditolak', 'red', CircleX];
  if (r.proof) return ['Bukti diperiksa admin', 'amber', Hourglass];
  if (r.status === 'expired') return ['Kedaluwarsa', 'gray', CircleSlash];
  return r.payable ? ['Menunggu pembayaran', 'blue', Clock] : ['Belum dibayar', 'gray', Clock];
}

export default async function TokenPage() {
  const user = await requireUser();
  const [{ tokens }] = await sql<{ tokens: number }[]>`select tokens from users where id = ${user.id}`;
  const rows = await sql<Row[]>`select id, tokens, price, amount, status, note, proof_key is not null as proof, expires_at > now() as payable, created_at
    from topups where user_id = ${user.id} order by created_at desc limit 50`;
  const packs = await getPacks();
  const qris = await getQris();
  const staticQrSrc = qris ? `/api/files/qris/${qris.fileKey}` : null; // the key in the URL: a new QRIS is never served from cache
  const unlimited = user.role === 'admin';
  const reviewing = rows.filter((r) => r.proof && (r.status === 'pending' || r.status === 'expired')).length;

  return (
    <>
      <PageHeader title="Token" subtitle="1 token = 1x Cari Loker. Mengubah kriteria atau mencari ulang sebelum lamaran diluncurkan tidak memakai token lagi." />
      {reviewing > 0 && <Notice tone="blue"><span className="num">{reviewing}</span> bukti pembayaran sedang diperiksa admin. Token bertambah setelah disetujui.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <section className="card space-y-3" aria-labelledby="h-saldo">
          <h2 id="h-saldo" className="font-sans text-sm font-medium text-muted">Sisa token</h2>
          <p className={`num text-5xl font-semibold ${!unlimited && tokens === 0 ? 'text-amber-200' : ''}`}>{unlimited ? '∞' : tokens}</p>
          <p className="text-sm leading-relaxed text-muted">
            {unlimited ? 'Akun admin mencari loker tanpa token.'
              : tokens > 0 ? <>Cukup untuk <span className="num">{tokens}</span>x Cari Loker.</>
              : 'Token habis. Pilih paket untuk mencari loker lagi.'}
          </p>
          {(unlimited || tokens > 0) && <Link href="/campaigns/new" className="btn btn-secondary mt-2 w-full"><Plus aria-hidden />Pencarian baru</Link>}
        </section>

        <section className="space-y-4" aria-labelledby="h-isi">
          <h2 id="h-isi">Isi token</h2>
          {packs.length === 0 ? <Notice>Belum ada paket token yang dijual. Coba lagi nanti.</Notice>
            : <PackList packs={packs} action={(p) => <PayButton packId={p.id} label="Beli" staticQrSrc={staticQrSrc} />} />}
          <p className="max-w-[65ch] text-xs leading-relaxed text-muted">
            Bayar dengan QRIS dari aplikasi bank atau e-wallet apa pun. Token masuk otomatis beberapa saat setelah pembayaran diterima.
          </p>
        </section>
      </div>

      <section className="glass-dense overflow-hidden rounded-card" aria-labelledby="h-riwayat">
        <h2 id="h-riwayat" className="px-4 pb-3 pt-5 sm:px-6">Riwayat isi token</h2>
        {rows.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Belum ada pembelian">Pembelian token dan statusnya muncul di sini.</EmptyState>
        ) : (
          <ul className="divide-y divide-white/6">
            {rows.map((r) => {
              const [label, tone, Icon] = state(r);
              return (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium"><span className="num">{r.tokens}</span> token<span className="mx-1.5 text-white/20">/</span><span className="num">{rp(r.amount)}</span></p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted">{fmtDateTime(r.createdAt)}</p>
                    {r.status === 'rejected' && r.note && <p className="mt-1.5 text-xs leading-relaxed text-rose-200">Alasan: {r.note}</p>}
                    {r.status === 'pending' && !r.payable && !r.proof && (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted">Sudah bayar? Token tetap masuk otomatis hingga 24 jam setelah pembelian.</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={tone}><Icon aria-hidden />{label}</Badge>
                    {r.status === 'pending' && !r.proof && (
                      <PayButton topupId={r.id} label={r.payable ? 'Lanjutkan' : 'Detail'} className="btn btn-secondary" staticQrSrc={staticQrSrc} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
