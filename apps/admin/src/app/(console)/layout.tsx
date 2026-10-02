import { LogOut } from 'lucide-react';
import { requireAdmin } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { Logo } from '@autojobs/shared/ui';
import { ConsoleNav } from '@/components/nav';
import { logout } from '../login/actions';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  // Not enough on its own: on client navigations (RSC requests) Next.js can skip a layout, so EVERY page in this
  // console must call requireAdmin() itself as well.
  const admin = await requireAdmin();
  const [{ attention }] = await sql<{ attention: number }[]>`select
    ((select count(*) from topups where proof_key is not null and status in ('pending', 'expired'))
      + (select count(*) from dana_transactions where status = 'unmatched'))::int as attention`;
  return (
    <div className="min-h-dvh">
      <a href="#konten" className="skip-link">Langsung ke konten</a>
      <header className="glass-bar sticky top-0 z-30 border-x-0 border-t-0">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Logo href="/" />
          <span className="rounded-chip border border-white/12 px-2 py-0.5 text-xs font-medium text-muted">Admin</span>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <span className="hidden max-w-56 truncate text-sm text-muted sm:inline">{admin.email}</span>
            <form action={logout}>
              <button className="grid size-10 cursor-pointer place-items-center rounded-control text-muted transition-colors hover:bg-white/8 hover:text-ink" aria-label="Keluar" title="Keluar">
                <LogOut className="size-5" />
              </button>
            </form>
          </div>
        </div>
        <div className="border-t border-white/8"><ConsoleNav attention={attention} /></div>
      </header>
      <main id="konten" className="mx-auto max-w-7xl space-y-6 px-4 pb-16 pt-8">{children}</main>
    </div>
  );
}
