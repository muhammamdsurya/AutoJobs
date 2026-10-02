import { MessageCircleQuestion } from 'lucide-react';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { Notice } from '@autojobs/shared/ui';
import type { PendingQuestion } from '@/lib/apply-plan';
import { answerQuestion } from './actions';


// Questions that stopped applications ("Perlu tindakan"), answerable right here with the portal's own options.
export function PendingQuestions({ items, back }: { items: (PendingQuestion & { count?: number })[]; back: string }) {
  if (!items.length) return null;
  return (
    <section className="card space-y-5 border-amber-300/30">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-amber-400/12 text-amber-300 ring-1 ring-inset ring-amber-300/25">
          <MessageCircleQuestion className="size-5" aria-hidden />
        </span>
        <div>
          <h2>Pertanyaan yang perlu Anda jawab</h2>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted">
            Jawaban disimpan ke Bank jawaban dan dipakai otomatis bila pertanyaan ini muncul lagi. Lamaran yang tertahan pertanyaan ini
            langsung diantrekan ulang, kecuali yang pencariannya sudah dibatalkan: lamaran itu dipindah ke Dilewati. Jawab dengan jujur: jawaban dikirim atas nama Anda.
          </p>
        </div>
      </div>
      <ul className="space-y-3">
        {items.map((q) => (
          <li key={q.question + q.options.join('|')} className="rounded-card border border-white/8 bg-white/4 p-4 sm:p-5">
            <ActionForm action={answerQuestion} className="space-y-3">
              <input type="hidden" name="question" value={q.question} />
              <input type="hidden" name="back" value={back} />
              <p className="font-medium leading-snug">
                {q.question}
                {q.count ? <span className="ml-2 whitespace-nowrap text-xs font-normal text-amber-200"><span className="num">{q.count}</span> lamaran tertahan</span> : null}
              </p>
              {q.options.length ? (
                <div className="flex flex-wrap gap-2">
                  {[...new Set(q.options)].map((o) => (
                    <label key={o} className="chip-toggle">
                      <input type={q.multiple ? 'checkbox' : 'radio'} name="answer" value={o} required={!q.multiple} className="accent-accent" /> {o}
                    </label>
                  ))}
                </div>
              ) : (
                <input className="input max-w-md" name="answer" required aria-label={`Jawaban untuk: ${q.question}`} />
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <Submit>Simpan jawaban</Submit>
                <details className="text-sm">
                  <summary className="text-muted hover:text-ink">Pola pencocokan (opsional)</summary>
                  <input className="input mt-2" name="pattern" defaultValue={q.question} aria-label="Pola pertanyaan" />
                  <p className="hint">
                    Pertanyaan berikutnya dianggap sama bila memuat semua kata pola ini. Persingkat (mis. &quot;tahun pengalaman&quot;) agar
                    jawaban juga dipakai untuk pertanyaan serupa.
                  </p>
                </details>
              </div>
            </ActionForm>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Shown after answering (?answered=&skipped=): how many applications went back to the queue or were skipped.
export function AnsweredNotice({ answered, skipped }: { answered?: string | string[]; skipped?: string | string[] }) {
  if (typeof answered !== 'string') return null;
  const requeued = Number(answered) || 0;
  const moved = typeof skipped === 'string' ? Number(skipped) || 0 : 0;
  return (
    <Notice tone="green">
      Jawaban tersimpan di Bank jawaban.
      {requeued > 0 && ` ${requeued} lamaran diantrekan ulang.`}
      {moved > 0 && ` ${moved} lamaran dari pencarian yang dibatalkan dipindah ke Dilewati.`}
    </Notice>
  );
}
