import {
  ChevronDown, ChevronLeft, ChevronRight, CircleX, Download, FlaskConical, Hourglass, Inbox, Layers, Send, SkipForward, SlidersHorizontal, TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Badge, EmptyState, fmtDateTime, Notice, PageHeader, StatusBadge } from '@autojobs/shared/ui';
import type { PendingQuestion } from '@/lib/apply-plan';
import { requireUser } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { levelLabel } from '@/lib/filters';
import { isPortal, PORTAL_LABEL, PORTALS, STATUS_LABEL, type Portal } from '@autojobs/shared/portals';
import { AnsweredNotice, PendingQuestions } from './pending-questions';

const PAGE_SIZE = 50;
const UUID = /^[0-9a-f-]{36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  id: string; status: string; dryRun: boolean; attemptCount: number; submittedAt: Date | null; failureReason: string | null; createdAt: Date;
  title: string; company: string; location: string; url: string; applyUrl: string | null; portal: Portal; campaignName: string; campaignId: string; experienceLevels: string[] | null;
};

export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const f = { status: one('status'), portal: one('portal'), campaign: one('campaign'), from: one('from'), to: one('to'), q: one('q').slice(0, 100) };
  const page = Math.max(1, Number(one('page')) || 1);

  // RP-04 filters. The summary cards use every filter except status, so they show the whole picture.
  const conds = [sql`a.user_id = ${user.id}`];
  if (isPortal(f.portal)) conds.push(sql`a.portal = ${f.portal}`);
  if (UUID.test(f.campaign)) conds.push(sql`a.campaign_id = ${f.campaign}`);
  if (DATE.test(f.from)) conds.push(sql`a.created_at >= (${f.from}::timestamp at time zone 'Asia/Jakarta')`);
  if (DATE.test(f.to)) conds.push(sql`a.created_at < ((${f.to}::date + 1)::timestamp at time zone 'Asia/Jakarta')`);
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conds.push(sql`(l.title ilike ${like} or l.company ilike ${like})`);
  }
  const where = conds.reduce((acc, c) => sql`${acc} and ${c}`);
  const whereStatus = f.status in STATUS_LABEL ? sql`${where} and a.status = ${f.status}` : where;

  const counts = Object.fromEntries(
    (await sql<{ status: string; n: number }[]>`select a.status, count(*)::int as n from applications a
      join job_listings l on l.id = a.listing_id where ${where} group by a.status`).map((r) => [r.status, r.n]),
  );
  const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from applications a join job_listings l on l.id = a.listing_id where ${whereStatus}`;
  const rows = await sql<Row[]>`
    select a.id, a.status, a.dry_run, a.attempt_count, a.submitted_at, a.failure_reason, a.created_at,
      l.title, l.company, l.location, l.url, l.apply_url, l.portal, c.name as campaign_name, c.id as campaign_id, m.experience_levels
    from applications a
      join job_listings l on l.id = a.listing_id
      join campaigns c on c.id = a.campaign_id
      left join campaign_matches m on m.campaign_id = a.campaign_id and m.listing_id = a.listing_id
    where ${whereStatus}
    order by a.created_at desc, a.id limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`;
  const campaigns = await sql<{ id: string; name: string }[]>`select id, name from campaigns where user_id = ${user.id} and launched_at is not null order by created_at desc`;
  // Same question across applications = one answer.
  const pending = await sql<(PendingQuestion & { count: number })[]>`
    select q->>'question' as question, q->'options' as options, coalesce((q->>'multiple')::boolean, false) as multiple, count(*)::int as count
    from applications a, jsonb_array_elements(a.pending_questions) q
    where a.user_id = ${user.id} and a.status = 'needs_action'
    group by 1, 2, 3 order by count desc, question limit 20`;

  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  // Quick status filters: the same ?status= links the summary tiles used, each with its count.
  const chips: [string, number, string, LucideIcon][] = [
    ['Semua', all, '', Layers],
    ['Dalam antrean', (counts.queued ?? 0) + (counts.in_progress ?? 0), 'queued', Hourglass],
    ['Terkirim', counts.submitted ?? 0, 'submitted', Send],
    ['Perlu tindakan', counts.needs_action ?? 0, 'needs_action', TriangleAlert],
    ['Gagal', counts.failed ?? 0, 'failed', CircleX],
    ['Dilewati', counts.skipped ?? 0, 'skipped', SkipForward],
  ];
  const filtered = [f.status, f.portal, f.campaign, f.from, f.to, f.q].filter(Boolean).length;
  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, page, ...patch })) if (v !== '' && !(k === 'page' && Number(v) === 1)) p.set(k, String(v));
    return `/report?${p}`;
  };

  return (
    <>
      <PageHeader title="Laporan lamaran" subtitle="Status setiap lamaran, waktu, portal, bukti pengiriman, dan alasan gagal.">
        {UUID.test(f.campaign) && <a href={`/api/campaigns/${f.campaign}/export`} className="btn btn-secondary"><Download aria-hidden />Unduh terkirim (Excel/CSV)</a>}
      </PageHeader>
      <AnsweredNotice answered={sp.answered} skipped={sp.skipped} />
      <PendingQuestions items={pending} back="/report" />

      {/* Quick filters stay under the app header while the list scrolls; they scroll sideways on phones. */}
      <nav className="glass-bar sticky top-[4.75rem] z-20 flex gap-1 overflow-x-auto rounded-card p-1.5 [scrollbar-width:none]" aria-label="Filter status">
        {chips.map(([label, n, status, Icon]) => {
          const on = f.status === status;
          return (
            <Link key={label} href={qs({ status, page: 1 })} aria-current={on ? 'true' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-control px-3 py-2 text-sm font-medium no-underline transition-colors hover:no-underline ${on ? 'bg-white/12 text-ink' : 'text-muted hover:bg-white/6 hover:text-ink'}`}>
              <Icon className={`size-4 ${on ? 'text-accent' : ''}`} aria-hidden />
              {label}
              <span className={`num rounded-chip px-1.5 text-xs ${on ? 'bg-accent text-accent-ink' : 'bg-white/8 text-ink/80'}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {/* Folded unless a filter is active, so the list comes first. */}
      <details className="card group p-0 sm:p-0" open={filtered > 0 || undefined}>
        <summary className="flex min-h-12 items-center gap-2 px-4 text-sm font-medium sm:px-6">
          <SlidersHorizontal className="size-4 text-muted" aria-hidden />Filter lainnya{filtered > 0 && <Badge tone="blue"><span className="num">{filtered}</span> aktif</Badge>}
          <ChevronDown className="ml-auto size-4 text-muted transition group-open:rotate-180" aria-hidden />
        </summary>
        <form className="grid gap-3 border-t border-white/8 p-4 sm:grid-cols-3 sm:p-6 lg:grid-cols-6" method="get">
          <select name="status" defaultValue={f.status} className="input" aria-label="Status">
            <option value="">Semua status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="portal" defaultValue={f.portal} className="input" aria-label="Portal">
            <option value="">Semua portal</option>
            {PORTALS.map((p) => <option key={p} value={p}>{PORTAL_LABEL[p]}</option>)}
          </select>
          <select name="campaign" defaultValue={f.campaign} className="input" aria-label="Pencarian">
            <option value="">Semua pencarian</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" name="from" defaultValue={f.from} className="input" aria-label="Dari tanggal" />
          <input type="date" name="to" defaultValue={f.to} className="input" aria-label="Sampai tanggal" />
          <input name="q" defaultValue={f.q} className="input" placeholder="Cari judul / perusahaan" aria-label="Cari" />
          <div className="flex gap-2 sm:col-span-3 lg:col-span-6 [&>*]:flex-1 sm:[&>*]:flex-none">
            <button className="btn btn-primary">Terapkan</button>
            <Link href="/report" className="btn btn-secondary">Reset</Link>
          </div>
        </form>
      </details>

      <section className="glass-dense overflow-hidden rounded-card" aria-label="Daftar lamaran">
        {rows.length === 0 ? (
          filtered > 0 ? (
            <EmptyState icon={Inbox} title="Tidak ada lamaran yang cocok" action={<Link href="/report" className="btn btn-secondary">Hapus filter</Link>}>
              Coba status lain atau hapus filter yang aktif.
            </EmptyState>
          ) : (
            <EmptyState icon={Inbox} title="Belum ada lamaran" action={<Link href="/campaigns" className="btn btn-primary">Buka Cari Loker</Link>}>
              Lamaran muncul di sini setelah Anda meluncurkan pencarian.
            </EmptyState>
          )
        ) : (
          <ul className="divide-y divide-white/6">
            {rows.map((r, i) => (
              <li key={r.id} className="rise grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6 sm:px-6" style={{ '--i': i } as React.CSSProperties}>
                <div className="min-w-0">
                  <Link href={`/report/${r.id}`} className="font-medium text-ink hover:text-accent">{r.title}</Link>
                  <p className="text-sm text-muted">{r.company}{r.location && `, ${r.location}`}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                    <Badge>{PORTAL_LABEL[r.portal]}</Badge>
                    {!!r.experienceLevels?.length && <span>{r.experienceLevels.map(levelLabel).join(', ')}</span>}
                    <span>Pencarian <Link href={`/campaigns/${r.campaignId}`}>{r.campaignName}</Link></span>
                    {r.attemptCount > 0 && <span><span className="num">{r.attemptCount}</span>x dicoba</span>}
                  </div>
                  {r.failureReason && <p className="mt-2 max-w-[80ch] text-xs leading-relaxed text-muted">{r.failureReason}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end sm:justify-between">
                  <span className="flex flex-wrap gap-1.5 sm:justify-end">
                    <StatusBadge status={r.status} reason={r.failureReason} />
                    {r.dryRun && <Badge tone="violet"><FlaskConical aria-hidden />uji coba</Badge>}
                  </span>
                  {r.submittedAt && <span className="text-xs tabular-nums text-muted">Terkirim {fmtDateTime(r.submittedAt)}</span>}
                  <span className="flex gap-3 text-sm">
                    <a href={r.url} target="_blank" rel="noreferrer">Buka</a>
                    {r.applyUrl && <a href={r.applyUrl} target="_blank" rel="noreferrer">Lamar ↗</a>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {total > PAGE_SIZE && (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Halaman">
          {page > 1 ? <Link href={qs({ page: page - 1 })} className="btn btn-secondary"><ChevronLeft aria-hidden />Sebelumnya</Link> : <span />}
          <span className="text-muted">Halaman <span className="num text-ink">{page}</span> dari <span className="num text-ink">{Math.ceil(total / PAGE_SIZE)}</span></span>
          {page * PAGE_SIZE < total ? <Link href={qs({ page: page + 1 })} className="btn btn-secondary">Berikutnya<ChevronRight aria-hidden /></Link> : <span />}
        </nav>
      )}
    </>
  );
}
