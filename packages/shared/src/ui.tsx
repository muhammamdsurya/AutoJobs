import {
  ChevronLeft, CircleAlert, CircleCheck, CircleMinus, CircleSlash, CircleX, Clock, FlaskConical, Hourglass, Info, ListChecks, Pause, Play, ScanSearch, TriangleAlert, Zap,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { CAMPAIGN_STATUS_LABEL, DRY_RUN_OK, STATUS_LABEL } from './portals';
import { rp, type Pack } from './tokens';

// Chip colours. Status tones are semantic (see the tokens in globals.css); 'violet' is kept as a name for
// compatibility and renders as a neutral outline (uji coba and other informational tags).
const TONES = {
  gray: 'bg-white/6 text-neutral ring-white/10',
  blue: 'bg-sky-400/12 text-sky-200 ring-sky-300/25',
  green: 'bg-accent/12 text-teal-200 ring-accent/30',
  amber: 'bg-amber-400/12 text-amber-200 ring-amber-300/25',
  red: 'bg-rose-400/12 text-rose-200 ring-rose-300/25',
  violet: 'bg-transparent text-ink/85 ring-white/25',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-chip px-2 py-0.5 text-xs font-medium ring-1 ring-inset [&>svg]:size-3.5 ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-ink no-underline hover:no-underline" aria-label="AutoJobs: beranda">
      <span className="grid size-9 place-items-center rounded-control bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.4)]">
        <Zap className="size-5" fill="currentColor" aria-hidden />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">Auto<span className="text-accent">Jobs</span></span>
    </Link>
  );
}

// A number with an icon, e.g. "12 Terkirim". A link when `href` is given (report filters).
export function Stat({ icon: Icon, label, value, tone = 'blue', href, active }: {
  icon: LucideIcon; label: string; value: React.ReactNode; tone?: Tone; href?: string; active?: boolean;
}) {
  const body = (
    <>
      <span className={`stat-icon ring-1 ring-inset ${TONES[tone]}`}><Icon aria-hidden /></span>
      <span className="min-w-0">
        <span className="num block text-2xl font-semibold leading-tight">{value}</span>
        <span className="block text-xs font-medium leading-snug text-muted">{label}</span>
      </span>
    </>
  );
  const cls = `stat ${active ? 'border-accent/60 ring-2 ring-accent/25' : ''}`;
  return href ? <Link href={href} className={cls} aria-current={active ? 'true' : undefined}>{body}</Link> : <div className={cls}>{body}</div>;
}

// Status chips carry an icon too, so the state never depends on colour alone.
const STATUS_TONE: Record<string, [Tone, LucideIcon]> = {
  queued: ['blue', Clock],
  in_progress: ['blue', Hourglass],
  submitted: ['green', CircleCheck],
  failed: ['red', CircleX],
  needs_action: ['amber', TriangleAlert],
  skipped: ['gray', CircleMinus],
  cancelled: ['gray', CircleSlash],
};

export function StatusBadge({ status, reason }: { status: string; reason?: string | null }) {
  if (status === 'skipped' && reason === DRY_RUN_OK) return <Badge tone="green"><FlaskConical aria-hidden />Uji coba berhasil</Badge>;
  const [tone, Icon] = STATUS_TONE[status] ?? ['gray', CircleMinus];
  return <Badge tone={tone}><Icon aria-hidden />{STATUS_LABEL[status] ?? status}</Badge>;
}

const CAMPAIGN_TONE: Record<string, [Tone, LucideIcon]> = {
  scraping: ['blue', ScanSearch],
  ready: ['amber', ListChecks],
  running: ['green', Play],
  paused: ['gray', Pause],
  completed: ['green', CircleCheck],
  cancelled: ['gray', CircleSlash],
};

export function CampaignBadge({ status }: { status: string }) {
  const [tone, Icon] = CAMPAIGN_TONE[status] ?? ['gray', CircleMinus];
  return <Badge tone={tone}><Icon aria-hidden />{CAMPAIGN_STATUS_LABEL[status] ?? status}</Badge>;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-mb-2 inline-flex min-h-8 items-center gap-1 text-sm text-muted hover:text-ink">
      <ChevronLeft className="size-4" aria-hidden />{children}
    </Link>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1>{title}</h1>
        {subtitle && <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 [&>.btn]:grow sm:[&>.btn]:grow-0">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function Notice({ tone = 'amber', children }: { tone?: 'amber' | 'red' | 'green' | 'blue'; children: React.ReactNode }) {
  const [cls, Icon] = {
    amber: ['border-amber-300/25 bg-amber-400/10 [&>svg]:text-amber-300', TriangleAlert],
    red: ['border-rose-300/25 bg-rose-400/10 [&>svg]:text-rose-300', CircleAlert],
    green: ['border-accent/30 bg-accent/10 [&>svg]:text-accent', CircleCheck],
    blue: ['border-sky-300/25 bg-sky-400/10 [&>svg]:text-sky-300', Info],
  }[tone] as [string, LucideIcon];
  return (
    <div className={`flex gap-3 rounded-card border px-4 py-3 text-sm leading-relaxed text-ink backdrop-blur-md ${cls}`}>
      <Icon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// What an empty list says instead of nothing: what it is, and how to fill it.
export function EmptyState({ icon: Icon, title, children, action }: {
  icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-card bg-accent/10 text-accent ring-1 ring-inset ring-accent/25">
        <Icon className="size-7" aria-hidden />
      </span>
      <div>
        <h2 className="text-xl">{title}</h2>
        {children && <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}

// "12 dari 25 hari ini": how much of a limit is used (daily application cap per portal).
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  const full = value >= max;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted">{label}</span>
        <span className={`num font-medium ${full ? 'text-amber-200' : 'text-ink'}`}>{value}/{max}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <div className={`h-full rounded-full ${full ? 'bg-amber-300' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Token packs (landing pricing, Token page); `action` adds a control per pack (the Token page's "Beli").
// "Hemat X%" is against the smallest pack's price per token; the lowest price per token is "Paling hemat".
export function PackList({ packs, className = '', action }: { packs: Pack[]; className?: string; action?: (p: Pack) => React.ReactNode }) {
  const per = (p: Pack) => p.price / p.tokens;
  const base = packs.reduce<Pack | undefined>((a, p) => (!a || p.tokens < a.tokens ? p : a), undefined);
  const best = packs.reduce<Pack | undefined>((a, p) => (!a || per(p) < per(a) ? p : a), undefined);
  return (
    <ul className={`glass-dense divide-y divide-white/6 overflow-hidden rounded-card ${className}`}>
      {packs.map((p) => {
        const off = base ? Math.round((1 - per(p) / per(base)) * 100) : 0;
        const top = p === best && off > 0;
        return (
          <li key={p.id} className={`flex items-center justify-between gap-4 px-5 py-5 sm:gap-6 sm:px-6 sm:py-6 ${top ? 'bg-accent/[0.07] shadow-[inset_3px_0_0_var(--color-accent)]' : ''}`}>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className="font-semibold"><span className="num text-2xl">{p.tokens}</span> token</span>
                {off > 0 && <Badge tone="green">Hemat {off}%</Badge>}
                {top && <span className="text-xs font-medium text-accent">Paling hemat</span>}
              </p>
              <p className="mt-1.5 text-sm text-muted"><span className="num">{rp(Math.round(per(p)))}</span> per Cari Loker</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-3 sm:flex-row sm:items-center sm:gap-6">
              <p className="num text-2xl font-semibold">{rp(p.price)}</p>
              {action?.(p)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) : '-';

export const fmtTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '-';
