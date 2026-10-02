'use client';

import { CircleCheck, Download, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { Field, fmtTime, Notice } from '@autojobs/shared/ui';
import { rp } from '@autojobs/shared/tokens';
import { attachProof, buyPack, resumeTopup, topupStatus, type Checkout } from './actions';

// "Beli" (a pack) or "Lanjutkan" (an open purchase) opens a native modal <dialog>: the exact amount, a QR that
// carries it, and the confirmation as soon as the payment is seen. Fallbacks: the static QRIS, and a transfer proof.
export function PayButton({ packId, topupId, label, className = 'btn btn-primary', staticQrSrc }: {
  packId?: number; topupId?: string; label: string; className?: string; staticQrSrc: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [co, setCo] = useState<Checkout | { error: string } | null>(null);
  const [status, setStatus] = useState('pending');
  const [now, setNow] = useState(() => Date.now());

  async function open() {
    setBusy(true);
    const r = await (packId != null ? buyPack(packId) : resumeTopup(topupId!)).catch(() => ({ error: 'Gagal terhubung. Coba lagi.' }));
    setBusy(false);
    setCo(r);
    setStatus('pending');
    ref.current?.showModal();
  }

  // While the pop-up is open: is the payment in yet? (The worker checks DANA every 15 seconds.)
  const id = co && 'id' in co ? co.id : null;
  useEffect(() => {
    if (!id || status !== 'pending') return;
    const t = setInterval(async () => {
      setNow(Date.now());
      if (!ref.current?.open) return;
      const s = await topupStatus(id).catch(() => null);
      if (s && s !== 'pending') {
        setStatus(s);
        router.refresh();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [id, status, router]);

  const late = co && 'id' in co && now >= new Date(co.expiresAt).getTime();
  return (
    <>
      <button type="button" className={className} onClick={open} disabled={busy}>{busy ? 'Memproses…' : label}</button>
      <dialog
        ref={ref}
        aria-labelledby={`bayar-${packId ?? topupId}`}
        // The dialog box itself is only hit outside the content wrapper, i.e. on the backdrop: tap outside to close.
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
        className="m-auto max-h-none w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-panel border border-white/12 bg-raised p-0 text-ink shadow-[0_32px_64px_-24px_rgb(0_0_0/0.9)] backdrop:bg-black/70"
      >
        <div className="max-h-[calc(100dvh-2rem)] space-y-5 overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={`bayar-${packId ?? topupId}`}>{co && 'id' in co ? <>Isi <span className="num">{co.tokens}</span> token</> : 'Isi token'}</h2>
            <form method="dialog">
              <button className="-m-2 grid size-10 cursor-pointer place-items-center rounded-control text-muted transition-colors hover:bg-white/8 hover:text-ink" aria-label="Tutup">
                <X className="size-5" aria-hidden />
              </button>
            </form>
          </div>

          {co && 'error' in co && <Notice tone="red">{co.error}</Notice>}

          {co && 'id' in co && (status === 'paid' ? (
            <div className="space-y-4 text-center" role="status">
              <CircleCheck className="mx-auto size-12 text-accent" aria-hidden />
              <p className="text-lg font-semibold">Pembayaran diterima</p>
              <p className="text-sm text-muted"><span className="num">{co.tokens}</span> token sudah ditambahkan ke akun Anda.</p>
              <form method="dialog"><button className="btn btn-primary w-full">Selesai</button></form>
            </div>
          ) : status !== 'pending' ? (
            <Notice>Pembayaran ini sudah ditutup. Muat ulang halaman untuk melihat statusnya.</Notice>
          ) : (
            <>
              <div className="rounded-card border border-white/10 bg-white/4 p-4 text-center">
                <p className="text-sm text-muted">Bayar tepat</p>
                <p className="num mt-1 text-3xl font-semibold text-accent">{rp(co.amount)}</p>
                {co.amount < co.price && (
                  <p className="mt-1 text-xs text-muted">Harga {rp(co.price)} dikurangi kode unik {rp(co.price - co.amount)}, agar pembayaran Anda dikenali otomatis.</p>
                )}
              </div>
              {/* The QR already contains the amount: the banking app fills it in. Its own white border is in the SVG. */}
              <div className="mx-auto w-full max-w-80 overflow-hidden rounded-card bg-white [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                role="img" aria-label={`Kode QRIS pembayaran ${rp(co.amount)}`} dangerouslySetInnerHTML={{ __html: co.qr }} />
              <p className="-mt-2 text-center text-xs text-muted">
                Membayar dari HP ini? <a href={co.png} download={`QRIS-AutoJobs-${co.amount}.png`} className="inline-flex items-center gap-1"><Download className="size-3.5" aria-hidden />Unduh QR</a>,
                lalu pilih gambarnya dari galeri di aplikasi pembayaran.
              </p>
              {late ? (
                <Notice>Waktu bayar QR ini sudah habis. Sudah terlanjur membayar? Token tetap ditambahkan otomatis begitu pembayarannya masuk (hingga 24 jam).</Notice>
              ) : (
                <p className="flex items-center justify-center gap-2 text-center text-sm text-muted" role="status">
                  <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
                  Menunggu pembayaran, bayar sebelum pukul <b className="num text-ink">{fmtTime(co.expiresAt)}</b>
                </p>
              )}
              <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted marker:text-faint">
                <li>Scan QR dengan aplikasi bank atau e-wallet apa pun (nominal terisi otomatis).</li>
                <li>Bayar. Token masuk otomatis dan jendela ini mengonfirmasinya.</li>
              </ol>

              {staticQrSrc && (
                <details className="border-t border-white/8 pt-4">
                  <summary className="text-sm font-medium text-accent hover:underline">QR tidak bisa dipindai? Pakai QRIS statis</summary>
                  <div className="mt-3 space-y-2">
                    {/* Plain <img>: the file is served behind the session cookie, which next/image's optimiser doesn't send. */}
                    <img src={staticQrSrc} alt="QRIS statis AutoJobs" className="mx-auto w-full max-w-56 rounded-card bg-white p-2" />
                    <p className="text-sm text-muted">Ketik nominal tepat <b className="num text-ink">{rp(co.amount)}</b>. Nominal lain tidak bisa dikenali otomatis.</p>
                  </div>
                </details>
              )}
              <details className="border-t border-white/8 pt-4">
                <summary className="text-sm font-medium text-accent hover:underline">Sudah bayar, tapi belum terkonfirmasi?</summary>
                <ActionForm action={attachProof.bind(null, co.id)} resetOnOk className="mt-3 space-y-3">
                  <Field label="Bukti pembayaran" hint="Gambar (JPG, PNG, WebP) atau PDF, maksimal 5 MB. Admin memeriksanya, lalu menambahkan token.">
                    <input type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf" required
                      className="w-full min-w-0 text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-control file:border file:border-white/12 file:bg-white/6 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-white/10" />
                  </Field>
                  <Submit className="btn btn-secondary w-full">Kirim bukti</Submit>
                </ActionForm>
              </details>
            </>
          ))}
        </div>
      </dialog>
    </>
  );
}
