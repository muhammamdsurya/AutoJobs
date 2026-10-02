import { ArrowUpRight, FlaskConical, MapPin } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Submit } from '@autojobs/shared/forms';
import { BackLink, Badge, fmtDateTime, Notice, PageHeader, StatusBadge } from '@autojobs/shared/ui';
import type { Answer, PendingQuestion } from '@/lib/apply-plan';
import { requireUser } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { PORTAL_LABEL, type Portal } from '@autojobs/shared/portals';
import { retryApplication } from '../actions';
import { AnsweredNotice, PendingQuestions } from '../pending-questions';

const EVENT_LABEL: Record<string, string> = {
  queued: 'Masuk antrean', started: 'Mulai memproses', submitted: 'Terkirim', skipped: 'Dilewati', failed: 'Gagal',
  needs_action: 'Perlu tindakan', retry_scheduled: 'Dijadwalkan ulang', recovered: 'Dipulihkan', cancelled: 'Dibatalkan',
  manual_retry: 'Dicoba ulang', dry_run_done: 'Uji coba selesai', screenshot: 'Tangkapan layar', html_snapshot: 'Salinan HTML halaman',
};

type Detail = {
  id: string; status: string; dryRun: boolean; attemptCount: number; submittedAt: Date | null; failureReason: string | null;
  confirmationText: string | null; answers: Answer[] | null; screenshotKey: string | null; createdAt: Date; pendingQuestions: PendingQuestion[] | null;
  title: string; company: string; location: string; url: string; applyUrl: string | null; portal: Portal; campaignName: string; campaignId: string; campaignStatus: string;
  cvName: string | null; cvId: string | null;
};

