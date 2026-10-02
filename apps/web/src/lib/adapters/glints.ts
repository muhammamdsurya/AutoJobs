import { isAllIndonesia, nextData } from './http';
import type { ApplySpec, PortalAdapter, ScrapedListing } from './types';

// Glints is a Next.js site: search results and job details are in the page's __NEXT_DATA__ JSON.
// It sits behind a Cloudflare check that only a real browser the user verified passes, so its pages
// load through the extension in the user's own Chrome.
const BASE = 'https://glints.com';

const apply: ApplySpec = {
  // The web "Lamar" button; never "Lamar & Chat di Aplikasi", which continues in the Glints mobile app.
  applySelector: '[data-testid="apply-start"]',
  submitSelector: '[data-testid="apply-submit"]',
  applyButton: /^(Lamar|Lamar Cepat|Lamar Sekarang|Apply|Apply Now|Easy Apply)$/.source,
  // After applying, Glints swaps the "Lamar" buttons for "Chat dengan HRD".
  alreadyApplied: /^(sudah dilamar|dilamar|lamaran terkirim|applied|chat dengan hrd)$/.source,
  closed: /lowongan (ini )?(sudah )?(ditutup|tidak (lagi )?(tersedia|aktif))|job (is )?(closed|no longer available)/.source,
  // Success popup: "Selamat, lamaran kamu sebagai <judul> di <perusahaan> berhasil terkirim."
  confirmation: /lamaran(mu| kamu| anda)? (telah |sudah |berhasil )?(terkirim|dikirim)|lamaran kamu sebagai [\s\S]{1,300}? berhasil terkirim|berhasil melamar|application (sent|submitted)|you('ve| have) applied/.source,
  // Every question in the apply modal is required (Selanjutnya stays disabled), though none is marked so.
  requiredName: /./.source,
  next: /^(Lanjut|Lanjutkan|Selanjutnya|Berikutnya|Next|Continue)$/.source,
  submit: /^(Kirim|Kirim Lamaran|Submit|Submit Application)$/.source,
  loginUrl: /\/login(\/|\?|$)|\/signup|\/sign-?in/.source,
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'job';
const idr = (n: number) => n.toLocaleString('id-ID');

// Glints may give only a minimum or only a maximum ("up to Rp 8 jt"), or neither.
export function salaryText(sal: { minAmount?: number | null; maxAmount?: number | null; salaryMode?: string } | null | undefined): string {
  const min = typeof sal?.minAmount === 'number' ? sal.minAmount : null;
  const max = typeof sal?.maxAmount === 'number' ? sal.maxAmount : null;
  const range = min != null && max != null && min !== max ? `Rp ${idr(min)} - Rp ${idr(max)}`
    : min != null ? `Rp ${idr(min)}${max == null ? '+' : ''}`
    : max != null ? `s.d. Rp ${idr(max)}` : '';
  return range && `${range}${sal?.salaryMode === 'MONTH' ? ' per bulan' : ''}`;
}

function toListing(x: any): ScrapedListing {
  const city = x.location?.parents?.find((p: any) => p.level === 3)?.formattedName ?? x.location?.formattedName ?? x.city?.name ?? '';
  const sal = x.shouldShowSalary ? x.salaries?.[0] : null;
  return {
    portal: 'glints',
    externalId: x.id,
    url: `${BASE}/id/opportunities/jobs/${slug(x.title ?? '')}/${x.id}`,
    title: x.title ?? '',
    company: x.company?.brandName || x.company?.name || '',
    location: city,
    workArrangement: x.workArrangementOption ?? '',
    jobType: x.type ?? '',
    experienceMin: x.minYearsOfExperience ?? null,
    experienceMax: x.maxYearsOfExperience ?? null,
    seniorityLabel: '',
    salaryText: salaryText(sal),
    description: '',
    skills: (x.skills ?? []).map((s: any) => s.skill?.name).filter(Boolean),
    questions: [],
    postedAt: x.updatedAt || x.createdAt ? new Date(x.updatedAt ?? x.createdAt) : null,
    applyMethod: 'unknown',
    closed: x.status != null && x.status !== 'OPEN',
    raw: x,
  };
}

export const glints: PortalAdapter = {
  scrapeInUserBrowser: true,

  async search(keyword, location, page, load) {
    const params = new URLSearchParams({
      keyword,
      country: 'ID',
      locationName: isAllIndonesia(location) ? 'All Cities/Provinces' : location,
      page: String(page),
    });
    const jobs = nextData(await load(`${BASE}/id/opportunities/jobs/explore?${params}`)).props?.pageProps?.initialJobs;
    if (!Array.isArray(jobs?.jobsInPage)) throw new Error('Data lowongan Glints tidak ditemukan (struktur halaman berubah?)');
    return { listings: jobs.jobsInPage.map(toListing), hasMore: !!jobs.hasMore };
  },

  async detail(l, load) {
    const job = nextData(await load(l.url)).props?.pageProps?.initialData?.data;
    if (!job) return { ...l, closed: true };
    const blocks: { text: string }[] = JSON.parse(job.descriptionJsonString ?? '{"blocks":[]}').blocks ?? [];
    return {
      ...l,
      description: blocks.map((b) => b.text).join('\n'),
      applyMethod: job.externalApplyURL ? 'external' : 'portal_apply',
      applyUrl: /^https?:\/\//i.test(job.externalApplyURL ?? '') ? job.externalApplyURL : null, // rendered as a link: http(s) only
      closed: job.status != null ? job.status !== 'OPEN' : l.closed,
      experienceMin: job.minYearsOfExperience ?? l.experienceMin,
      experienceMax: job.maxYearsOfExperience ?? l.experienceMax,
      skills: (job.skills ?? []).map((s: any) => s.skill?.name).filter(Boolean),
    };
  },

  signInUrl: `${BASE}/id/login`,
  checkUrl: `${BASE}/id/profile`,
  apply,
};
