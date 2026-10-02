import { ChevronRight, FlaskConical, Plus, ScanSearch } from 'lucide-react';
import Link from 'next/link';
import { Badge, CampaignBadge, EmptyState, fmtDateTime, PageHeader } from '@autojobs/shared/ui';
import { requireUser } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { PORTAL_LABEL, type Portal } from '@autojobs/shared/portals';

type Row = { id: string; name: string; status: string; portals: Portal[]; createdAt: Date; dryRun: boolean; matches: number; submitted: number; pending: number; needs: number };

export default async function CampaignsPage() {
  const user = await requireUser();
  const rows = await sql<Row[]>`select c.id, c.name, c.status, c.portals, c.created_at, c.dry_run,
      (select count(*)::int from campaign_matches m where m.campaign_id = c.id) as matches,
      (select count(*)::int from applications a where a.campaign_id = c.id and a.status = 'submitted') as submitted,
      (select count(*)::int from applications a where a.campaign_id = c.id and a.status in ('queued', 'in_progress')) as pending,
      (select count(*)::int from applications a where a.campaign_id = c.id and a.status = 'needs_action') as needs
    from campaigns c where c.user_id = ${user.id} order by c.created_at desc`;
  return (
    <>
      <PageHeader title="Cari Loker" subtitle="Setiap pencarian: cari lowongan, tinjau hasilnya, lalu lamar per putaran, satu lamaran di tiap portal lalu jeda.">
        <Link href="/campaigns/new" className="btn btn-primary"><Plus aria-hidden />Pencarian baru</Link>
      </PageHeader>
      {rows.length === 0 ? (
        <section className="card">
          <EmptyState icon={ScanSearch} title="Belum ada pencarian" action={<Link href="/campaigns/new" className="btn btn-primary"><Plus aria-hidden />Buat pencarian</Link>}>
            Lengkapi <Link href="/profile">Profil</Link>, hubungkan akun di <Link href="/connections">Koneksi Portal</Link>, lalu buat pencarian pertama Anda.
          </EmptyState>
        </section>
      ) : (
        <ul className="glass-dense divide-y divide-white/6 overflow-hidden rounded-card">
          {rows.map((r, i) => (
            <li key={r.id} className="rise" style={{ '--i': i } as React.CSSProperties}>
              <Link href={`/campaigns/${r.id}`}
                className="group grid gap-3 px-4 py-4 text-ink no-underline transition-colors hover:bg-white/4 hover:no-underline sm:px-6 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-8">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-sans text-base font-semibold">{r.name}</h2>
                    <CampaignBadge status={r.status} />
                    {r.dryRun && <Badge tone="violet"><FlaskConical aria-hidden />uji coba</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {r.portals.map((p) => PORTAL_LABEL[p]).join(', ')}<span className="mx-1.5 text-white/20">/</span><span className="tabular-nums">{fmtDateTime(r.createdAt)}</span>
                  </p>
                </div>
                <dl className="grid grid-cols-4 gap-4 text-sm md:gap-6">
                  {([['Cocok', r.matches, ''], ['Antre', r.pending, ''], ['Terkirim', r.submitted, 'text-accent'], ['Tindakan', r.needs, r.needs ? 'text-amber-300' : '']] as const).map(([label, n, color]) => (
                    <div key={label} className="flex flex-col-reverse">
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className={`num text-lg font-semibold ${n ? color : 'text-ink/60'}`}>{n}</dd>
                    </div>
                  ))}
                </dl>
                <ChevronRight className="hidden size-5 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent md:block" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
