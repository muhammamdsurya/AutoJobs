// Answer bank lookup (PR-05). A pattern matches when every meaningful word of it appears in the question;
// the most specific (most words) pattern wins, and a tie with different answers is "ambiguous" -> Needs action.
// Never guess: no match means the question goes back to the user.
import { normalize } from './filters';

const STOP = new Set(
  (
    'a an the of to in on for with and or do does did you your have has had how many much what which is are was were be ' +
    'been any this that please can could would will at as by from if it me my we our us i ' +
    'apa apakah berapa bagaimana yang di ke dari dan atau dengan untuk pada dalam ini itu anda kamu saudara adalah ' +
    'sebagai telah sudah punya memiliki ada akan bisa dapat mohon silakan harap tolong sebutkan jelaskan'
  ).split(' '),
);

// ponytail: naive strip of Indonesian possessive suffixes (-nya/-mu/-ku); use a real stemmer if matches get noisy
function stem(w: string) {
  if (w.length >= 6) for (const suf of ['nya', 'mu', 'ku']) if (w.endsWith(suf)) return w.slice(0, -suf.length);
  return w;
}

export const tokens = (s: string) => normalize(s).split(' ').filter(Boolean).map(stem).filter((w) => !STOP.has(w));

export type BankEntry = { questionPattern: string; answer: string; portal: string | null };
export type Lookup =
  | { kind: 'found'; answer: string; pattern: string }
  | { kind: 'ambiguous'; patterns: string[] }
  | { kind: 'none' };

export function findAnswer(question: string, bank: BankEntry[], portal: string): Lookup {
  const q = new Set(tokens(question));
  let best: BankEntry[] = [];
  let bestScore = 0;
  for (const e of bank) {
    if (e.portal && e.portal !== portal) continue;
    const p = tokens(e.questionPattern);
    if (!p.length || !p.every((t) => q.has(t))) continue;
    const score = p.length + (e.portal ? 0.5 : 0); // portal-specific beats global on equal words
    if (score > bestScore) [best, bestScore] = [[e], score];
    else if (score === bestScore) best.push(e);
  }
  if (!best.length) return { kind: 'none' };
  if (new Set(best.map((e) => e.answer.trim())).size > 1) return { kind: 'ambiguous', patterns: best.map((e) => e.questionPattern) };
  return { kind: 'found', answer: best[0].answer.trim(), pattern: best[0].questionPattern };
}

// Picks the option a numeric answer falls into, e.g. 7000000 -> "Rp 6 jt – Rp 8 jt", 4 -> "3-5 tahun".
export function optionForNumber(value: number, options: string[]): string | null {
  const hits = options.filter((o) => {
    const r = numericRange(o);
    return r != null && value >= r[0] && value <= r[1];
  });
  if (hits.length === 1) return hits[0];
  // "5" → "5 tahun" rather than "Lebih dari 5 tahun"
  const exact = hits.filter((o) => { const r = numericRange(o)!; return r[0] === value && r[1] === value; });
  return exact.length === 1 ? exact[0] : null;
}

function numericRange(option: string): [number, number] | null {
  const t = option.toLowerCase();
  const nums = [...t.matchAll(/(\d+(?:[.,]\d+)*)(?:\s*(jt|juta|million|rb|ribu|k)\b)?/g)].map((m) => {
    const base = Number(m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
    const mult = m[2] ? ({ jt: 1e6, juta: 1e6, million: 1e6, rb: 1e3, ribu: 1e3, k: 1e3 } as Record<string, number>)[m[2]] : 1;
    return base * mult;
  });
  if (!nums.length) return null;
  if (/lebih dari|more than|over|di atas|\+/.test(t)) return [nums[0], Infinity];
  if (/kurang dari|less than|under|di bawah/.test(t)) return [0, nums[0]];
  return nums.length >= 2 ? [nums[0], nums[1]] : [nums[0], nums[0]];
}
