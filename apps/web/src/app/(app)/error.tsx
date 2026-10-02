'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

// A page that threw while rendering. The app shell (navigation) stays usable around it.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="card mx-auto max-w-xl" role="alert">
      <div className="flex flex-col items-center gap-4 px-2 py-8 text-center">
        <span className="grid size-14 place-items-center rounded-card bg-rose-400/12 text-rose-300 ring-1 ring-inset ring-rose-300/25">
          <TriangleAlert className="size-7" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl">Halaman ini gagal dimuat</h1>
          <p className="mx-auto mt-2 max-w-[45ch] text-sm leading-relaxed text-muted">
            Terjadi kesalahan di server. Coba muat ulang; bila tetap gagal, coba lagi beberapa saat lagi.
          </p>
          {error.digest && <p className="num mt-2 text-xs text-muted">Kode: {error.digest}</p>}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="btn btn-primary"><RotateCcw aria-hidden />Coba lagi</button>
          <Link href="/campaigns" className="btn btn-secondary">Ke Cari Loker</Link>
        </div>
      </div>
    </section>
  );
}
