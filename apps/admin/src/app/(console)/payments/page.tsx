import { Check, CircleCheck, Clock, Eye, FileSearch, Link2, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { sql } from '@autojobs/shared/db';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { getHook } from '@autojobs/shared/payments';
import { rp } from '@autojobs/shared/tokens';
import { Badge, EmptyState, fmtDateTime, Notice, PageHeader, type Tone } from '@autojobs/shared/ui';
import { HOOK_RESULT, phoneQuiet } from '@/lib/hook';
import { approveProof, assignTransaction, ignoreTransaction, markPaid, rejectProof } from './actions';
import { requireAdmin } from '@autojobs/shared/auth';

type Purchase = { id: string; userId: string; email: string; name: string | null; tokens: number; price: number; amount: number; status: string; createdAt: Date; expiresAt: Date };
type History = Purchase & { method: string | null; paidAt: Date | null; note: string | null; decidedBy: string | null };
type DanaTx = { trxId: string; amount: number; paidAt: Date };

const METHOD: Record<string, string> = { dana: 'otomatis (DANA)', proof: 'bukti transfer', admin: 'ditandai admin' };
const STATUS: Record<string, [string, Tone]> = { paid: ['lunas', 'green'], rejected: ['ditolak', 'red'], expired: ['kedaluwarsa', 'gray'], pending: ['menunggu', 'blue'] };
const COLS = sql`t.id, t.user_id, u.email, nullif(p.full_name, '') as name, t.tokens, t.price, t.amount, t.status, t.created_at, t.expires_at`;
const FROM = sql`topups t join users u on u.id = t.user_id left join candidate_profiles p on p.user_id = t.user_id`;

function Who({ p }: { p: Purchase }) {
  return (
    <span className="min-w-0">
      <Link href={`/users/${p.userId}`} className="font-medium text-ink hover:text-accent">{p.name ?? p.email}</Link>
      {p.name && <span className="block break-all text-xs text-muted">{p.email}</span>}
    </span>
  );
}

function Section({ id, title, count, children }: { id: string; title: string; count: number; children: React.ReactNode }) {
  return (
    <section id={id} className="glass-dense scroll-mt-28 overflow-hidden rounded-card" aria-labelledby={`h-${id}`}>
      <h2 id={`h-${id}`} className="flex items-center gap-2 px-4 pb-3 pt-5 sm:px-6">{title}<span className="num text-sm font-normal text-muted">({count})</span></h2>
      {children}
    </section>
  );
}

export default async function PaymentsPage() {
  await requireAdmin();
  const proofs = await sql<Purchase[]>`select ${COLS} from ${FROM} where t.proof_key is not null and t.status in ('pending', 'expired') order by t.created_at`;
  const unmatched = await sql<DanaTx[]>`select trx_id, amount, paid_at from dana_transactions where status = 'unmatched' order by paid_at desc limit 100`;
  // Candidates for an unrecognised payment: unpaid purchases of the last 7 days, closest amount first.
  const unpaid = unmatched.length ? await sql<Purchase[]>`select ${COLS} from ${FROM} where t.status in ('pending', 'expired')
    and t.created_at > now() - interval '7 days' order by t.created_at desc limit 300` : [];
  const waiting = await sql<Purchase[]>`select ${COLS} from ${FROM} where t.status = 'pending' and t.proof_key is null order by t.created_at desc limit 100`;
  const history = await sql<History[]>`select ${COLS}, t.method, t.paid_at, t.note, d.email as decided_by from ${FROM}
    left join users d on d.id = t.decided_by where t.status in ('paid', 'rejected') order by coalesce(t.paid_at, t.created_at) desc limit 50`;
  const hook = await getHook();
  const now = Date.now();

  return (
    <>
      <PageHeader title="Pembayaran" subtitle="Pembayaran QRIS dikonfirmasi otomatis dari notifikasi DANA di HP. Di sini: bukti transfer cadangan, pembayaran yang tidak dikenali, dan pembelian yang menunggu dibayar." />
      {phoneQuiet(hook) ? (
        <Notice tone="red">
          {hook.keyHash ? `HP notifikasi DANA tidak terdengar sejak ${hook.lastSeenAt ? fmtDateTime(hook.lastSeenAt) : 'kunci dibuat'}` : 'Notifikasi DANA belum diatur'}: pembayaran tidak
          terkonfirmasi otomatis. <Link href="/settings#notifikasi" className="font-semibold">Pengaturan notifikasi</Link>
        </Notice>
      ) : (
        <Notice tone="blue">
          HP notifikasi terhubung ({fmtDateTime(hook.lastSeenAt)}).{hook.lastText && <> Notifikasi terakhir: &quot;{hook.lastText}&quot;, {HOOK_RESULT[hook.lastResult ?? ''] ?? hook.lastResult}.</>}
        </Notice>
      )}

      <Section id="bukti" title="Bukti transfer menunggu diperiksa" count={proofs.length}>
        {proofs.length === 0 ? <EmptyState icon={FileSearch} title="Tidak ada bukti yang menunggu" /> : (
          <ul className="divide-y divide-white/6">
            {proofs.map((p) => (
              <li key={p.id} className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-sm">
                  <Who p={p} />
                  <span><span className="num font-semibold">{p.tokens}</span> token · <span className="num">{rp(p.amount)}</span></span>
                  <span className="text-xs text-muted tabular-nums">{fmtDateTime(p.createdAt)}</span>
                  {p.status === 'expired' && <Badge>lewat 24 jam</Badge>}
                  <a href={`/api/files/proof/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5"><Eye className="size-4" aria-hidden />Lihat bukti</a>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <ActionForm action={approveProof.bind(null, p.id)}><Submit className="btn btn-primary" confirm={`Setujui dan tambahkan ${p.tokens} token?`}><Check aria-hidden />Setujui</Submit></ActionForm>
                  <ActionForm action={rejectProof.bind(null, p.id)} className="flex flex-wrap gap-2">
                    <input className="input w-56" name="note" placeholder="Alasan penolakan" maxLength={300} required aria-label="Alasan penolakan" />
                    <Submit className="btn btn-danger"><X aria-hidden />Tolak</Submit>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="tak-dikenali" title="Pembayaran DANA tak dikenali" count={unmatched.length}>
        {unmatched.length === 0 ? <EmptyState icon={CircleCheck} title="Semua pembayaran DANA sudah dikenali" /> : (
          <ul className="divide-y divide-white/6">
            {unmatched.map((d) => {
              const options = [...unpaid].sort((a, b) => Math.abs(a.amount - d.amount) - Math.abs(b.amount - d.amount)).slice(0, 10);
              return (
                <li key={d.trxId} className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-start">
                  <div className="text-sm">
                    <p className="num text-lg font-semibold">{rp(d.amount)}</p>
                    <p className="text-xs text-muted tabular-nums">{fmtDateTime(d.paidAt)}</p>
                    <p className="break-all text-xs text-muted">ID {d.trxId}</p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <ActionForm action={assignTransaction.bind(null, d.trxId)} className="flex min-w-0 flex-1 flex-wrap gap-2">
                      <select className="input min-w-0 flex-1" name="topupId" required aria-label="Pembelian yang dibayar" defaultValue="">
                        <option value="" disabled>Pilih pembelian yang dibayar…</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.amount === d.amount ? '✓ ' : ''}{o.email} · {o.tokens} token · {rp(o.amount)} · {fmtDateTime(o.createdAt)}
                          </option>
                        ))}
                      </select>
                      <Submit className="btn btn-primary" confirm="Kreditkan token untuk pembelian yang dipilih?"><Link2 aria-hidden />Kaitkan</Submit>
                    </ActionForm>
                    <ActionForm action={ignoreTransaction.bind(null, d.trxId)}>
                      <Submit className="btn btn-quiet" confirm="Abaikan transaksi ini (bukan pembelian token)?">Abaikan</Submit>
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section id="menunggu" title="Menunggu dibayar" count={waiting.length}>
        {waiting.length === 0 ? <EmptyState icon={Clock} title="Tidak ada pembelian yang menunggu" /> : (
          <ul className="divide-y divide-white/6">
            {waiting.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 px-4 py-4 text-sm sm:flex-row sm:items-center sm:gap-6 sm:px-6">
                <Who p={p} />
                <span className="sm:ml-auto"><span className="num font-semibold">{p.tokens}</span> token · <span className="num">{rp(p.amount)}</span></span>
                <span className="text-xs text-muted tabular-nums">
                  {new Date(p.expiresAt).getTime() > now ? `QR berlaku s.d. ${fmtDateTime(p.expiresAt)}` : `dibuat ${fmtDateTime(p.createdAt)}, menunggu pembayaran terlambat`}
                </span>
                <ActionForm action={markPaid.bind(null, p.id)}>
                  <Submit className="btn btn-secondary" confirm={`Tandai lunas dan tambahkan ${p.tokens} token? Lakukan hanya bila uang ${rp(p.amount)} sudah masuk.`}>Tandai lunas</Submit>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="riwayat" title="Riwayat terbaru" count={history.length}>
        {history.length === 0 ? <EmptyState icon={TriangleAlert} title="Belum ada pembelian yang selesai" /> : (
          <div className="overflow-x-auto">
            <table className="table table-stack">
              <thead><tr><th className="sm:pl-6">Pengguna</th><th>Paket</th><th className="text-right">Dibayar</th><th>Cara</th><th>Status</th><th className="sm:pr-6">Waktu</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="tabular-nums">
                    <td className="sm:pl-6"><Who p={h} /></td>
                    <td data-label="Paket">{h.tokens} token</td>
                    <td data-label="Dibayar" className="sm:text-right">{rp(h.amount)}</td>
                    <td data-label="Cara">{h.method ? METHOD[h.method] : '-'}{h.decidedBy && <span className="block text-xs text-muted">{h.decidedBy}</span>}</td>
                    <td data-label="Status"><span><Badge tone={STATUS[h.status]?.[1] ?? 'gray'}>{STATUS[h.status]?.[0] ?? h.status}</Badge>{h.note && <span className="mt-1 block text-xs text-muted">{h.note}</span>}</span></td>
                    <td data-label="Waktu" className="text-xs text-muted sm:pr-6">{fmtDateTime(h.paidAt ?? h.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
