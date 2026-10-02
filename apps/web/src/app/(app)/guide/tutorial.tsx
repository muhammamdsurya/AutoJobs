'use client';

import { BookOpen, ChartColumn, Puzzle, Search, Sparkles, UserRound, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { markTutorialSeen } from './actions';

// Short tour: opens by itself on the first sign-in of a new account (`auto`), or from a button on the Panduan page.
export function Tutorial({ auto = false, trigger, freeTokens }: { auto?: boolean; trigger?: string; freeTokens: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(); // the layout's and the Panduan page's copies can both be in the page
  const [i, setI] = useState(0);
  useEffect(() => {
    if (auto && !ref.current?.open) ref.current?.showModal();
  }, [auto]);

  const steps: [LucideIcon, string, string][] = [
    [Sparkles, 'Selamat datang di AutoJobs',
      `AutoJobs mencari lowongan di JobStreet, Glints, dan LinkedIn sekaligus, lalu mengirim lamaran dari Chrome Anda. Akun baru mendapat ${freeTokens} token gratis; 1 token = 1x Cari Loker.`],
    [Puzzle, 'Hubungkan Chrome',
      'Pasang ekstensi AutoJobs di Chrome komputer, pasangkan dengan kode dari menu Koneksi, lalu masuk ke ketiga portal di Chrome itu seperti biasa.'],
    [UserRound, 'Lengkapi Profil',
      'Data profesional, CV, dan bank jawaban dipakai untuk mengisi formulir dan menjawab pertanyaan perusahaan. Cukup diisi sekali.'],
    [Search, 'Cari dan pilih lowongan',
      'Buat pencarian di Cari Loker: kata kunci judul, level, dan lokasi. Tinjau hasilnya beserta alasan cocoknya; ubah kriteria atau cari ulang gratis selama belum diluncurkan.'],
    [ChartColumn, 'Luncurkan dan pantau',
      'Mulai dengan uji coba. Lamaran dikirim satu per satu dengan jeda selama Chrome terbuka. Pantau di Laporan dan jawab yang "Perlu tindakan".'],
  ];
  const [Icon, title, text] = steps[i];
  const last = i === steps.length - 1;
  const close = () => ref.current?.close();

  return (
    <>
      {trigger && (
        <button type="button" className="btn btn-secondary" onClick={() => { setI(0); ref.current?.showModal(); }}>
          <Sparkles aria-hidden />{trigger}
        </button>
      )}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => { if (auto) void markTutorialSeen(); }}
        className="m-auto max-h-none w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-panel border border-white/12 bg-raised p-0 text-ink shadow-[0_32px_64px_-24px_rgb(0_0_0/0.9)] backdrop:bg-black/70"
      >
        <div className="max-h-[calc(100dvh-2rem)] space-y-5 overflow-y-auto p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <p className="num text-xs text-muted">Langkah {i + 1} dari {steps.length}</p>
            <button type="button" onClick={close} aria-label="Tutup"
              className="-m-2 grid size-10 cursor-pointer place-items-center rounded-control text-muted transition-colors hover:bg-white/8 hover:text-ink">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div key={i} className="rise min-h-48 space-y-3">
            <span className="grid size-12 place-items-center rounded-card bg-accent/12 text-accent ring-1 ring-inset ring-accent/25"><Icon className="size-6" aria-hidden /></span>
            <h2 id={titleId}>{title}</h2>
            <p className="text-sm leading-relaxed text-muted">{text}</p>
          </div>
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((_, n) => <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-6 bg-accent' : 'w-1.5 bg-white/20'}`} />)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-4">
            {last
              ? <Link href="/guide" onClick={close} className="btn btn-quiet"><BookOpen aria-hidden />Baca panduan lengkap</Link>
              : <button type="button" onClick={close} className="btn btn-quiet">Lewati</button>}
            <div className="ml-auto flex gap-2">
              {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="btn btn-secondary">Kembali</button>}
              {/* One button for "Lanjut" and "Mulai", so keyboard focus stays on it from step to step. */}
              <button type="button" onClick={() => (last ? close() : setI(i + 1))} className="btn btn-primary" autoFocus>{last ? 'Mulai' : 'Lanjut'}</button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
