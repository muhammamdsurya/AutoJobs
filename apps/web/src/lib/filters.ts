// Listing filters (SF-02..SF-06) and experience-level mapping (SF-04). Pure functions: no DB, no network.

export type Level = 'internship' | 'entry' | 'junior' | 'mid' | 'senior' | 'lead';

export const LEVELS: { key: Level; label: string; min: number; max: number }[] = [
  { key: 'internship', label: 'Magang', min: 0, max: 0 },
  { key: 'entry', label: 'Entry (0-1 thn)', min: 0, max: 1 },
  { key: 'junior', label: 'Junior (1-3 thn)', min: 1, max: 3 },
  { key: 'mid', label: 'Mid (3-5 thn)', min: 3, max: 5 },
  { key: 'senior', label: 'Senior (5-8 thn)', min: 5, max: 8 },
  { key: 'lead', label: 'Lead/Manager (8+ thn)', min: 8, max: 99 },
];
export const levelLabel = (k: string) => LEVELS.find((l) => l.key === k)?.label ?? k;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
}

// Keywords match at the start of a word: "intern" also matches "internship",
// "data analyst" matches "senior data analyst". textNorm must already be normalize()d.
export function hasKeyword(textNorm: string, keyword: string): boolean {
  const k = normalize(keyword);
  return k !== '' && ` ${textNorm}`.includes(` ${k}`);
}

const Y = '(?:tahun|thn|th|years?|yrs?)';
// `\s*(?:\+\s*)?`, not `\s*\+?\s*`: two adjacent \s* backtrack quadratically on long whitespace runs.
const RANGE = new RegExp(`\\b(\\d{1,2})\\s*(?:-|–|—|to|sampai|hingga|s\\.?/d\\.?)\\s*(\\d{1,2})\\s*(?:\\+\\s*)?${Y}\\b`);
const SINGLE = new RegExp(`\\b(\\d{1,2})\\s*(?:\\+\\s*)?${Y}\\b`, 'g');
const FRESH = /fresh ?grad|lulusan baru|tanpa pengalaman|no experience/;
// Right before a number: it's the most allowed ("maksimal 3 tahun", "up to 8 years"), not the least.
const UPTO = /(?:maks(?:imal|imum)?|max(?:imum|imal)?|up to|at most|(?:no|not|tidak) (?:more than|lebih dari)|kurang dari|less than|under|di ?bawah)\W*$/;

type Years = [number, number | null];

// Years of experience asked for in free text, else the portal's own range (`stated`). null = not stated.
// Only sentences that talk about experience count, so "kontrak 1 tahun" or "berdiri 10 tahun" are ignored.
export function parseYears(text: string, stated: Years | null = null): Years | null {
  const t = text.toLowerCase().replace(/[^\S\n]+/g, ' '); // runs of spaces → one (lines are kept for the split below)
  const fresh = FRESH.test(t); // "fresh graduate welcome" widens the range down to 0
  for (const sentence of t.split(/\n|\.\s|;/)) {
    if (!/pengalaman|experience/.test(sentence)) continue;
    const r = sentence.match(RANGE);
    if (r && Number(r[1]) <= 40 && Number(r[2]) <= 40) {
      const [a, b] = [Number(r[1]), Number(r[2])].sort((x, y) => x - y);
      return [fresh ? 0 : a, b];
    }
    let min: number | null = null;
    let max: number | null = null;
    for (const m of sentence.matchAll(SINGLE)) {
      const n = Number(m[1]);
      if (n > 40) continue;
      if (UPTO.test(sentence.slice(Math.max(0, m.index - 25), m.index))) max ??= n;
      else min ??= n;
    }
    if (min != null || max != null) {
      const lo = fresh ? 0 : min ?? 0;
      return [lo, max != null && max >= lo ? max : fresh ? min : null];
    }
  }
  return fresh ? [0, stated ? stated[1] : 1] : stated;
}

const LINKEDIN_LEVELS: Record<string, Level[]> = {
  internship: ['internship'],
  'entry level': ['entry'],
  associate: ['junior'],
  'mid-senior level': ['mid', 'senior'],
  director: ['lead'],
  executive: ['lead'],
};

export type MatchInput = {
  portal: string;
  externalId: string;
  title: string;
  company: string;
  description: string;
  experienceMin: number | null;
  experienceMax: number | null;
  seniorityLabel: string;
  jobType: string;
  applyMethod: string;
  closed: boolean;
};

const overlaps = (min: number, max: number, v: { min: number; max: number }) =>
  min === max ? v.min <= min && min < v.max : min < v.max && max > v.min;

