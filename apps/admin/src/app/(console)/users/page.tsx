import { ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { sql } from '@autojobs/shared/db';
import { rp } from '@autojobs/shared/tokens';
import { Badge, EmptyState, fmtDateTime, PageHeader } from '@autojobs/shared/ui';
import { requireAdmin } from '@autojobs/shared/auth';

const PAGE = 50;
const FILTERS: Record<string, [string, ReturnType<typeof sql>]> = {
  all: ['Semua', sql`true`],
  paying: ['Pernah membeli', sql`exists (select 1 from topups t where t.user_id = u.id and t.status = 'paid')`],
  no_tokens: ['Token habis', sql`u.tokens = 0 and u.role <> 'admin'`],
  suspended: ['Ditangguhkan', sql`u.suspended_at is not null`],
  admin: ['Admin', sql`u.role = 'admin'`],
};

type Row = {
  id: string; email: string; role: string; tokens: number; createdAt: Date; suspended: boolean; verified: boolean;
  fullName: string | null; phone: string | null; sent: number; searches: number; bought: number; spent: number;
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; p?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 100);
  const f = sp.f && FILTERS[sp.f] ? sp.f : 'all';
  const page = Math.max(1, Number(sp.p) || 1);
  const like = `%${q}%`;
  const rows = await sql<Row[]>`
    select u.id, u.email, u.role, u.tokens, u.created_at, u.suspended_at is not null as suspended, u.email_verified_at is not null as verified,
      nullif(p.full_name, '') as full_name, case when p.phone <> '' then p.phone_country || ' ' || p.phone end as phone,
      (select count(*) from applications a where a.user_id = u.id and a.status = 'submitted' and not a.dry_run)::int as sent,
      (select count(*) from campaigns c where c.user_id = u.id)::int as searches,
      (select coalesce(sum(t.tokens), 0) from topups t where t.user_id = u.id and t.status = 'paid')::int as bought,
      (select coalesce(sum(t.amount), 0) from topups t where t.user_id = u.id and t.status = 'paid')::int as spent
    from users u left join candidate_profiles p on p.user_id = u.id
    where ${FILTERS[f][1]} and (${q} = '' or u.email ilike ${like} or p.full_name ilike ${like} or p.phone like ${'%' + q.replace(/\D/g, '') + '%'} and ${q.replace(/\D/g, '')} <> '')
    order by u.created_at desc limit ${PAGE + 1} offset ${(page - 1) * PAGE}`;
  const more = rows.length > PAGE;
  const link = (o: { f?: string; p?: number }) => {
    const u = new URLSearchParams();
    if (q) u.set('q', q);
    if ((o.f ?? f) !== 'all') u.set('f', o.f ?? f);
    if ((o.p ?? 1) > 1) u.set('p', String(o.p));
    return `/users${u.size ? `?${u}` : ''}`;
  };

  return (
    <>
      <PageHeader title="Pengguna" subtitle="Nama, nomor HP, lamaran terkirim, dan pemakaian token setiap akun. Token terpakai = jumlah pencarian baru." />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form className="flex w-full max-w-md gap-2" role="search">
          {f !== 'all' && <input type="hidden" name="f" value={f} />}
          <input className="input" name="q" defaultValue={q} placeholder="Cari email, nama, atau nomor HP" aria-label="Cari pengguna" />
          <button className="btn btn-secondary"><Search aria-hidden />Cari</button>
        </form>
        <nav className="flex flex-wrap gap-2" aria-label="Saring pengguna">
          {Object.entries(FILTERS).map(([k, [label]]) => (
            <Link key={k} href={link({ f: k })} aria-current={k === f ? 'true' : undefined}
              className={`rounded-chip border px-3 py-1.5 text-sm no-underline hover:no-underline ${k === f ? 'border-accent/55 bg-accent/10 text-teal-100' : 'border-white/12 bg-white/4 text-muted hover:text-ink'}`}>
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <section className="card"><EmptyState icon={Users} title="Tidak ada pengguna">Tidak ada akun yang cocok dengan pencarian atau saringan ini.</EmptyState></section>
      ) : (
        <section className="glass-dense overflow-x-auto rounded-card">
          <table className="table table-stack">
            <thead>
              <tr>
                <th className="sm:pl-6">Pengguna</th><th>No. HP</th><th className="text-right">Lamaran terkirim</th><th className="text-right">Token sisa</th>
                <th className="text-right">Terpakai</th><th className="text-right">Dibeli</th><th className="text-right">Belanja</th><th className="sm:pr-6">Bergabung</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE).map((r) => (
                <tr key={r.id} className="tabular-nums">
                  <td className="sm:pl-6">
                    <Link href={`/users/${r.id}`} className="font-medium text-ink hover:text-accent">{r.fullName ?? r.email}</Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {r.fullName && <span className="break-all">{r.email}</span>}
                      {r.role === 'admin' && <Badge tone="violet">admin</Badge>}
                      {r.suspended && <Badge tone="red">ditangguhkan</Badge>}
                      {!r.verified && <Badge>belum verifikasi</Badge>}
                    </span>
                  </td>
                  <td data-label="No. HP">{r.phone ?? <span className="text-muted">-</span>}</td>
                  <td data-label="Lamaran terkirim" className="sm:text-right">{r.sent}</td>
                  <td data-label="Token sisa" className="sm:text-right">{r.role === 'admin' ? '∞' : r.tokens}</td>
                  <td data-label="Terpakai" className="sm:text-right">{r.role === 'admin' ? '-' : r.searches}</td>
                  <td data-label="Dibeli" className="sm:text-right">{r.bought}</td>
                  <td data-label="Belanja" className="sm:text-right">{r.spent ? rp(r.spent) : '-'}</td>
                  <td data-label="Bergabung" className="text-xs text-muted sm:pr-6">{fmtDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {(page > 1 || more) && (
        <nav className="flex justify-between" aria-label="Halaman">
          {page > 1 ? <Link href={link({ p: page - 1 })} className="btn btn-quiet"><ChevronLeft aria-hidden />Sebelumnya</Link> : <span />}
          {more && <Link href={link({ p: page + 1 })} className="btn btn-quiet">Berikutnya<ChevronRight aria-hidden /></Link>}
        </nav>
      )}
    </>
  );
}
