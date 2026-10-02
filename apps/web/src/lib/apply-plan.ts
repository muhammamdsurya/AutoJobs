// Decides what to put in each form field of an apply step (SQ-06/SQ-07). Runs on the server: the extension reads
// the form fields in the user's browser, sends them here, and carries out the returned actions.
// Answers come only from the profile and the answer bank; an unknown required question stops as "Needs action".
import { findAnswer, optionForNumber, type BankEntry } from './answers';
import { normalize } from './filters';

// A question the user has to answer, with the portal's options (empty = free text), so they can answer it in AutoJobs.
export type PendingQuestion = { question: string; options: string[]; multiple: boolean };

export class NeedsAction extends Error {
  constructor(message: string, readonly questions: PendingQuestion[] = []) {
    super(message);
  }
}

export type Answer = { question: string; answer: string; source: string };

// A form control as read by the extension (extension/page.js → collectFields).
export type Field = {
  id: string;
  kind: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'combobox';
  inputType: string;
  label: string;
  required: boolean;
  filled: boolean;
  options: { id: string; label: string }[];
  value?: string; // current text of a text field
  invalid?: boolean; // the portal flagged it ("Input tidak valid")
};

// Questions whose text field takes a plain number (LinkedIn marks them only in words: "Please indicate the number of days").
const NUMERIC = /number of|how many|how much|berapa|jumlah|\b(in|dalam) (days|weeks|months|years|hari|minggu|bulan|tahun)\b|years? of (work )?experience|tahun pengalaman|salary|gaji|\bnumeric\b|\bangka\b/i;
const isNumber = (v: string) => /^\s*-?\d[\d.,]*\s*$/.test(v);

export type Action =
  | { do: 'fill'; id: string; value: string; combobox?: boolean }
  | { do: 'select'; id: string; value: string }
  | { do: 'check'; id: string };

export type Resolver = (question: string, options?: string[]) => { answer: string; source: string } | null;

// The Profile page's fields (name, phone, address etc. are left to the portals, which fill them from the user's own
// account there; a required one a portal leaves empty becomes "Perlu tindakan"). Email is the AutoJobs account's.
export type ProfileForApply = {
  email: string; linkedinUrl: string; portfolioUrl: string; expectedSalaryMin: number | null; noticePeriod: string;
  // Data profesional
  currentTitle?: string; yearsExperience?: number | null; educationLevel?: string; educationMajor?: string; skills?: string[];
  willingToRelocate?: boolean;
};

const has = (textNorm: string, phrase: string) => ` ${textNorm} `.includes(` ${normalize(phrase)} `);

