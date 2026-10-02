'use client';

import { Laptop } from 'lucide-react';
import { useEffect, useRef } from 'react';

const KEY = 'autojobs.phone-notice';

// Phones and tablets (touch screens) can't run the extension: mobile Chrome has no extensions. Said once per device;
// waits for the first-login tutorial when that is open, so two pop-ups never stack.
export function PhoneNotice() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try {
      if (!matchMedia('(pointer: coarse)').matches || localStorage.getItem(KEY)) return;
    } catch {
      return;
    }
    const open = () => ref.current?.showModal();
    const other = document.querySelector('dialog[open]');
    if (!other) {
      open();
      return;
    }
    other.addEventListener('close', open, { once: true });
    return () => other.removeEventListener('close', open);
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="hp-judul"
      onClose={() => { try { localStorage.setItem(KEY, '1'); } catch {} }}
      className="m-auto max-h-none w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-panel border border-white/12 bg-raised p-0 text-ink shadow-[0_32px_64px_-24px_rgb(0_0_0/0.9)] backdrop:bg-black/70"
    >
      <div className="max-h-[calc(100dvh-2rem)] space-y-4 overflow-y-auto p-5 sm:p-6">
        <span className="grid size-12 place-items-center rounded-card bg-amber-400/12 text-amber-300 ring-1 ring-inset ring-amber-300/25"><Laptop className="size-6" aria-hidden /></span>
        <h2 id="hp-judul">Lamaran dikirim dari komputer</h2>
        <p className="text-sm leading-relaxed text-muted">
          Chrome di HP belum mendukung ekstensi, jadi ekstensi AutoJobs dipasang di Chrome atau Edge di komputer. Pencarian Glints dan
          pengiriman lamaran berjalan dari sana, selama Chrome di komputer itu terbuka.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          Dari HP Anda tetap bisa membuat pencarian, memilih dan meluncurkan lowongan, memantau Laporan, dan menjawab pertanyaan.
        </p>
        <form method="dialog"><button className="btn btn-primary w-full" autoFocus>Mengerti</button></form>
      </div>
    </dialog>
  );
}
