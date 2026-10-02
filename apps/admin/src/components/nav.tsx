'use client';

import { BadgeDollarSign, ChartNoAxesCombined, LayoutDashboard, ScrollText, Settings, Tags, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const ITEMS = [
  { href: '/', label: 'Ringkasan', icon: LayoutDashboard },
  { href: '/users', label: 'Pengguna', icon: Users },
  { href: '/payments', label: 'Pembayaran', icon: BadgeDollarSign },
  { href: '/revenue', label: 'Pendapatan', icon: ChartNoAxesCombined },
  { href: '/pricing', label: 'Harga', icon: Tags },
  { href: '/audit', label: 'Audit', icon: ScrollText },
  { href: '/settings', label: 'Pengaturan', icon: Settings },
];

// A row of its own under the header that scrolls sideways by itself when it doesn't fit (phones), never the page.
// The active item is scrolled into view. `attention`: payments waiting for a person (proofs, unrecognised DANA payments).
export function ConsoleNav({ attention }: { attention: number }) {
  const path = usePathname();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.querySelector('[aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [path]);
  return (
    <nav ref={ref} className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-2 py-1 [scrollbar-width:thin]" aria-label="Menu konsol">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const on = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={`flex h-10 shrink-0 items-center gap-2 rounded-control px-3 text-sm font-medium no-underline transition-colors hover:no-underline ${
              on ? 'bg-white/10 text-ink' : 'text-muted hover:bg-white/6 hover:text-ink'}`}
          >
            <Icon className={`size-4 ${on ? 'text-accent' : ''}`} aria-hidden />
            {label}
            {href === '/payments' && attention > 0 && (
              <span className="num grid h-4.5 min-w-4.5 place-items-center rounded-full bg-amber-300 px-1 text-[10px] font-semibold leading-none text-accent-ink">
                {attention}<span className="sr-only"> perlu diperiksa</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
