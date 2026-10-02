'use client';

import { BookOpen, ChartColumn, Plug, Search, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/campaigns', label: 'Cari Loker', icon: Search },
  { href: '/report', label: 'Laporan', icon: ChartColumn },
  { href: '/connections', label: 'Koneksi', icon: Plug },
  { href: '/profile', label: 'Profil', icon: UserRound },
  { href: '/guide', label: 'Panduan', icon: BookOpen },
];

type Props = { needs: number; broken: boolean };

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(href + '/');
}

// Real state only: how many applications need the user, or a portal that needs signing in again.
function Marker({ href, needs, broken }: { href: string; needs: number; broken: boolean }) {
  if (href === '/report' && needs > 0)
    return (
      <span className="num grid h-4.5 min-w-4.5 place-items-center rounded-full bg-amber-300 px-1 text-[10px] font-semibold leading-none text-accent-ink">
        {needs}<span className="sr-only"> perlu tindakan</span>
      </span>
    );
  if (href === '/connections' && broken) return <span className="size-2 rounded-full bg-amber-300" role="img" aria-label="perlu perhatian" />;
  return null;
}

// Desktop: links in the glass top bar.
export function TopNav({ needs, broken }: Props) {
  const active = useActive();
  return (
    <nav className="hidden items-center gap-1 lg:flex" aria-label="Menu utama">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const on = active(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={`relative flex h-10 items-center gap-2 rounded-control px-3 text-sm font-medium no-underline transition-colors hover:no-underline ${
              on ? 'bg-white/10 text-ink' : 'text-muted hover:bg-white/6 hover:text-ink'
            }`}
          >
            <Icon className={`size-4 ${on ? 'text-accent' : ''}`} aria-hidden />
            {label}
            <Marker href={href} needs={needs} broken={broken} />
            {on && <span aria-hidden className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

// Phones and tablets: a glass bottom tab bar within thumb reach.
export function BottomNav({ needs, broken }: Props) {
  const active = useActive();
  return (
    <nav className="glass-bar fixed inset-x-0 bottom-0 z-30 rounded-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Menu utama">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const on = active(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`relative flex min-h-15 flex-col items-center justify-center gap-1 text-[11px] font-medium no-underline hover:no-underline ${on ? 'text-accent' : 'text-muted'}`}
              >
                {on && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-accent" />}
                <span className="relative">
                  <Icon className="size-5.5" aria-hidden />
                  <span className="absolute -right-2.5 -top-1.5"><Marker href={href} needs={needs} broken={broken} /></span>
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
