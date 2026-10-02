'use client';

// SF-08 preview (untick to exclude) + "Review & Launch": counts per portal and SQ-04 estimate, recomputed as you tick.
import { ArrowUpRight, Check, CircleHelp, FlaskConical, Gauge, MapPin, TriangleAlert, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ActionForm, Submit, type FormState } from '@autojobs/shared/forms';
import { estimateFinish, formatDuration, type EstimateSettings } from '@/lib/estimate';
import { levelLabel } from '@/lib/filters';
import { AUTO_APPLY, PORTAL_LABEL, PORTALS, type Portal } from '@autojobs/shared/portals';

export type PreviewItem = {
  listingId: string; portal: Portal; title: string; company: string; location: string; salaryText: string; url: string;
  applyMethod: string; applyUrl: string | null; matchReason: string; experienceLevels: string[]; flags: string[]; selected: boolean;
  questions: { q: string; a: string | null }[];
};
export type PortalReady = { connected: boolean; missing: string[] };

const chip = 'inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-xs font-medium ring-1 ring-inset [&>svg]:size-3.5';

export function PreviewLaunch({ items, ready, settings, sentToday, action }: {
  items: PreviewItem[];
  ready: Record<Portal, PortalReady>;
  settings: EstimateSettings & { dryRunFast: boolean; dryRunDelaySec: number };
  sentToday: Partial<Record<Portal, number>>;
  action: (s: FormState, fd: FormData) => Promise<FormState>;
}) {
  const [sel, setSel] = useState(() => new Set(items.filter((i) => i.selected).map((i) => i.listingId)));
  const [dryRun, setDryRun] = useState(false);
  const manual = (i: PreviewItem) => !AUTO_APPLY[i.portal] || i.applyMethod === 'external';

  // Debug mode: dry runs use the short gap.
  const gap = { ...settings, delaySec: dryRun && settings.dryRunFast ? settings.dryRunDelaySec : settings.delaySec };
  const plan = useMemo(() => {
    const queued: Partial<Record<Portal, number>> = {};
    const manualCount: Partial<Record<Portal, number>> = {};
    for (const i of items) {
      if (!sel.has(i.listingId)) continue;
      const bucket = manual(i) ? manualCount : queued;
      bucket[i.portal] = (bucket[i.portal] ?? 0) + 1;
    }
    return { queued, manualCount, estimate: estimateFinish(queued, sentToday, gap, dryRun) };
  }, [items, sel, sentToday, gap, dryRun]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const total = (o: Partial<Record<Portal, number>>) => Object.values(o).reduce((a, b) => a + (b ?? 0), 0);
  const queuedTotal = total(plan.queued);

  return (
    <ActionForm action={action} className="space-y-4">
      {/* Sticky under the app header while scrolling the list. */}
      <div className="glass-bar sticky top-[4.75rem] z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card px-4 py-3">
        <h2 className="text-base">Lowongan yang cocok <span className="num font-normal text-muted">{items.length}</span></h2>
        <span className={`${chip} num bg-accent/12 text-teal-200 ring-accent/30`}>{sel.size} dipilih</span>
        <div className="flex w-full flex-wrap gap-1 sm:ml-auto sm:w-auto">
          <button type="button" className="btn btn-quiet" onClick={() => setSel(new Set(items.map((i) => i.listingId)))}>Pilih semua</button>
          <button type="button" className="btn btn-quiet" onClick={() => setSel(new Set())}>Kosongkan</button>
          <a href="#luncurkan" className="btn btn-primary ml-auto sm:ml-0">Tinjau</a>
        </div>
      </div>

      <ul className="glass-dense divide-y divide-white/6 overflow-hidden rounded-card">
        {items.map((i, idx) => {
          const on = sel.has(i.listingId);
          const unanswered = i.questions.filter((q) => !q.a).length;
          const reasons = i.matchReason.split(' · ').filter(Boolean);
          const levels = i.experienceLevels.map(levelLabel).join(', ');
          return (
            <li key={i.listingId} className={`rise flex gap-4 px-4 py-4 transition-opacity sm:px-5 ${on ? '' : 'opacity-50'}`} style={{ '--i': idx } as React.CSSProperties}>
              <input type="checkbox" name="sel" value={i.listingId} checked={on} onChange={() => toggle(i.listingId)}
                aria-label={`Pilih ${i.title}`} className="mt-1 size-5 shrink-0 cursor-pointer accent-accent" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
                  <a href={i.url} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1 font-display text-base font-semibold leading-snug text-ink hover:text-accent hover:no-underline">
                    {i.title}<ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted group-hover:text-accent" aria-hidden />
                  </a>
                  <span className={`${chip} bg-white/6 text-ink/85 ring-white/12`}>{PORTAL_LABEL[i.portal]}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted">{i.company}</p>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted [&_svg]:size-3.5 [&_svg]:shrink-0">
                  {i.location && <li className="flex items-center gap-1.5"><MapPin aria-hidden />{i.location}</li>}
                  {i.salaryText && <li className="flex items-center gap-1.5"><Wallet aria-hidden />{i.salaryText}</li>}
                  {levels && <li className="flex items-center gap-1.5"><Gauge aria-hidden />{levels}</li>}
                </ul>
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Alasan cocok">
                  {reasons.map((r) => {
                    const unknown = r.startsWith('level pengalaman tidak diketahui');
                    return (
                      <li key={r} className={`${chip} ${unknown ? 'bg-amber-400/12 text-amber-200 ring-amber-300/25' : 'bg-accent/10 text-teal-200 ring-accent/25'}`}>
                        {unknown ? <TriangleAlert aria-hidden /> : <Check aria-hidden />}{r}
                      </li>
                    );
                  })}
                </ul>
                {(i.applyMethod === 'external' || !AUTO_APPLY[i.portal] || i.questions.length > 0) && (
                  <div className="mt-3 space-y-1.5 text-xs">
                    {i.applyMethod === 'external' && (
                      <a href={i.applyUrl ?? i.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                        Eksternal: lamar manual di situs perusahaan<ArrowUpRight className="size-3.5" aria-hidden />
                      </a>
                    )}
                    {!AUTO_APPLY[i.portal] && i.applyMethod !== 'external' && <p className="text-muted">Lamar manual</p>}
                    {i.questions.length > 0 && (
                      <details className="group/q">
                        <summary className={`inline-flex items-center gap-1.5 ${unanswered ? 'text-amber-200' : 'text-muted'} hover:text-ink`}>
                          <CircleHelp className="size-3.5" aria-hidden />
                          {i.questions.length} pertanyaan{unanswered ? `, ${unanswered} belum ada jawaban` : ', semua terjawab'}
                        </summary>
                        <ul className="mt-2 space-y-1.5 rounded-control bg-white/4 p-3">
                          {i.questions.map((q) => (
                            <li key={q.q} className="text-ink/90">
                              {q.q}
                              <span className="block text-muted">{q.a ? <>Jawaban: <b className="font-medium text-ink">{q.a}</b></> : <span className="text-amber-200">Belum ada di bank jawaban</span>}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <section id="luncurkan" className="panel scroll-mt-24 space-y-5">
        <h2 className="text-xl">Tinjau dan luncurkan</h2>
        <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
          {PORTALS.filter((p) => plan.queued[p] || plan.manualCount[p]).map((p) => (
            <li key={p} className="rounded-card border border-white/8 bg-white/4 p-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{PORTAL_LABEL[p]}</span>
                <span className="num text-ink">{plan.queued[p] ?? 0} <span className="font-sans text-muted">diantrekan</span></span>
              </div>
              <div className="mt-2 space-y-1 text-xs text-muted">
                {!!plan.manualCount[p] && <p>{plan.manualCount[p]} dicatat untuk dilamar manual</p>}
                {!!plan.queued[p] && !ready[p].connected && (
                  <p className="text-amber-200">
                    Menunggu login: ekstensi belum melaporkan Anda sudah masuk ke {PORTAL_LABEL[p]}. Antrean mulai berjalan sendiri setelah
                    itu (lihat <a href="/connections">Koneksi Portal</a>).
                  </p>
                )}
                {!!plan.queued[p] && ready[p].missing.length > 0 && <p className="text-rose-200">Profil belum lengkap: {ready[p].missing.join(', ')}</p>}
                {!!plan.estimate.overflow[p] && <p className="text-amber-200">{plan.estimate.overflow[p]} melebihi batas harian dan dikirim besok</p>}
                {!dryRun && <p>Terkirim hari ini: <span className="num text-ink">{sentToday[p] ?? 0}/{settings.dailyCap}</span></p>}
              </div>
            </li>
          ))}
        </ul>
        {queuedTotal > 0 && (
          <p className="text-sm text-muted">
            Perkiraan selesai hari ini <b className="num font-medium text-ink">± {formatDuration(plan.estimate.seconds)}</b>. Tiap putaran satu lamaran
            per portal berturut-turut, lalu jeda {gap.delaySec} detik{dryRun && settings.dryRunFast ? ' (mode debug)' : ''}.
          </p>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-card border border-white/14 bg-white/4 p-4 text-sm transition-colors hover:border-white/25">
            <input type="checkbox" name="dryRun" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-accent" />
            <span>
              <span className="flex items-center gap-1.5 font-medium"><FlaskConical className="size-4 text-muted" aria-hidden />Uji coba (dry run)</span>
              <span className="mt-1 block text-muted">Isi formulir dan ambil tangkapan layar, tetapi <b className="font-medium text-ink">jangan klik kirim</b>. Disarankan untuk pencarian pertama di tiap portal.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-card border border-white/14 bg-white/4 p-4 text-sm transition-colors hover:border-white/25">
            <input type="checkbox" name="ack" className="mt-0.5 size-5 shrink-0 accent-accent" />
            <span className="text-muted">Saya sudah meninjau daftar ini dan meminta AutoJobs melamar atas nama saya ke lowongan yang dipilih, memakai jawaban dari profil dan bank jawaban saya.</span>
          </label>
        </div>
        <Submit className="btn btn-primary h-12 w-full px-6 text-base sm:w-auto">
          {dryRun
            ? `Jalankan uji coba (${queuedTotal} lowongan)`
            : `Luncurkan: ${queuedTotal} diantrekan${total(plan.manualCount) ? `, ${total(plan.manualCount)} dicatat manual` : ''}`}
        </Submit>
      </section>
    </ActionForm>
  );
}
