import {
  ChartColumn, CircleX, Clock, Download, FlaskConical, Hourglass, Inbox, RefreshCw, Send, SlidersHorizontal, TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, AutoRefresh, Countdown, Submit } from '@autojobs/shared/forms';
import { BackLink, Badge, CampaignBadge, EmptyState, fmtDateTime, fmtTime, Meter, Notice, PageHeader, Stat, StatusBadge, type Tone } from '@autojobs/shared/ui';
import { findAnswer } from '@/lib/answers';
import { requireUser } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { formatDuration } from '@/lib/estimate';
import { extensionLastSeen, isOnline } from '@/lib/extension';
import { levelLabel, REJECT_LABEL, type RejectReason } from '@/lib/filters';
import { AUTO_APPLY, PORTAL_LABEL, PORTALS, STATUS_LABEL, type Portal } from '@autojobs/shared/portals';
import { getBank, getExtras, getProfile, missingFor } from '@/lib/profile';
import { submittedToday } from '@/lib/queue';
import { gapSec, getSettings } from '@autojobs/shared/settings';
import type { RejectedItem } from '@/worker/scrape';
import { launchCampaign, rescrape, setCampaignState, updateCampaign } from '../actions';
import { CampaignFields } from '../campaign-fields';
import { PreviewLaunch, type PortalReady, type PreviewItem } from './preview';

type Campaign = {
  id: string; name: string; status: string; portals: Portal[]; positionInclude: string[]; positionExclude: string[];
  descInclude: string[]; descMode: string; descExclude: string[]; experienceLevels: string[]; companyExclude: string[];
  location: string; maxPages: number; maxListings: number; dryRun: boolean; launchedAt: Date | null; createdAt: Date;
  scrapeSummary: Record<string, {
    status: string; found?: number; matched?: number; rejected?: Record<string, number>; rejectedItems?: RejectedItem[]; error?: string;
  }> | null;
};

const SCRAPE_STATUS: Record<string, [string, Tone]> = {
  pending: ['menunggu', 'gray'], running: ['mencari', 'blue'], done: ['selesai', 'green'], error: ['gagal', 'red'], disabled: ['nonaktif', 'gray'],
};

