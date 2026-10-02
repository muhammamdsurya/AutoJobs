import { ChevronLeft, ChevronRight, ScrollText, Search } from 'lucide-react';
import Link from 'next/link';
import { sql } from '@autojobs/shared/db';
import { EmptyState, fmtDateTime, PageHeader } from '@autojobs/shared/ui';
import { ACTION_LABEL, describe } from '@/lib/audit';
import { requireAdmin } from '@autojobs/shared/auth';

const PAGE = 100;
type Row = { id: string; action: string; detail: Record<string, unknown> | null; createdAt: Date; userId: string | null; userEmail: string | null; actor: string | null };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; action?: string; p?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 100);
  const action = sp.action && /^[a-z_]+$/.test(sp.action) ? sp.action : '';
  const page = Math.max(1, Number(sp.p) || 1);
  const actions = (await sql<{ action: string }[]>`select distinct action from audit_log order by action`).map((r) => r.action);
  const rows = await sql<Row[]>`
    select a.id, a.action, a.detail, a.created_at, a.user_id, u.email as user_email, ac.email as actor
    from audit_log a left join users u on u.id = a.user_id left join users ac on ac.id = a.actor_id
    where (${action} = '' or a.action = ${action}) and (${q} = '' or u.email ilike ${'%' + q + '%'} or ac.email ilike ${'%' + q + '%'})
    order by a.id desc limit ${PAGE + 1} offset ${(page - 1) * PAGE}`;
  const more = rows.length > PAGE;
  const link = (p: number) => `/audit?${new URLSearchParams({ ...(q && { q }), ...(action && { action }), ...(p > 1 && { p: String(p) }) })}`;

  return (
    <>
      <PageHeader title="Audit" subtitle="Semua kejadian penting: pendaftaran, pembelian dan penyesuaian token, penangguhan, perubahan harga dan pengaturan, serta tindakan admin." />
      <form className="card flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
        <label className="block flex-1"><span className="label">Email pengguna atau admin</span><input className="input" name="q" defaultValue={q} placeholder="nama@contoh.com" /></label>
        <label className="block sm:w-72">
          <span className="label">Kejadian</span>
          <select className="input" name="action" defaultValue={action}>
            <option value="">Semua kejadian</option>
            {actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}
          </select>
        </label>
        <button className="btn btn-primary"><Search aria-hidden />Saring</button>
      </form>

      {rows.length === 0 ? (
        <section className="card"><EmptyState icon={ScrollText} title="Tidak ada catatan">Tidak ada kejadian yang cocok dengan saringan ini.</EmptyState></section>
      ) : (
        <section className="glass-dense overflow-x-auto rounded-card">
          <table className="table table-stack">
            <thead><tr><th className="sm:pl-6">Waktu</th><th>Kejadian</th><th>Pengguna</th><th>Oleh</th><th className="sm:pr-6">Detail</th></tr></thead>
            <tbody>
              {rows.slice(0, PAGE).map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs text-muted tabular-nums sm:pl-6">{fmtDateTime(r.createdAt)}</td>
                  <td data-label="Kejadian" className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td data-label="Pengguna" className="break-all">
                    {r.userEmail ? <Link href={`/users/${r.userId}`}>{r.userEmail}</Link> : <span className="text-muted">{r.userId ? 'akun dihapus' : '-'}</span>}
                  </td>
                  <td data-label="Oleh" className="break-all text-sm">{r.actor && r.actor !== r.userEmail ? r.actor : <span className="text-muted">{r.userEmail ? 'pengguna' : 'sistem'}</span>}</td>
                  <td data-label="Detail" className="max-w-md break-words text-xs text-muted sm:pr-6">{describe(r.detail) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {(page > 1 || more) && (
        <nav className="flex justify-between" aria-label="Halaman">
          {page > 1 ? <Link href={link(page - 1)} className="btn btn-quiet"><ChevronLeft aria-hidden />Lebih baru</Link> : <span />}
          {more && <Link href={link(page + 1)} className="btn btn-quiet">Lebih lama<ChevronRight aria-hidden /></Link>}
        </nav>
      )}
    </>
  );
}
