import { Compass } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@autojobs/shared/ui';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center gap-8 px-4 py-12">
      <Logo href="/" />
      <section className="panel">
        <span className="grid size-12 place-items-center rounded-card bg-accent/10 text-accent ring-1 ring-inset ring-accent/25"><Compass className="size-6" aria-hidden /></span>
        <p className="num mt-6 text-sm text-muted">404</p>
        <h1 className="mt-1 text-3xl">Halaman tidak ditemukan</h1>
        <p className="mt-3 max-w-[45ch] leading-relaxed text-muted">
          Tautannya mungkin salah ketik, atau halamannya sudah dihapus. Lamaran dan pencarian Anda tidak terpengaruh.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/campaigns" className="btn btn-primary">Ke Cari Loker</Link>
          <Link href="/" className="btn btn-secondary">Beranda</Link>
        </div>
      </section>
    </main>
  );
}
