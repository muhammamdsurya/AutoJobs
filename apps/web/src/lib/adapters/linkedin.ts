import * as cheerio from 'cheerio';
import { htmlToText } from './http';
import type { ApplySpec, PortalAdapter, ScrapedListing } from './types';

// Search: public "guest" job pages (no login), same endpoints as the reference scraper.
// Applying (Phase 2): Easy Apply in the user's own signed-in browser, via the extension. Texts cover LinkedIn's English
// and Indonesian UI. Not yet seen on a real Easy Apply form: validate with dry runs first.
const GUEST = 'https://www.linkedin.com/jobs-guest/jobs/api';
const EN = { 'accept-language': 'en-US,en;q=0.9' }; // criteria labels below are matched in English

const apply: ApplySpec = {
  // Never the plain "Apply" button: it opens the company site (see externalButton).
  // Indonesian UI (seen 2026-09-30): "Melamar Mudah", aria-label "Melamar Mudah lowongan ini".
  applyButton: /^(Easy Apply|Melamar Mudah|Lamar Mudah|Lamaran Mudah)$/.source,
  externalButton: /^(Apply|Melamar|Lamar)$/.source,
  // Job page after applying: "Status lamaran" · "Lamaran dikirim" · "1 jam yang lalu" (each on its own line), or
  // "Applied 1h ago" / "Application status" in English.
  alreadyApplied: /^(applied|dilamar|melamar|lamaran (dikirim|terkirim)) .*(ago|lalu)$|^(see application|lihat lamaran|application submitted|application sent|lamaran dikirim|lamaran terkirim|status lamaran|application status)$/.source,
  closed: /no longer accepting applications|tidak lagi menerima lamaran/.source,
  confirmation: /your application was sent|application sent|lamaran anda (telah )?(terkirim|dikirim)|lamaran (telah )?terkirim/.source,
  nextSelector: 'button[data-easy-apply-next-button], button[data-live-test-easy-apply-next-button], button[data-live-test-easy-apply-review-button]',
  submitSelector: 'button[data-live-test-easy-apply-submit-button], button[aria-label="Submit application"]',
  next: /^(Next|Continue to next step|Review|Review your application|Berikutnya|Lanjut|Lanjutkan|Tinjau|Tinjau lamaran Anda)$/.source,
  submit: /^(Submit application|Submit|Kirim lamaran|Kirim)$/.source,
  loginUrl: /\/login|\/uas\/login|\/checkpoint|\/authwall|\/signup/.source,
  form: 'dialog[open]', // Easy Apply is a native dialog; the job page behind it has its own "Berikutnya" carousels
  uncheck: /^(follow|ikuti) /.source, // "Follow <company> to stay up to date…": ticked by default, the user chose not to
};

export const linkedin: PortalAdapter = {
  async search(keyword, location, page, load) {
    const params = new URLSearchParams({ keywords: keyword, location: location.trim() || 'Indonesia', start: String((page - 1) * 10) });
    const $ = cheerio.load(await load(`${GUEST}/seeMoreJobPostings/search?${params}`, EN));
    const listings = $('[data-entity-urn^="urn:li:jobPosting:"]')
      .map((_, el): ScrapedListing => {
        const c = $(el);
        const id = c.attr('data-entity-urn')!.split(':').pop()!;
        const date = c.find('time').attr('datetime');
        return {
          portal: 'linkedin', externalId: id, url: `https://www.linkedin.com/jobs/view/${id}`,
          title: c.find('.base-search-card__title').text().trim(),
          company: c.find('.base-search-card__subtitle').text().trim(),
          location: c.find('.job-search-card__location').text().trim(),
          workArrangement: '', jobType: '', experienceMin: null, experienceMax: null, seniorityLabel: '', salaryText: '',
          description: '', skills: [], questions: [], postedAt: date ? new Date(date) : null,
          applyMethod: 'unknown', closed: false, raw: null,
        };
      })
      .get();
    return { listings, hasMore: listings.length >= 10 };
  },

  async detail(l, load) {
    const $ = cheerio.load(await load(`${GUEST}/jobPosting/${l.externalId}`, EN));
    const criteria: Record<string, string> = {};
    $('.description__job-criteria-item').each((_, el) => {
      criteria[$(el).find('.description__job-criteria-subheader').text().trim()] = $(el).find('.description__job-criteria-text').text().trim();
    });
    return {
      ...l,
      description: htmlToText($('.show-more-less-html__markup').html() ?? ''),
      seniorityLabel: criteria['Seniority level'] ?? '',
      jobType: criteria['Employment type'] ?? '',
      applyMethod: $('[data-tracking-control-name*="apply-link-offsite"]').length ? 'external' : 'easy_apply',
      closed: /no longer accepting applications/i.test($.root().text()),
    };
  },

  signInUrl: 'https://www.linkedin.com/login',
  checkUrl: 'https://www.linkedin.com/feed/',
  apply,
};
