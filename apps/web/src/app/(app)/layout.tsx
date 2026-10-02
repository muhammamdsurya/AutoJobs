import { Coins, LogOut } from 'lucide-react';
import Link from 'next/link';
import { BottomNav, TopNav } from '@/components/nav';
import { PhoneNotice } from '@/components/phone-notice';
import { Logo, Notice } from '@autojobs/shared/ui';
import { requireUser } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { FREE_SEARCHES } from '@autojobs/shared/tokens';
import { logout } from '../(auth)/actions';
import { Tutorial } from './guide/tutorial';
import type { Metadata } from 'next';

// Signed-in pages: never in search results (robots.txt keeps crawlers out as well).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // US-9: in-app notification of items that need the user (Phase 2 adds email/WhatsApp).
  const [{ needs, broken, tokens, tutorial }] = await sql<{ needs: number; broken: number; tokens: number; tutorial: boolean }[]>`select
    (select count(*)::int from applications where user_id = ${user.id} and status = 'needs_action') as needs,
    (select count(*)::int from portal_accounts where user_id = ${user.id} and status <> 'connected') as broken,
    (select tokens from users where id = ${user.id}) as tokens,
    (select tutorial_seen_at is null from users where id = ${user.id}) as tutorial`;
  const nav = { needs, broken: broken > 0 };
  const admin = user.role === 'admin'; // searches without tokens
  const iconBtn = 'grid size-10 cursor-pointer place-items-center rounded-control text-muted no-underline transition-colors hover:bg-white/8 hover:text-ink hover:no-underline';
  const empty = !admin && tokens === 0;
  return (
    <div className="min-h-dvh">
      <a href="#konten" className="skip-link">Langsung ke konten</a>
      <header className="glass-bar sticky top-0 z-30 border-x-0 border-t-0">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo href="/campaigns" />
          <TopNav {...nav} />
          <div className="ml-auto flex items-center gap-1">
            {/* Token balance on every page (phones too); admins search without tokens. */}
            <Link
              href="/token"
              aria-label={`Token: ${admin ? 'tanpa batas' : tokens}`}
              className={`flex h-10 items-center gap-1.5 rounded-control px-3 text-sm font-medium no-underline transition-colors hover:bg-white/8 hover:no-underline ${
                empty ? 'bg-amber-400/10 text-amber-200 ring-1 ring-inset ring-amber-300/25' : 'text-muted hover:text-ink'}`}
            >
              <Coins className={`size-4.5 ${empty ? '' : 'text-accent'}`} aria-hidden />
              <span className={`num ${empty ? '' : 'text-ink'}`}>{admin ? '∞' : tokens}</span>
              <span className="hidden sm:inline">token</span>
            </Link>
            <form action={logout}>
              <button className={iconBtn} aria-label="Keluar" title="Keluar"><LogOut className="size-5" /></button>
            </form>
          </div>
        </div>
      </header>
      <main id="konten" className="mx-auto max-w-6xl space-y-6 px-4 pb-32 pt-8 lg:pb-16">
        {needs > 0 && (
          <Notice>
            {needs} lamaran perlu tindakan Anda (pertanyaan baru, CAPTCHA, atau sesi kedaluwarsa).{' '}
            <Link href="/report?status=needs_action" className="font-semibold">Lihat</Link>
          </Notice>
        )}
        {broken > 0 && (
          <Notice>Ada portal yang perlu Anda masuki atau verifikasi di Chrome. <Link href="/connections" className="font-semibold">Buka Koneksi Portal</Link></Notice>
        )}
        {children}
      </main>
      <BottomNav {...nav} />
      {tutorial && <Tutorial auto freeTokens={FREE_SEARCHES} />}
      <PhoneNotice />{/* after the tutorial: opens once that one is closed */}
    </div>
  );
}