// Education level as a code, from the profile ("S1") or a portal option ("Bachelor Degree (S1)", "Sarjana (S1)").
function eduCode(s: string): string | null {
  const t = normalize(s);
  const rules: [RegExp, string][] = [
    [/\bs3\b|doktor|doctoral|phd/, 'S3'], [/\bs2\b|magister|master/, 'S2'], [/\bs1\b|sarjana|bachelor/, 'S1'],
    [/\bd4\b|diploma 4|diploma iv/, 'D4'], [/\bd3\b|diploma 3|diploma iii/, 'D3'], [/\bd2\b|diploma 2/, 'D2'], [/\bd1\b|diploma 1/, 'D1'],
    [/\bsma\b|\bsmk\b|high school/, 'SMA'], [/\bsmp\b|junior high/, 'SMP'], [/\bsd\b|sekolah dasar|elementary/, 'SD'],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? null;
}

const NOTICE_DAYS: Record<string, number> = { segera: 0, '1 minggu': 7, '2 minggu': 14, '1 bulan': 30, '2 bulan': 60, '3 bulan': 90 };

// Screening questions answered from "Data profesional" when they clearly ask for it; anything else (e.g. years in a
// role other than the current title, years with one tool) is left to the user.
function fromProfessional(question: string, options: string[], p: ProfileForApply): { answer: string; source: string } | null {
  const q = normalize(question);
  const zeroOption = () => options.find((o) => /no experience|tidak ada pengalaman|belum (ada|punya) pengalaman/i.test(o));
  const years = (y: number, source: string) => ({ answer: y === 0 && zeroOption() ? zeroOption()! : String(Math.floor(y)), source });

  if (/\b(tahun|years?|lama)\b/.test(q) && /pengalaman|experience/.test(q)) {
    if (p.yearsExperience == null) return null;
    const role = question.match(/(?:sebagai|as an?|as|di bidang|dalam bidang|in the field of) (.+?)\??$/i)?.[1]?.trim(); // labels are one-spaced
    if (role) {
      const r = normalize(role), t = normalize(p.currentTitle ?? '');
      return t && (r.includes(t) || t.includes(r)) ? years(p.yearsExperience, 'profil: pengalaman (jabatan saat ini)') : null;
    }
    if (/\b(using|use|with|in|menggunakan|memakai|dengan)\b/.test(q.replace(/\bin total\b/, ''))) return null; // years with a specific tool
    return years(p.yearsExperience, 'profil: total pengalaman');
  }
  if (/kualifikasi|qualification|pendidikan (terakhir|tertinggi)|jenjang pendidikan|education level|highest (level of )?education/.test(q)) {
    const code = p.educationLevel ? eduCode(p.educationLevel) : null;
    if (!code) return null;
    if (!options.length) return { answer: p.educationLevel!, source: 'profil: pendidikan' };
    const hit = options.filter((o) => eduCode(o) === code);
    return hit.length === 1 ? { answer: hit[0], source: 'profil: pendidikan' } : null;
  }
  if (/jurusan|program studi|field of study|\bmajor\b/.test(q)) return p.educationMajor ? { answer: p.educationMajor, source: 'profil: jurusan' } : null;
  if (/universitas|institusi|nama (kampus|sekolah)|university|institution/.test(q)) return null; // not in the profile: the user decides
  if (/(jabatan|posisi) (saat ini|sekarang|terakhir)|current (job )?(title|position)|most recent (job )?title/.test(q))
    return p.currentTitle ? { answer: p.currentTitle, source: 'profil: jabatan saat ini' } : null;
  if (/(bersedia|willing).*(relokasi|pindah|relocate)/.test(q)) return p.willingToRelocate ? { answer: 'Ya', source: 'profil: bersedia pindah' } : null;
  if (/notice|pemberitahuan|kapan .*mulai bekerja|bisa mulai|start date/.test(q) && p.noticePeriod) {
    const days = NOTICE_DAYS[p.noticePeriod.toLowerCase()];
    const source = 'profil: masa pemberitahuan';
    if (days == null) return { answer: p.noticePeriod, source };
    // In the unit the question asks for: "number of days" → 30 for "1 bulan".
    if (!options.length) {
      if (/\b(days?|hari)\b/.test(q)) return { answer: String(days), source };
      if (/\b(weeks?|minggu)\b/.test(q)) return { answer: String(Math.round(days / 7)), source };
      if (/\b(months?|bulan)\b/.test(q)) return { answer: String(Math.round(days / 30)), source };
      return { answer: p.noticePeriod, source };
    }
    const ready = options.find((o) => /ready|segera|siap|none|tidak ada/i.test(o));
    return { answer: days === 0 && ready ? ready : String(days / 30), source };
  }

  const skills = (p.skills ?? []).map((s) => s.trim()).filter(Boolean);
  if (!skills.length) return null;
  // "Which of the following tools are you experienced with?" → the options that are in the skills list.
  if (options.length > 2 && /experienced|berpengalaman|familiar|menguasai|kuasai|which of the following|mana (saja )?yang/.test(q)) {
    const hit = options.filter((o) => skills.some((s) => normalize(s) === normalize(o)));
    return hit.length ? { answer: hit.join('; '), source: 'profil: keahlian' } : null;
  }
  // "Do you have experience using ETL Tools?" → Ya when a listed skill is named in the question.
  if (/pengalaman|experience|familiar|menguasai|mahir|bisa menggunakan/.test(q)) {
    const skill = skills.find((s) => has(q, s));
    return skill ? { answer: 'Ya', source: `profil: keahlian (${skill})` } : null;
  }
  return null;
}

// Answer bank first; then profile fields for short, form-style labels ("Nomor ponsel").
export function makeResolver(p: ProfileForApply, extras: Record<string, string>, bank: BankEntry[], portal: string): Resolver {
  const salary = extras.expected_salary || (p.expectedSalaryMin ? String(p.expectedSalaryMin) : '');
  const known: [RegExp, string, string][] = [
    [/e-?mail|surel/i, p.email, 'akun: email'],
    // Expected salary only: "Current / last salary" is a different number the profile doesn't hold.
    [/^(?!.*\b(current|saat ini|sekarang|terakhir|last|previous|sebelumnya)\b).*(gaji|salary)/i, salary, 'portal/profil: gaji'],
    [/linkedin/i, p.linkedinUrl, 'profil: LinkedIn'],
    [/portofolio|portfolio|website|situs/i, p.portfolioUrl, 'profil: portofolio'],
    [/masa pemberitahuan|notice period|kapan .*mulai bekerja|availability|ketersediaan/i, p.noticePeriod, 'profil: masa pemberitahuan'],
    [/surat lamaran|cover letter/i, extras.cover_letter ?? '', 'portal: surat lamaran'],
  ];
  return (question, options = []) => {
    const hit = findAnswer(question, bank, portal);
    if (hit.kind === 'ambiguous') throw new NeedsAction(`Beberapa pola di bank jawaban cocok untuk "${question}" dengan jawaban berbeda: ${hit.patterns.join(' / ')}`);
    if (hit.kind === 'found') return { answer: hit.answer, source: `bank jawaban: ${hit.pattern}` };
    const pro = fromProfessional(question, options, p);
    if (pro) return pro;
    if (question.length > 60) return null; // long screening questions need the answer bank
    for (const [re, value, source] of known) if (re.test(question)) return value ? { answer: value, source } : null;
    return null;
  };
}

const YES = new Set(['ya', 'yes', 'y', 'true', 'benar', 'setuju', 'bersedia', 'iya']);
const NO = new Set(['tidak', 'no', 'n', 'false', 'bukan', 'tidak bersedia']);

// The option an answer refers to, or null (then the user decides; we don't pick "closest").
export function matchOption(answer: string, options: string[]): string | null {
  const a = normalize(answer);
  const exact = options.filter((o) => normalize(o) === a);
  if (exact.length === 1) return exact[0];
  const num = Number(answer.replace(/[^\d.,]/g, '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
  if (/\d/.test(answer) && !Number.isNaN(num)) {
    const byRange = optionForNumber(num, options);
    if (byRange) return byRange;
  }
  for (const set of [YES, NO]) {
    if (set.has(a)) {
      const hits = options.filter((o) => set.has(normalize(o)));
      if (hits.length === 1) return hits[0];
    }
  }
  const prefix = options.filter((o) => { const n = normalize(o); return a.length >= 3 && (n.startsWith(a) || a.startsWith(n)); });
  return prefix.length === 1 ? prefix[0] : null;
}

const isRequired = (f: Field) => f.required || /\*|wajib|required/i.test(f.label);

export function planFields(fields: Field[], resolve: Resolver): { actions: Action[]; answers: Answer[] } {
  const actions: Action[] = [];
  const answers: Answer[] = [];
  for (const f of fields) {
    // Labels come from the page via the extension: one line, at most 300 characters (keeps every regex below fast).
    const question = String(f.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || '(pertanyaan tanpa label)';
    const numeric = f.kind === 'text' && (f.inputType === 'number' || NUMERIC.test(question));
    // Pre-filled by the portal (its profile, or an earlier answer it remembers) stays as is, unless the portal flags
    // it or a number field holds text ("1 bulan" where days are asked).
    if (f.filled && !f.invalid && !(numeric && f.value != null && !isNumber(f.value))) continue;
    const labels = f.options.map((o) => o.label);
    const pending = [{ question, options: labels, multiple: f.kind === 'checkbox' && labels.length > 1 }];
    const ask = (message: string) => new NeedsAction(message, pending);
    let hit;
    try {
      hit = resolve(question, labels);
    } catch (e) {
      throw e instanceof NeedsAction ? ask(e.message) : e;
    }
    if (!hit) {
      if (!isRequired(f)) { answers.push({ question, answer: '', source: 'dikosongkan (tidak wajib)' }); continue; }
      throw ask(`Pertanyaan belum ada di bank jawaban: "${question}"${labels.length ? `. Pilihan: ${labels.join(' | ')}` : ''}`);
    }
    const pick = (answer: string) => {
      const label = matchOption(answer, labels);
      if (!label) throw ask(`Jawaban "${answer}" untuk "${question}" tidak cocok dengan pilihan: ${labels.join(' | ')}`);
      return f.options.find((o) => o.label === label)!;
    };
    if (f.kind === 'select') {
      actions.push({ do: 'select', id: f.id, value: pick(hit.answer).id });
    } else if (f.kind === 'radio') {
      actions.push({ do: 'check', id: pick(hit.answer).id });
    } else if (f.kind === 'checkbox') {
      if (f.options.length === 1) {
        // The checkbox's own text ("I consent") picked in the report counts as ticking it.
        const a = normalize(hit.answer) === normalize(f.options[0].label) ? 'ya' : normalize(hit.answer);
        if (!YES.has(a) && !NO.has(a)) throw new NeedsAction(`Jawaban untuk "${question}" harus Ya/Tidak (sekarang: "${hit.answer}")`, [{ question, options: ['Ya', 'Tidak'], multiple: false }]);
        if (YES.has(a)) actions.push({ do: 'check', id: f.options[0].id });
      } else {
        // Several choices are separated by ";" (options themselves may contain commas); "," works when there's no ";".
        const parts = hit.answer.split(hit.answer.includes(';') ? ';' : ',').map((s) => s.trim()).filter(Boolean);
        for (const part of parts) actions.push({ do: 'check', id: pick(part).id });
      }
    } else {
      let value = hit.answer;
      if (numeric) {
        // "7.000.000" → 7000000. Words around a number ("1 bulan") are only dropped from the user's own bank answers;
        // from the profile they'd be a guess at the unit, so the user is asked instead.
        if (!isNumber(value) && !hit.source.startsWith('bank')) throw ask(`Jawaban untuk "${question}" harus berupa angka (sekarang dari profil: "${hit.answer}")`);
        value = value.replace(/[^\d.,-]/g, '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
        if (!value || Number.isNaN(Number(value))) throw ask(`Jawaban untuk "${question}" harus berupa angka (sekarang: "${hit.answer}")`);
      }
      actions.push({ do: 'fill', id: f.id, value, combobox: f.kind === 'combobox' || undefined });
    }
    answers.push({ question, answer: hit.answer, source: hit.source });
  }
  return { actions, answers };
}
