import { htmlToText, isAllIndonesia } from './http';
import type { ApplySpec, PortalAdapter, ScrapedListing } from './types';

// JobStreet Indonesia runs on SEEK's platform (id.jobstreet.com). Search is a public JSON API;
// the job page embeds the full job (description, screening questions, link-out flag) in SEEK_REDUX_DATA.
const BASE = 'https://id.jobstreet.com';

// Checked against a real logged-in apply page (dry run, 2026-09-28): steps "Pilih dokumen" → "Jawab pertanyaan
// perusahaan" → "Perbarui Profil Jobstreet" → "Review dan kirim"; resumes are radios named by file.
const apply: ApplySpec = {
  applySelector: '[data-automation="job-detail-apply"]',
  nextSelector: '[data-testid="continue-button"]',
  applyButton: /^(Lamaran Cepat|Lamar Cepat|Quick apply)$/.source,
  alreadyApplied: /(kamu|anda) (sudah |telah )?melamar pada|you applied on/.source,
  closed: /lowongan (ini )?(sudah )?(tidak (lagi )?tersedia|ditutup|berakhir|kedaluwarsa)|this job is no longer (available|advertised)|job (ad )?has expired/.source,
  confirmation: /lamaran(mu| kamu| anda) (telah |sudah |berhasil )?(terkirim|dikirim)|your application (has been|was) (sent|submitted)|application sent/.source,
  next: /^(Lanjut|Lanjutkan|Berikutnya|Continue|Next)$/.source,
  submit: /^(Kirim lamaran|Kirim|Submit application|Submit)$/.source,
  loginUrl: /\/oauth\/login|login\.seek\.com|\/login(\/|\?|$)|\/sign-?in/.source,
  requiredName: /^questionnaire\./.source, // employer questions: required, but not marked so in the page
  // Only cover-letter radios: the resume list is handled by the extension (reuses an uploaded CV of the same name).
  prepare: [
    { radio: /tulis surat lamaran|write a cover letter/.source, when: 'coverLetter' },
    { radio: /jangan sertakan surat lamaran|tanpa surat lamaran|don.t include a cover letter/.source, when: 'noCoverLetter' },
  ],
};

function toListing(x: any): ScrapedListing {
  return {
    portal: 'jobstreet',
    externalId: String(x.id),
    url: `${BASE}/id/job/${x.id}`,
    title: x.title ?? '',
    company: x.companyName ?? x.advertiser?.description ?? '',
    location: x.locations?.[0]?.label ?? '',
    workArrangement: (x.workArrangements?.data ?? []).map((a: any) => a.label?.text).filter(Boolean).join(', '),
    jobType: (x.workTypes ?? []).join(', '),
    experienceMin: null,
    experienceMax: null,
    seniorityLabel: '',
    salaryText: x.salaryLabel ?? '',
    description: [x.teaser, ...(x.bulletPoints ?? [])].filter(Boolean).join('\n'),
    skills: [],
    questions: [],
    postedAt: x.listingDate ? new Date(x.listingDate) : null,
    applyMethod: 'unknown',
    closed: false,
    raw: x,
  };
}

export const jobstreet: PortalAdapter = {
  async search(keyword, location, page, load) {
    const params = new URLSearchParams({ siteKey: 'ID-Main', sourcesystem: 'houston', page: String(page), pageSize: '30', keywords: keyword, locale: 'id-ID' });
    if (!isAllIndonesia(location)) params.set('where', location);
    const j = JSON.parse(await load(`${BASE}/api/jobsearch/v5/search?${params}`, { accept: 'application/json' }));
    if (!Array.isArray(j.data)) throw new Error('Format hasil pencarian JobStreet berubah');
    return { listings: j.data.map(toListing), hasMore: page * 30 < (j.totalCount ?? 0) };
  },

  async detail(l, load) {
    const html = await load(l.url);
    const m = html.match(/window\.SEEK_REDUX_DATA\s*=\s*(\{.*?\});\s*\n/s);
    if (!m) throw new Error('SEEK_REDUX_DATA tidak ditemukan (struktur halaman JobStreet berubah?)');
    const data = JSON.parse(m[1].replace(/([:[,])undefined(?=[,}\]])/g, '$1null'));
    const result = data.jobdetails?.result;
    const job = result?.job;
    if (!job) return { ...l, closed: true };
    return {
      ...l,
      description: htmlToText(job.content ?? '') || l.description,
      questions: job.products?.questionnaire?.questions ?? [],
      applyMethod: job.isLinkOut ? 'external' : 'portal_apply',
      closed: !!job.isExpired || (job.status != null && job.status !== 'Active'),
      workArrangement: (result.workArrangements?.arrangements ?? []).map((a: any) => a.label).filter(Boolean).join(', ') || l.workArrangement,
      salaryText: job.salary?.label ?? l.salaryText,
    };
  },

  signInUrl: `${BASE}/id/oauth/login?returnUrl=%2Fid%2F`,
  checkUrl: `${BASE}/id/my-activity/applied-jobs`,
  apply,
};
