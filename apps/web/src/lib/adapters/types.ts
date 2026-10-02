import type { Portal } from '@autojobs/shared/portals';

// Normalized listing (PRD section 3), as scraped. Stored in job_listings.
export type ScrapedListing = {
  portal: Portal;
  externalId: string;
  url: string;
  title: string;
  company: string;
  location: string;
  workArrangement: string;
  jobType: string;
  experienceMin: number | null;
  experienceMax: number | null;
  seniorityLabel: string;
  salaryText: string;
  description: string;
  skills: string[];
  questions: string[];
  postedAt: Date | null;
  applyMethod: 'easy_apply' | 'portal_apply' | 'external' | 'unknown';
  applyUrl?: string | null; // company-site link for 'external', when the portal exposes it
  closed: boolean;
  raw: unknown;
};

export type SearchPage = { listings: ScrapedListing[]; hasMore: boolean };

// How the extension recognises and drives a portal's apply flow. Plain data (regex sources, matched
// case-insensitively) so the server sends it with each task: fixing a portal never needs an extension update.
export type ApplySpec = {
  // Stable attributes, preferred over the text matches when the portal has them.
  applySelector?: string;
  nextSelector?: string;
  submitSelector?: string;
  applyButton: string;
  alreadyApplied: string;
  closed: string;
  confirmation: string;
  next: string;
  submit: string;
  loginUrl: string; // the page URL means "not signed in"
  requiredName?: string; // form fields (by name) the portal requires without marking them required
  // Radios to tick before filling a step (e.g. "upload a resume"), depending on whether a cover letter exists.
  prepare?: { radio: string; when: 'always' | 'coverLetter' | 'noCoverLetter' }[];
  uncheck?: string; // checkboxes (by label) to untick on every step, e.g. LinkedIn "Follow <company>"
  form?: string; // the container the apply form always lives in (LinkedIn: dialog[open]); controls outside it are ignored
  externalButton?: string; // an apply button that leads to the company site (→ manual) when the in-portal one is absent
};

// Fetches a page's HTML/JSON. Plain HTTPS by default; the user's own browser (via the extension) for Glints.
export type Loader = (url: string, headers?: Record<string, string>) => Promise<string>;

// One module per portal (PRD: "a page change touches one module").
export type PortalAdapter = {
  search(keyword: string, location: string, page: number, load: Loader): Promise<SearchPage>;
  detail(listing: ScrapedListing, load: Loader): Promise<ScrapedListing>;
  // Glints only answers a real browser that the user has verified, so its pages load through the extension.
  scrapeInUserBrowser?: boolean;
  signInUrl: string; // opened for the user to sign in
  checkUrl: string; // members-only page the extension opens to see whether the user is signed in
  apply?: ApplySpec;
};
