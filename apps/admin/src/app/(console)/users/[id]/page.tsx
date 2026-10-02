import { Coins, HandCoins, Search, Send, UserCheck, UserX, Wallet } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@autojobs/shared/db';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { rp } from '@autojobs/shared/tokens';
import { BackLink, Badge, Field, fmtDateTime, PageHeader, Stat } from '@autojobs/shared/ui';
import { ACTION_LABEL, describe } from '@/lib/audit';
import { adjustTokens, setSuspended } from '../actions';
import { requireAdmin } from '@autojobs/shared/auth';

type User = {
  id: string; email: string; role: string; tokens: number; createdAt: Date; emailVerifiedAt: Date | null; suspendedAt: Date | null;
  hasPassword: boolean; google: boolean; fullName: string; phone: string; city: string; province: string;
};
type Movement = { at: Date; kind: 'search' | 'topup' | 'adjust'; delta: number; label: string | null; status: string | null; amount: number | null };

const TOPUP_STATUS: Record<string, string> = { paid: 'dibayar', pending: 'menunggu', rejected: 'ditolak', expired: 'kedaluwarsa' };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [u] = await sql<User[]>`select u.id, u.email, u.role, u.tokens, u.created_at, u.email_verified_at, u.suspended_at,
      u.password_hash is not null as has_password, u.google_sub is not null as google, coalesce(p.full_name, '') as full_name,
      case when p.phone <> '' then p.phone_country || ' ' || p.phone else '' end as phone, coalesce(p.city, '') as city, coalesce(p.province, '') as province
    from users u left join candidate_profiles p on p.user_id = u.id where u.id = ${id}`;
  if (!u) notFound();
  const [s] = await sql<{ sent: number; searches: number; bought: number; spent: number; adjusted: number }[]>`select
    (select count(*) from applications where user_id = ${id} and status = 'submitted' and not dry_run)::int as sent,
    (select count(*) from campaigns where user_id = ${id})::int as searches,
    (select coalesce(sum(tokens), 0) from topups where user_id = ${id} and status = 'paid')::int as bought,
    (select coalesce(sum(amount), 0) from topups where user_id = ${id} and status = 'paid')::int as spent,
    (select coalesce(sum((detail->>'delta')::int), 0) from audit_log where user_id = ${id} and action = 'tokens_adjusted')::int as adjusted`;
  // Every token movement: searches (-1 each), purchases, and adjustments.
  const moves = await sql<Movement[]>`
    select created_at as at, 'search' as kind, -1 as delta, name as label, status, null::int as amount from campaigns where user_id = ${id}
    union all
    select coalesce(paid_at, created_at), 'topup', case when status = 'paid' then tokens else 0 end, tokens::text, status, amount from topups where user_id = ${id}
    union all
    select created_at, 'adjust', (detail->>'delta')::int, detail->>'reason', null, null from audit_log where user_id = ${id} and action = 'tokens_adjusted'
    order by at desc limit 40`;
  const activity = await sql<{ id: string; action: string; detail: Record<string, unknown> | null; createdAt: Date; actor: string | null }[]>`
    select a.id, a.action, a.detail, a.created_at, ac.email as actor from audit_log a left join users ac on ac.id = a.actor_id and a.actor_id <> a.user_id
    where a.user_id = ${id} order by a.id desc limit 20`;
  const admin = u.role === 'admin';
  const facts: [string, string][] = [
    ['No. HP', u.phone || '-'],
    ['Domisili', [u.city, u.province].filter(Boolean).join(', ') || '-'],
    ['Bergabung', fmtDateTime(u.createdAt)],
    ['Email terverifikasi', u.emailVerifiedAt ? fmtDateTime(u.emailVerifiedAt) : 'belum'],
    ['Cara masuk', [u.hasPassword && 'kata sandi', u.google && 'Google'].filter(Boolean).join(', ') || '-'],
    ['Status', u.suspendedAt ? `ditangguhkan sejak ${fmtDateTime(u.suspendedAt)}` : 'aktif'],
  ];

  return (
    <>
      <BackLink href="/users">Pengguna</BackLink>
      <PageHeader title={u.fullName || u.email} subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="break-all">{u.email}</span>
          {admin && <Badge tone="violet">admin</Badge>}
          {u.suspendedAt && <Badge tone="red"><UserX aria-hidden />ditangguhkan</Badge>}
        </span>
      } />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Ringkasan akun">
        <Stat icon={Coins} tone={!admin && u.tokens === 0 ? 'amber' : 'blue'} label="Sisa token" value={admin ? '∞' : u.tokens} />
        <Stat icon={Search} label="Token terpakai (pencarian)" value={admin ? `${s.searches} (gratis)` : s.searches} />
        <Stat icon={HandCoins} tone="green" label={`Dibeli${s.adjusted ? ` · disesuaikan ${s.adjusted > 0 ? '+' : ''}${s.adjusted}` : ''}`} value={s.bought} />
        <Stat icon={Wallet} tone="green" label="Total belanja" value={rp(s.spent)} />
        <Stat icon={Send} tone="green" label="Lamaran terkirim" value={s.sent} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section className="card" aria-labelledby="h-data">
            <h2 id="h-data">Data akun</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              {facts.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="mt-1 break-words tabular-nums">{v}</dd></div>)}
            </dl>
          </section>

          <section className="glass-dense overflow-hidden rounded-card" aria-labelledby="h-token">
            <h2 id="h-token" className="px-4 pb-3 pt-5 sm:px-6">Riwayat token</h2>
            {moves.length === 0 ? <p className="px-4 pb-5 text-sm text-muted sm:px-6">Belum ada pemakaian atau pembelian token.</p> : (
              <ul className="divide-y divide-white/6">
                {moves.map((m, i) => (
                  <li key={i} className="flex items-start gap-4 px-4 py-3 text-sm sm:px-6">
                    <span className={`num w-12 shrink-0 text-right font-semibold ${m.delta > 0 ? 'text-accent' : m.delta < 0 ? 'text-ink' : 'text-muted'}`}>
                      {m.kind === 'search' && admin ? '0' : m.delta > 0 ? `+${m.delta}` : m.delta}
                    </span>
                    <span className="min-w-0 flex-1">
                      {m.kind === 'search' ? <>Cari Loker: {m.label}</>
                        : m.kind === 'topup' ? <>Beli {m.label} token · {rp(m.amount ?? 0)} <span className="text-muted">({TOPUP_STATUS[m.status ?? ''] ?? m.status})</span></>
                        : <>Penyesuaian admin: {m.label}</>}
                      <span className="block text-xs text-muted tabular-nums">{fmtDateTime(m.at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="glass-dense overflow-hidden rounded-card" aria-labelledby="h-aktivitas">
            <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-5 sm:px-6">
              <h2 id="h-aktivitas">Aktivitas terbaru</h2>
              <Link href={`/audit?q=${encodeURIComponent(u.email)}`} className="text-sm">Semua di audit</Link>
            </div>
            <ul className="divide-y divide-white/6">
              {activity.map((a) => (
                <li key={a.id} className="px-4 py-3 text-sm sm:px-6">
                  <span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span>
                  {a.actor && <span className="text-muted"> oleh {a.actor}</span>}
                  {describe(a.detail) && <span className="block break-words text-xs text-muted">{describe(a.detail)}</span>}
                  <span className="block text-xs text-muted tabular-nums">{fmtDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-32">
          {!admin && (
            <ActionForm action={adjustTokens.bind(null, u.id)} resetOnOk className="card space-y-4">
              <h2>Sesuaikan token</h2>
              <Field label="Jumlah" hint="Positif untuk menambah, negatif untuk mengurangi (mis. -2).">
                <input className="input num" type="number" name="delta" min={-1000} max={1000} step={1} required />
              </Field>
              <Field label="Alasan" hint="Dicatat di audit, mis. kompensasi pencarian gagal.">
                <input className="input" name="reason" maxLength={300} required />
              </Field>
              <Submit className="btn btn-primary w-full">Simpan penyesuaian</Submit>
            </ActionForm>
          )}
          {!admin && (u.suspendedAt ? (
            <ActionForm action={setSuspended.bind(null, u.id)} className="card space-y-4">
              <h2>Akun ditangguhkan</h2>
              <p className="text-sm text-muted">Pengguna tidak bisa masuk dan antrean lamarannya berhenti. Aktifkan lagi untuk memulihkan akses.</p>
              <input type="hidden" name="on" value="0" />
              <Submit className="btn btn-secondary w-full"><UserCheck aria-hidden />Aktifkan lagi</Submit>
            </ActionForm>
          ) : (
            <ActionForm action={setSuspended.bind(null, u.id)} className="card space-y-4 border-rose-300/25 bg-rose-400/[0.04]">
              <h2 className="text-rose-200">Tangguhkan akun</h2>
              <p className="text-sm text-muted">Pengguna langsung keluar dan tidak bisa masuk; ekstensinya berhenti melamar. Data tidak dihapus.</p>
              <input type="hidden" name="on" value="1" />
              <Field label="Alasan" hint="Dicatat di audit, tidak ditampilkan ke pengguna."><input className="input" name="reason" maxLength={300} required /></Field>
              <Submit className="btn btn-danger w-full" confirm="Tangguhkan akun ini?"><UserX aria-hidden />Tangguhkan</Submit>
            </ActionForm>
          ))}
          {admin && <p className="card text-sm text-muted">Akun admin mencari tanpa token dan tidak bisa ditangguhkan dari konsol.</p>}
        </aside>
      </div>
    </>
  );
}