function Criteria({ c }: { c: Campaign }) {
  const rows: [string, string][] = [
    ['Portal', c.portals.map((p) => PORTAL_LABEL[p]).join(', ')],
    ['Judul', c.positionInclude.join(' / ')],
    ['Kecualikan judul', c.positionExclude.join(', ')],
    [`Deskripsi (${c.descMode === 'and' ? 'semua' : 'salah satu'})`, c.descInclude.join(', ')],
    ['Deskripsi tanpa', c.descExclude.join(', ')],
    ['Level', c.experienceLevels.map(levelLabel).join(', ') || 'semua'],
    ['Kecualikan perusahaan', c.companyExclude.join(', ')],
    ['Lokasi', c.location],
    ['Batas', `${c.maxPages} halaman per kata kunci, ${c.maxListings} lowongan berjudul cocok per portal`],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {rows.filter(([, v]) => v).map(([label, v]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="mt-0.5 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ScrapeSummary({ c }: { c: Campaign }) {
  const s = c.scrapeSummary;
  if (!s) {
    return (
      <div className="space-y-3" aria-label="Menunggu worker">
        {c.portals.map((p) => (
          <div key={p} className="flex items-center gap-3">
            <span className="w-24 text-sm text-muted">{PORTAL_LABEL[p]}</span>
            <span className="skeleton h-3 flex-1" />
          </div>
        ))}
        <p className="text-xs text-muted">Menunggu worker mengambil pencarian ini.</p>
      </div>
    );
  }
  const failed = (s as { error?: unknown }).error;
  if (typeof failed === 'string') return <Notice tone="red">Pencarian gagal: {failed}</Notice>;
  return (
    <ul className="divide-y divide-white/6">
      {PORTALS.filter((p) => s[p]).map((p) => {
        const r = s[p];
        const [label, tone] = SCRAPE_STATUS[r.status] ?? [r.status, 'gray'];
        return (
          <li key={p} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="w-24 font-medium">{PORTAL_LABEL[p]}</span>
              <Badge tone={tone}>{label}</Badge>
              <span className="flex gap-4 text-sm text-muted sm:ml-auto">
                {r.found != null && <span><b className="num font-medium text-ink">{r.found}</b> ditemukan</span>}
                {r.matched != null && <span><b className="num font-medium text-accent">{r.matched}</b> cocok</span>}
              </span>
            </div>
            {r.rejected && Object.keys(r.rejected).length > 0 && (
              <p className="mt-1.5 text-xs text-muted">
                Tersaring: {Object.entries(r.rejected).map(([k, n]) => `${REJECT_LABEL[k as RejectReason] ?? k} ${n}`).join(', ')}
              </p>
            )}
            {r.error && <p className="mt-1.5 text-sm text-rose-200">{r.error}</p>}
            {!!r.rejectedItems?.length && (
              <details className="mt-2">
                <summary className="text-sm text-muted hover:text-ink">Lihat {r.rejectedItems.length} lowongan yang tersaring dan alasannya</summary>
                <ul className="mt-2 space-y-1.5 rounded-control bg-white/4 p-3 text-sm">
                  {r.rejectedItems.map((x) => (
                    <li key={x.url} className="flex flex-wrap gap-x-2">
                      <a href={x.url} target="_blank" rel="noreferrer">{x.title}</a>
                      <span className="text-muted">{x.company}, {REJECT_LABEL[x.reason]}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c] = await sql<Campaign[]>`select * from campaigns where id = ${id} and user_id = ${user.id}`;
  if (!c) notFound();

  const header = (
    <>
      <BackLink href="/campaigns">Cari Loker</BackLink>
      <PageHeader
        title={c.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <CampaignBadge status={c.status} />
            {c.dryRun && <Badge tone="violet"><FlaskConical aria-hidden />uji coba</Badge>}
            <span className="tabular-nums">Dibuat {fmtDateTime(c.createdAt)}{c.launchedAt && <>, diluncurkan {fmtDateTime(c.launchedAt)}</>}</span>
          </span>
        }
      />
    </>
  );

  if (c.status === 'scraping') {
    return (
      <>
        {header}
        <AutoRefresh seconds={3} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="card space-y-5">
            <div>
              <h2>Mencari lowongan</h2>
              <p className="mt-1 text-sm text-muted">Halaman ini diperbarui otomatis. Pencarian 3 portal biasanya selesai dalam beberapa menit.</p>
            </div>
            <ScrapeSummary c={c} />
          </section>
          <section className="card space-y-4 lg:self-start">
            <h2>Kriteria</h2>
            <Criteria c={c} />
          </section>
        </div>
      </>
    );
  }

  if (c.status === 'ready') {
    const settings = await getSettings();
    const bank = await getBank(user.id);
    const rows = await sql<(Omit<PreviewItem, 'questions'> & { questions: string[] })[]>`
      select m.listing_id, m.match_reason, m.experience_levels, m.flags, m.selected, l.portal, l.title, l.company, l.location,
        l.salary_text, l.url, l.apply_method, l.apply_url, l.questions
      from campaign_matches m join job_listings l on l.id = m.listing_id
      where m.campaign_id = ${c.id} order by array_position(array['jobstreet','glints','linkedin'], l.portal), l.posted_at desc nulls last`;
    const items: PreviewItem[] = rows.map((r) => ({
      ...r,
      questions: r.questions.map((q) => {
        const hit = findAnswer(q, bank, r.portal);
        return { q, a: hit.kind === 'found' ? hit.answer : null };
      }),
    }));
    const profile = await getProfile(user.id);
    const accounts = await sql<{ portal: Portal }[]>`select portal from portal_accounts where user_id = ${user.id} and status = 'connected'`;
    const ready = Object.fromEntries(
      await Promise.all(PORTALS.map(async (p): Promise<[Portal, PortalReady]> => [p, {
        connected: accounts.some((a) => a.portal === p),
        missing: AUTO_APPLY[p] ? missingFor(p, profile, await getExtras(user.id, p)) : [],
      }])),
    ) as Record<Portal, PortalReady>;
    return (
      <>
        {header}
        <section className="card space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2>Hasil pencarian</h2>
            <ActionForm action={rescrape} className="ml-auto"><input type="hidden" name="id" value={c.id} /><Submit className="btn btn-secondary"><RefreshCw aria-hidden />Cari ulang</Submit></ActionForm>
          </div>
          <ScrapeSummary c={c} />
          <details className="border-t border-white/8 pt-4" open={items.length === 0}>
            <summary className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline">
              <SlidersHorizontal className="size-4" aria-hidden />Ubah kriteria dan cari ulang
            </summary>
            <ActionForm action={updateCampaign.bind(null, c.id)} className="mt-5 space-y-6">
              <CampaignFields d={c} settings={settings} />
              <Submit>Simpan dan cari ulang</Submit>
            </ActionForm>
          </details>
        </section>
        {items.length === 0 ? (
          <section className="card">
            <EmptyState icon={Inbox} title="Belum ada lowongan yang cocok">
              Lihat daftar yang tersaring di atas. Bila judulnya relevan tetapi memakai kata lain (mis. &quot;Analis Laboratorium&quot;),
              tambahkan kata itu ke kata kunci judul lalu cari ulang.
            </EmptyState>
          </section>
        ) : (
          <PreviewLaunch
            items={items}
            ready={ready}
            settings={{
              delaySec: settings.delaySec, dailyCap: settings.dailyCap,
              dryRunFast: settings.dryRunFast, dryRunDelaySec: settings.dryRunDelaySec,
            }}
            sentToday={await submittedToday(user.id)}
            action={launchCampaign.bind(null, c.id)}
          />
        )}
      </>
    );
  }

  // Launched: progress (RP-05 lite) and controls (SQ-09).
  const settings = await getSettings();
  const counts = Object.fromEntries(
    (await sql<{ status: string; n: number }[]>`select status, count(*)::int as n from applications where campaign_id = ${c.id} group by status`).map((r) => [r.status, r.n]),
  );
  const perPortal = await sql<{ portal: Portal; queued: number; nextApplyAt: Date | null; accountStatus: string | null }[]>`
    select a.portal, count(*)::int as queued, pa.next_apply_at, pa.status as account_status
    from applications a left join portal_accounts pa on pa.user_id = a.user_id and pa.portal = a.portal
    where a.campaign_id = ${c.id} and a.status in ('queued', 'in_progress') group by a.portal, pa.next_apply_at, pa.status`;
  // While an application runs, next_apply_at is its safety lease (15 min), not the gap: show what's being done instead.
  const [current] = await sql<{ portal: Portal; title: string }[]>`
    select a.portal, l.title from applications a join job_listings l on l.id = a.listing_id
    where a.user_id = ${user.id} and a.status = 'in_progress' limit 1`;
  const sent = await submittedToday(user.id);
  const recent = await sql<{ id: string; status: string; failureReason: string | null; updatedAt: Date; title: string; company: string; portal: Portal; link: string }[]>`
    select a.id, a.status, a.failure_reason, a.updated_at, l.title, l.company, l.portal, coalesce(l.apply_url, l.url) as link
    from applications a join job_listings l on l.id = a.listing_id where a.campaign_id = ${c.id} order by a.updated_at desc limit 10`;
  const avg = gapSec(settings, c.dryRun);
  const online = isOnline(await extensionLastSeen(user.id));
  const [{ held }] = await sql<{ held: boolean }[]>`select coalesce(bool_or(held), false) as held from extension_tokens
    where user_id = ${user.id} and last_seen_at > now() - interval '2 minutes'`;

  return (
    <>
      {header}
      {c.status === 'running' && <AutoRefresh seconds={10} />}
      {c.status === 'running' && perPortal.length > 0 && !online && (
        <Notice>
          Ekstensi AutoJobs tidak aktif atau belum dipasangkan ke akun ini, jadi antrean tertahan. Buka Chrome dengan ekstensi yang sudah
          dipasangkan (lihat <Link href="/connections">Koneksi Portal</Link>); antrean berjalan sendiri setelah itu.
        </Notice>
      )}
      {c.status === 'running' && perPortal.length > 0 && online && held && (
        <Notice tone="blue">
          Antrean menunggu persetujuan Anda di Chrome (ditahan sejak Chrome dibuka). Klik <b>Lanjutkan</b> di notifikasi AutoJobs, atau
          buka ikon ekstensi AutoJobs lalu klik <b>Lanjutkan antrean</b>.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Ringkasan status lamaran">
            {([['queued', Hourglass, 'blue'], ['submitted', Send, 'green'], ['needs_action', TriangleAlert, 'amber'], ['failed', CircleX, 'red']] as const).map(([s, icon, tone]) => (
              <Stat key={s} icon={icon} tone={tone} label={STATUS_LABEL[s]} value={(counts[s] ?? 0) + (s === 'queued' ? counts.in_progress ?? 0 : 0)}
                href={`/report?campaign=${c.id}&status=${s}`} />
            ))}
          </section>

          <section className="glass-dense overflow-hidden rounded-card">
            <h2 className="px-4 pb-3 pt-5 sm:px-6">Aktivitas terbaru</h2>
            {recent.length === 0 ? (
              <EmptyState icon={Inbox} title="Belum ada aktivitas">Lamaran pertama muncul di sini begitu antrean berjalan.</EmptyState>
            ) : (
              <ul className="divide-y divide-white/6">
                {recent.map((r, i) => (
                  <li key={r.id} className="rise flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-6" style={{ '--i': i } as React.CSSProperties}>
                    <div className="min-w-0 flex-1">
                      <Link href={`/report/${r.id}`} className="font-medium text-ink hover:text-accent">{r.title}</Link>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                        <span>{r.company}</span><span>{PORTAL_LABEL[r.portal]}</span><span className="tabular-nums">{fmtDateTime(r.updatedAt)}</span>
                      </div>
                      {r.failureReason && (
                        <p className="mt-1.5 text-xs leading-relaxed text-muted">
                          {r.failureReason}
                          {r.status === 'skipped' && <>{' '}<a href={r.link} target="_blank" rel="noreferrer">Buka link lamaran ↗</a></>}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0"><StatusBadge status={r.status} reason={r.failureReason} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Phones: the queue and its controls come first; desktop: a sticky right column. */}
        <aside className="order-first space-y-6 lg:sticky lg:top-24 lg:order-none lg:self-start">
          <section className="card space-y-5">
            <h2>Antrean</h2>
            {perPortal.length === 0 ? (
              <p className="text-sm text-muted">Tidak ada lamaran yang menunggu.</p>
            ) : (
              <ul className="space-y-5">
                {perPortal.map((p) => {
                  const capped = !c.dryRun && (sent[p.portal] ?? 0) >= settings.dailyCap;
                  return (
                    <li key={p.portal} className="space-y-2.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{PORTAL_LABEL[p.portal]}</span>
                        <span className="text-muted"><b className="num font-medium text-ink">{p.queued}</b> menunggu</span>
                      </div>
                      <div className="text-sm">
                        {c.status !== 'running' ? <Badge>pencarian dijeda</Badge>
                          : p.accountStatus !== 'connected' ? <span className="text-rose-200">Menunggu Anda masuk atau verifikasi di Chrome (lihat <Link href="/connections">Koneksi Portal</Link>)</span>
                          : capped ? <Badge tone="amber">batas harian tercapai, lanjut besok</Badge>
                          : current ? (current.portal === p.portal
                            ? <Badge tone="blue"><Hourglass aria-hidden />sedang melamar: {current.title}</Badge>
                            : <Badge>menunggu giliran</Badge>)
                          : p.nextApplyAt && new Date(p.nextApplyAt) > new Date()
                            ? <Badge tone="blue"><Clock aria-hidden /><Countdown to={new Date(p.nextApplyAt).toISOString()} /><span className="num text-sky-200/80">({fmtTime(p.nextApplyAt)})</span></Badge>
                            : <Badge tone="green">segera diproses</Badge>}
                      </div>
                      {!c.dryRun && <Meter value={sent[p.portal] ?? 0} max={settings.dailyCap} label="Terkirim hari ini" />}
                    </li>
                  );
                })}
              </ul>
            )}
            {perPortal.length > 0 && (
              <p className="border-t border-white/8 pt-4 text-xs leading-relaxed text-muted">
                Tiap putaran: satu lamaran per portal berturut-turut, lalu jeda {avg} detik (pengaturan Admin). Perkiraan selesai{' '}
                <b className="num font-medium text-ink">± {formatDuration(Math.max(...perPortal.map((p) => p.queued)) * avg)}</b>.
                {c.dryRun && ' Uji coba tidak memakai kuota harian.'}
              </p>
            )}
            <div className="flex flex-wrap gap-2 [&>*]:grow">
              {c.status === 'running' && <StateButton id={c.id} op="pause" label="Jeda" />}
              {c.status === 'paused' && <StateButton id={c.id} op="resume" label="Lanjutkan" primary />}
              {(c.status === 'running' || c.status === 'paused') && <StateButton id={c.id} op="cancel" label="Batalkan sisa antrean" danger confirm="Batalkan semua lamaran yang masih menunggu?" />}
            </div>
            <div className="flex flex-col gap-1 border-t border-white/8 pt-3">
              <Link href={`/report?campaign=${c.id}`} className="btn btn-quiet justify-start"><ChartColumn aria-hidden />Lihat di laporan</Link>
              {(counts.submitted ?? 0) > 0 && <a href={`/api/campaigns/${c.id}/export`} className="btn btn-quiet justify-start"><Download aria-hidden />Unduh terkirim (Excel/CSV)</a>}
            </div>
          </section>

          <details className="card group">
            <summary className="flex items-center justify-between gap-3">
              <h2>Kriteria pencarian</h2>
              <SlidersHorizontal className="size-4 text-muted transition group-open:text-accent" aria-hidden />
            </summary>
            <div className="mt-4"><Criteria c={c} /></div>
          </details>
        </aside>
      </div>
    </>
  );
}

function StateButton({ id, op, label, primary, danger, confirm }: { id: string; op: string; label: string; primary?: boolean; danger?: boolean; confirm?: string }) {
  return (
    <form action={setCampaignState}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <Submit className={`btn w-full ${primary ? 'btn-primary' : danger ? 'btn-danger' : 'btn-secondary'}`} confirm={confirm}>{label}</Submit>
    </form>
  );
}