// null = the listing doesn't say (shown as "level unknown" in the preview, never silently dropped).
export function listingLevels(l: MatchInput): Level[] | null {
  const title = normalize(l.title);
  if (/intern/i.test(l.jobType) || ['intern', 'magang'].some((k) => hasKeyword(title, k)) || l.seniorityLabel.toLowerCase() === 'internship')
    return ['internship'];
  // The years the employer wrote come first: the portal's own bucket (Glints "3-5 tahun") or label (LinkedIn
  // "Mid-Senior level", given to most jobs) is coarser.
  const range = parseYears(l.description, l.experienceMin != null ? [l.experienceMin, l.experienceMax] : null);
  if (range) {
    const [min, max] = range;
    // ponytail: "min N years" is read as N..N+2; tune if matches feel too broad
    const upper = max ?? min + 2;
    return LEVELS.filter((v) => v.key !== 'internship' && overlaps(min, Math.max(min, upper), v)).map((v) => v.key);
  }
  const fromLabel = LINKEDIN_LEVELS[l.seniorityLabel.toLowerCase()];
  if (fromLabel) return fromLabel;
  if (['senior', 'sr'].some((k) => hasKeyword(title, k))) return ['senior'];
  if (['junior', 'jr'].some((k) => hasKeyword(title, k))) return ['junior'];
  if (['lead', 'manager', 'head', 'kepala', 'supervisor', 'director', 'direktur'].some((k) => hasKeyword(title, k))) return ['lead'];
  return null;
}

export type Criteria = {
  positionInclude: string[];
  positionExclude: string[];
  descInclude: string[];
  descMode: 'and' | 'or';
  descExclude: string[];
  experienceLevels: string[];
  companyExclude: string[];
};

export type Applied = { keys: Set<string>; companyTitles: Set<string> };

export type RejectReason =
  | 'title' | 'title_exclude' | 'company' | 'closed' | 'description' | 'description_exclude' | 'experience' | 'applied' | 'duplicate';

export const REJECT_LABEL: Record<RejectReason, string> = {
  title: 'judul tidak cocok',
  title_exclude: 'judul berisi kata yang dikecualikan',
  company: 'perusahaan di daftar hitam',
  closed: 'lowongan sudah ditutup',
  description: 'deskripsi tidak memuat kata kunci wajib',
  description_exclude: 'deskripsi memuat kata yang dikecualikan',
  experience: 'level pengalaman tidak cocok',
  applied: 'sudah pernah dilamar',
  duplicate: 'duplikat lowongan dari portal lain',
};

const LEGAL_FORMS = new Set(['pt', 'tbk', 'cv', 'persero', 'ltd', 'inc', 'co', 'corp', 'llc']);
export const normCompany = (c: string) =>
  normalize(c.replace(/\([^()]*\)/g, ' ')) // [^()]*, not .*?: linear on many unclosed "("
    .split(' ')
    .filter((w) => w && !LEGAL_FORMS.has(w))
    .join(' ');
export const companyTitleKey = (company: string, title: string) => `${normCompany(company)}|${normalize(title)}`;
export const listingKey = (portal: string, externalId: string) => `${portal}:${externalId}`;

// Cheap checks on search-result fields, run before fetching detail pages.
export function prefilter(l: Pick<MatchInput, 'title' | 'company'>, c: Criteria): RejectReason | null {
  const title = normalize(l.title);
  if (!c.positionInclude.some((k) => hasKeyword(title, k))) return 'title';
  if (c.positionExclude.some((k) => hasKeyword(title, k))) return 'title_exclude';
  const company = normCompany(l.company);
  if (c.companyExclude.some((k) => normCompany(k) && hasKeyword(company, normCompany(k)))) return 'company';
  return null;
}

export type MatchResult =
  | { ok: true; reason: string; levels: Level[]; flags: string[] }
  | { ok: false; rejectedBy: RejectReason };

export function matchListing(l: MatchInput, c: Criteria, applied: Applied): MatchResult {
  const pre = prefilter(l, c);
  if (pre) return { ok: false, rejectedBy: pre };
  if (l.closed) return { ok: false, rejectedBy: 'closed' };

  const title = normalize(l.title);
  const reasons = [`judul cocok "${c.positionInclude.find((k) => hasKeyword(title, k))}"`];

  const desc = normalize(l.description);
  if (c.descInclude.length) {
    const hits = c.descInclude.filter((k) => hasKeyword(desc, k));
    if (c.descMode === 'and' ? hits.length !== c.descInclude.length : hits.length === 0) return { ok: false, rejectedBy: 'description' };
    reasons.push(`deskripsi memuat ${hits.join(', ')}`);
  }
  if (c.descExclude.some((k) => hasKeyword(desc, k))) return { ok: false, rejectedBy: 'description_exclude' };

  const flags: string[] = [];
  const levels = listingLevels(l);
  if (c.experienceLevels.length) {
    if (!levels) {
      flags.push('experience_unknown');
      reasons.push('level pengalaman tidak diketahui');
    } else if (!levels.some((v) => c.experienceLevels.includes(v))) {
      return { ok: false, rejectedBy: 'experience' };
    } else {
      reasons.push(`level ${levels.map(levelLabel).join(' / ')}`);
    }
  }

  if (applied.keys.has(listingKey(l.portal, l.externalId)) || applied.companyTitles.has(companyTitleKey(l.company, l.title)))
    return { ok: false, rejectedBy: 'applied' };

  if (l.applyMethod === 'external') flags.push('external');
  return { ok: true, reason: reasons.join(' · '), levels: levels ?? [], flags };
}
