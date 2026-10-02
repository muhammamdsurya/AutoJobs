import {
  BadgeDollarSign, CircleCheck, CircleX, Clock, Coins, FileSearch, HandCoins, Puzzle, ScanSearch, Send, TriangleAlert, UserCheck, UserPlus,
  Users, UserX, Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { sql } from '@autojobs/shared/db';
import { getHook } from '@autojobs/shared/payments';
import { PORTAL_LABEL, PORTALS, type Portal } from '@autojobs/shared/portals';
import { getSettings } from '@autojobs/shared/settings';
import { FREE_SEARCHES, rp } from '@autojobs/shared/tokens';
import { Badge, fmtDateTime, Notice, PageHeader, Stat } from '@autojobs/shared/ui';
import { phoneQuiet } from '@/lib/hook';
import { requireAdmin } from '@autojobs/shared/auth';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-');
const TODAY = sql`date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'`; // midnight WIB

function Group({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2>{title}</h2>
        {href && <Link href={href} className="text-sm">Lihat detail</Link>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
    </section>
  );
}

export default async function OverviewPage() {
  await requireAdmin();
  const settings = await getSettings();
  const [m] = await sql<Record<string, number>[]>`select
    (select coalesce(sum(amount), 0) from topups where status = 'paid' and paid_at >= ${TODAY})::int as rev_today,
    (select coalesce(sum(amount), 0) from topups where status = 'paid' and paid_at > now() - interval '7 days')::int as rev_7,
    (select coalesce(sum(amount), 0) from topups where status = 'paid' and paid_at > now() - interval '30 days')::int as rev_30,
    (select coalesce(sum(amount), 0) from topups where status = 'paid')::int as rev_all,
    (select count(*) from topups where proof_key is not null and status in ('pending', 'expired'))::int as proofs,
    (select count(*) from dana_transactions where status = 'unmatched')::int as unmatched,
    (select count(*) from topups where status = 'pending' and expires_at > now())::int as awaiting,
    (select count(*) from users)::int as users,
    (select count(*) from users where email_verified_at is not null)::int as verified,
    (select count(*) from users where created_at > now() - interval '7 days')::int as new_7,
    (select count(distinct user_id) from campaigns where created_at > now() - interval '30 days')::int as active_30,
    (select count(distinct user_id) from topups where status = 'paid')::int as paying,
    (select count(*) from users where suspended_at is not null)::int as suspended,
    (select count(*) from users where role <> 'admin')::int as members,
    (select coalesce(sum(tokens), 0) from topups where status = 'paid')::int as tokens_sold,
    (select count(*) from campaigns c join users u on u.id = c.user_id where u.role <> 'admin')::int as tokens_used,
    (select coalesce(sum(tokens), 0) from users where role <> 'admin')::int as tokens_left,
    (select count(*) from applications where status = 'submitted' and not dry_run)::int as sent,
    (select count(*) from applications where status = 'submitted' and not dry_run and submitted_at >= ${TODAY})::int as sent_today,
    (select count(*) from campaigns where created_at > now() - interval '7 days')::int as searches_7,
    (select count(*) from campaigns where status = 'running')::int as running,
    (select count(distinct user_id) from extension_tokens where last_seen_at > now() - interval '2 minutes')::int as extensions`;
  const hook = await getHook();

  // Portal health (moved here from the app's old Admin page).
  const byPortal = <T extends { portal: string }>(rows: T[]) => (p: Portal) => rows.find((r) => r.portal === p);
  const scrape = byPortal(await sql<{ portal: string; ok: number; total: number }[]>`
    select portal, count(*) filter (where ok)::int as ok, count(*)::int as total
    from scrape_runs where created_at > now() - interval '7 days' group by portal`);
  // PRD metric: Submitted ÷ attempted (dry runs and external/manual excluded).
  const apply = byPortal(await sql<{ portal: string; submitted: number; failed: number; needsAction: number }[]>`
    select portal, count(*) filter (where status = 'submitted')::int as submitted, count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where status = 'needs_action')::int as needs_action
    from applications where not dry_run and attempt_count > 0 and updated_at > now() - interval '7 days' group by portal`);
  const queue = byPortal(await sql<{ portal: string; queued: number; inProgress: number; accounts: number }[]>`
    select portal, count(*) filter (where status = 'queued')::int as queued, count(*) filter (where status = 'in_progress')::int as in_progress,
      count(distinct user_id)::int as accounts
    from applications where status in ('queued', 'in_progress') group by portal`);
  // Selector health: share of failures among the last 20 attempts (dry runs included: they exercise the same selectors).
  const recent = byPortal(await sql<{ portal: string; failed: number; n: number }[]>`
    select portal, count(*) filter (where status = 'failed')::int as failed, count(*)::int as n from (
      select portal, status, row_number() over (partition by portal order by updated_at desc) as rn
      from applications where attempt_count > 0 and status in ('submitted', 'failed', 'needs_action', 'skipped')) t
    where rn <= 20 group by portal`);
  const lastScrapes = await sql<{ portal: string; ok: boolean }[]>`
    select portal, ok from (select portal, ok, row_number() over (partition by portal order by created_at desc) as rn from scrape_runs) t where rn <= 3`;
  const reasons = await sql<{ portal: string; reason: string; n: number }[]>`
    select portal, split_part(failure_reason, ':', 1) as reason, count(*)::int as n from applications
    where status in ('failed', 'needs_action') and updated_at > now() - interval '7 days'
    group by 1, 2 order by n desc limit 10`;
  const alerts = PORTALS.flatMap((p) => {
    const out: string[] = [];
    const r = recent(p);
    if (r && r.n >= 5 && r.failed / r.n >= settings.alertFailureRatio)
      out.push(`${PORTAL_LABEL[p]}: ${r.failed} dari ${r.n} percobaan terakhir gagal. Kemungkinan struktur halaman berubah; periksa tangkapan layar di laporan.`);
    const s = lastScrapes.filter((x) => x.portal === p);
    if (s.length === 3 && s.every((x) => !x.ok)) out.push(`${PORTAL_LABEL[p]}: 3 pencarian terakhir gagal.`);
    return out;
  });

  return (
    <>
      <PageHeader title="Ringkasan" subtitle={<span className="tabular-nums">{m.running} pencarian berjalan · {m.extensions} ekstensi aktif saat ini</span>} />
      {phoneQuiet(hook) && (
        <Notice tone="red">
          {hook.keyHash ? `HP notifikasi DANA tidak terdengar sejak ${hook.lastSeenAt ? fmtDateTime(hook.lastSeenAt) : 'kunci dibuat'}` : 'Notifikasi DANA belum diatur'}:
          pembayaran token tidak terkonfirmasi otomatis. <Link href="/settings#notifikasi" className="font-semibold">Pengaturan notifikasi</Link>
        </Notice>
      )}
      {alerts.map((a) => <Notice key={a} tone="red">{a}</Notice>)}

      <Group title="Pendapatan penjualan token" href="/revenue">
        <Stat icon={Wallet} tone="green" label="Hari ini" value={rp(m.revToday)} />
        <Stat icon={Wallet} tone="green" label="7 hari" value={rp(m.rev7)} />
        <Stat icon={Wallet} tone="green" label="30 hari" value={rp(m.rev30)} />
        <Stat icon={Wallet} tone="green" label="Sejak awal" value={rp(m.revAll)} />
      </Group>

      <Group title="Pembayaran" href="/payments">
        <Stat icon={FileSearch} tone={m.proofs ? 'amber' : 'gray'} label="Bukti menunggu diperiksa" value={m.proofs} href="/payments#bukti" />
        <Stat icon={TriangleAlert} tone={m.unmatched ? 'amber' : 'gray'} label="Pembayaran DANA tak dikenali" value={m.unmatched} href="/payments#tak-dikenali" />
        <Stat icon={Clock} tone="blue" label="Menunggu dibayar" value={m.awaiting} href="/payments#menunggu" />
        <Stat icon={phoneQuiet(hook) ? CircleX : CircleCheck} tone={phoneQuiet(hook) ? 'red' : 'green'} label="HP notifikasi terakhir terhubung"
          value={<span className="text-base">{hook.lastSeenAt ? fmtDateTime(hook.lastSeenAt) : 'belum pernah'}</span>} href="/settings#notifikasi" />
      </Group>

      <Group title="Pengguna" href="/users">
        <Stat icon={Users} label="Total pengguna" value={m.users} />
        <Stat icon={UserCheck} tone="green" label="Email terverifikasi" value={m.verified} />
        <Stat icon={UserPlus} label="Baru 7 hari" value={m.new7} />
        <Stat icon={ScanSearch} label="Aktif 30 hari (mencari loker)" value={m.active30} />
        <Stat icon={BadgeDollarSign} tone="green" label={`Pernah membeli (${pct(m.paying, m.members)})`} value={m.paying} href="/users?f=paying" />
        <Stat icon={UserX} tone={m.suspended ? 'red' : 'gray'} label="Ditangguhkan" value={m.suspended} href="/users?f=suspended" />
      </Group>

      <Group title="Token">
        <Stat icon={HandCoins} tone="green" label="Terjual" value={m.tokensSold} />
        <Stat icon={Coins} label="Terpakai (pencarian baru)" value={m.tokensUsed} />
        <Stat icon={Coins} tone="blue" label="Sisa di akun pengguna" value={m.tokensLeft} />
        <Stat icon={Coins} label={`Gratis dibagikan (${FREE_SEARCHES}/akun)`} value={m.members * FREE_SEARCHES} />
      </Group>

      <Group title="Lamaran dan pencarian">
        <Stat icon={Send} tone="green" label="Lamaran terkirim" value={m.sent} />
        <Stat icon={Send} tone="green" label="Terkirim hari ini" value={m.sentToday} />
        <Stat icon={ScanSearch} label="Pencarian 7 hari" value={m.searches7} />
        <Stat icon={Puzzle} label="Ekstensi aktif" value={m.extensions} />
      </Group>

      <section className="card p-0 sm:p-0" aria-labelledby="h-health">
        <h2 id="h-health" className="px-4 pt-4 sm:px-6 sm:pt-6">Kesehatan portal (7 hari)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="table table-stack">
            <thead><tr><th className="sm:pl-6">Portal</th><th>Pencarian berhasil</th><th>Lamaran berhasil</th><th>Gagal</th><th>Perlu tindakan</th><th>Antrean</th><th>Diproses</th><th className="sm:pr-6">Status</th></tr></thead>
            <tbody>
              {PORTALS.map((p) => {
                const sc = scrape(p);
                const ap = apply(p);
                const q = queue(p);
                const attempted = (ap?.submitted ?? 0) + (ap?.failed ?? 0) + (ap?.needsAction ?? 0);
                return (
                  <tr key={p} className="tabular-nums">
                    <td className="font-medium sm:pl-6">{PORTAL_LABEL[p]}</td>
                    <td data-label="Pencarian berhasil"><span>{pct(sc?.ok ?? 0, sc?.total ?? 0)} <span className="text-xs text-muted">({sc?.ok ?? 0}/{sc?.total ?? 0})</span></span></td>
                    <td data-label="Lamaran berhasil"><span>{pct(ap?.submitted ?? 0, attempted)} <span className="text-xs text-muted">({ap?.submitted ?? 0}/{attempted})</span></span></td>
                    <td data-label="Gagal">{ap?.failed ?? 0}</td>
                    <td data-label="Perlu tindakan">{ap?.needsAction ?? 0}</td>
                    <td data-label="Antrean"><span>{q?.queued ?? 0}{q ? <span className="text-xs text-muted"> ({q.accounts} pengguna)</span> : null}</span></td>
                    <td data-label="Diproses">{q?.inProgress ?? 0}</td>
                    <td data-label="Status" className="sm:pr-6">
                      {settings.portalEnabled[p] ? <Badge tone="green"><CircleCheck aria-hidden />aktif</Badge> : <Badge tone="red"><CircleX aria-hidden />nonaktif</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-labelledby="h-reasons">
        <h2 id="h-reasons">Alasan gagal teratas (7 hari)</h2>
        {reasons.length === 0 ? <p className="mt-2 text-sm text-muted">Belum ada lamaran gagal dalam 7 hari terakhir.</p> : (
          <ol className="glass-dense mt-4 divide-y divide-white/6 overflow-hidden rounded-control text-sm">
            {reasons.map((r) => (
              <li key={r.portal + r.reason} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_3rem]">
                <span className="text-xs text-muted sm:text-sm">{PORTAL_LABEL[r.portal as Portal] ?? r.portal}</span>
                <span className="break-words">{r.reason}</span>
                <span className="text-xs text-muted sm:text-right sm:text-sm"><span className="num font-semibold text-ink">{r.n}</span>x</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