export default async function ApplicationDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { answered, skipped } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [a] = await sql<Detail[]>`
    select a.id, a.status, a.dry_run, a.attempt_count, a.submitted_at, a.failure_reason, a.confirmation_text, a.answers, a.screenshot_key,
      a.pending_questions, a.created_at, l.title, l.company, l.location, l.url, l.apply_url, l.portal, c.name as campaign_name, c.id as campaign_id, c.status as campaign_status, cv.file_name as cv_name, cv.id as cv_id
    from applications a join job_listings l on l.id = a.listing_id join campaigns c on c.id = a.campaign_id
      left join cv_documents cv on cv.id = a.cv_id
    where a.id = ${id} and a.user_id = ${user.id}`;
  if (!a) notFound();
  const events = await sql<{ id: string; event: string; detail: string | null; hasFile: boolean; createdAt: Date }[]>`
    select id, event, detail, file_key is not null as has_file, created_at from application_events where application_id = ${id} order by id`;

  const facts: [string, React.ReactNode][] = [
    ['Pencarian', <Link key="c" href={`/campaigns/${a.campaignId}`}>{a.campaignName}</Link>],
    ['CV yang dipakai', a.cvId ? <a key="cv" href={`/api/files/cv/${a.cvId}`}>{a.cvName}</a> : '-'],
    ['Terkirim', <span key="t" className="tabular-nums">{fmtDateTime(a.submittedAt)}</span>],
    ['Jumlah percobaan', <span key="n" className="num">{a.attemptCount}</span>],
  ];

  return (
    <>
      <BackLink href="/report">Laporan</BackLink>
      <PageHeader title={a.title} subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-ink">{a.company}</span>
          {a.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{a.location}</span>}
          <Badge>{PORTAL_LABEL[a.portal]}</Badge>
        </span>
      }>
        <span className="flex flex-wrap gap-1.5">
          <StatusBadge status={a.status} reason={a.failureReason} />
          {a.dryRun && <Badge tone="violet"><FlaskConical aria-hidden />uji coba</Badge>}
        </span>
      </PageHeader>
      <p className="-mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">Buka lowongan<ArrowUpRight className="size-3.5" aria-hidden /></a>
        {a.applyUrl && <a href={a.applyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">Lamar di situs perusahaan<ArrowUpRight className="size-3.5" aria-hidden /></a>}
      </p>

      <AnsweredNotice answered={answered} skipped={skipped} />
      {a.status === 'needs_action' && a.pendingQuestions?.length ? <PendingQuestions items={a.pendingQuestions} back={`/report/${a.id}`} /> : null}

      {(a.status === 'failed' || a.status === 'needs_action') && (
        <Notice tone={a.status === 'failed' ? 'red' : 'amber'}>
          <p className="font-medium text-ink">{a.failureReason}</p>
          {a.campaignStatus === 'cancelled' ? (
            <p className="mt-1">
              Pencarian ini sudah dibatalkan, jadi lamaran ini tidak dikirim lagi.
              {a.status === 'needs_action' && ' Jawaban yang Anda isi tetap disimpan ke Bank jawaban, lalu lamaran ini pindah ke Dilewati.'}
            </p>
          ) : (
            <>
              <p className="mt-1">
                Perbaiki penyebabnya dulu (tambah jawaban di <Link href="/profile">Bank jawaban</Link>, sambungkan ulang di{' '}
                <Link href="/connections">Koneksi Portal</Link>, atau lengkapi profil), lalu coba lagi.
              </p>
              <form action={retryApplication} className="mt-3">
                <input type="hidden" name="id" value={a.id} />
                <Submit>Coba lagi</Submit>
              </form>
            </>
          )}
        </Notice>
      )}

      <section className="card" aria-label="Ringkasan lamaran">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm lg:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-1 truncate">{v}</dd>
            </div>
          ))}
          {a.status !== 'failed' && a.status !== 'needs_action' && a.failureReason && (
            <div className="col-span-2 lg:col-span-4"><dt className="text-xs text-muted">Keterangan</dt><dd className="mt-1">{a.failureReason}</dd></div>
          )}
          {a.confirmationText && (
            <div className="col-span-2 lg:col-span-4"><dt className="text-xs text-muted">Konfirmasi portal</dt><dd className="mt-1">{a.confirmationText}</dd></div>
          )}
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="space-y-6">
          {a.screenshotKey && (
            <section className="card">
              <h2 className="mb-3">{a.status === 'submitted' ? 'Bukti pengiriman' : 'Tangkapan layar terakhir'}</h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/shot/${a.id}`} alt="Tangkapan layar halaman portal" className="max-h-[70vh] w-full rounded-control border border-white/10 bg-raised object-contain object-top" />
            </section>
          )}

          <section className="card">
            <h2 className="mb-3">Jawaban yang dikirim</h2>
            {a.answers?.length ? (
              <dl className="glass-dense divide-y divide-white/6 overflow-hidden rounded-control text-sm">
                {a.answers.map((x, i) => (
                  <div key={i} className="grid gap-1.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-muted">{x.question}</dt>
                    <dd className="min-w-0">
                      <span className="whitespace-pre-wrap text-ink">{x.answer || '-'}</span>
                      <span className="mt-1 block text-xs text-muted">{x.source}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : <p className="text-sm text-muted">Belum ada jawaban yang diisi.</p>}
          </section>
        </div>

        <section className="card lg:sticky lg:top-24">
          <h2 className="mb-3">Riwayat</h2>
          {events.length ? (
            <ol className="relative space-y-4 border-l border-white/10 pl-4 text-sm">
              {events.map((e) => (
                <li key={e.id} className="min-w-0">
                  <p className="text-xs tabular-nums text-muted">{fmtDateTime(e.createdAt)}</p>
                  <p className="font-medium">{EVENT_LABEL[e.event] ?? e.event}</p>
                  {e.detail && <p className="break-words text-muted">{e.detail}</p>}
                  {e.hasFile && <a href={`/api/files/event/${e.id}`} target="_blank" rel="noreferrer" className="text-xs">{e.event === 'screenshot' ? 'Lihat' : 'Unduh'}</a>}
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted">Belum ada riwayat.</p>}
        </section>
      </div>
    </>
  );
}
