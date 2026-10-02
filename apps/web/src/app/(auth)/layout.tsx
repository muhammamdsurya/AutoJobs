import { CircleCheck, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@autojobs/shared/ui';

const POINTS = [
  'Cari lowongan di JobStreet, Glints, dan LinkedIn sekaligus',
  'Saring otomatis sesuai judul, deskripsi, dan level pengalaman',
  'Lamar bertahap dari Chrome Anda sendiri, dengan jeda aman',
  'Laporan lengkap: terkirim, perlu tindakan, dan bukti pengiriman',
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[100dvh] max-w-6xl lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16 lg:px-8">
      <aside className="hidden flex-col justify-between py-12 lg:flex">
        <Logo href="/" />
        <div className="max-w-md">
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">Satu profil, tiga portal, lamaran berjalan sendiri.</h1>
          <ul className="mt-10 space-y-4">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3 leading-relaxed text-muted"><CircleCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />{p}</li>
            ))}
          </ul>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted"><ShieldCheck className="size-4 text-accent" aria-hidden />AutoJobs tidak pernah menyimpan kata sandi portal Anda.</p>
      </aside>
      <main className="flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-0">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo href="/" /></div>
          <div className="panel route-enter">{children}</div>
          <p className="mt-6 text-center text-xs">
            <Link href="/legal" className="text-muted hover:text-ink">Ketentuan Layanan &amp; Kebijakan Privasi</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
