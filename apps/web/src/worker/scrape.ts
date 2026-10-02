// Campaign search (SF-01..SF-08): scrape each portal, fetch details for title matches, filter, store matches for preview.
import { ADAPTERS, type Loader, type ScrapedListing } from '@/lib/adapters';
import { get, sleep } from '@/lib/adapters/http';
import { errorMessage, sql } from '@autojobs/shared/db';
import { ExtensionUnavailable, extensionLastSeen, extensionLoader, isOnline } from '@/lib/extension';
import { companyTitleKey, listingKey, matchListing, prefilter, type Criteria, type MatchInput, type RejectReason } from '@/lib/filters';
import { PORTAL_LABEL, type Portal } from '@autojobs/shared/portals';
import { getSettings } from '@autojobs/shared/settings';

export type ScrapeCampaign = Criteria & {
  id: string; userId: string; portals: Portal[]; location: string; maxPages: number; maxListings: number;
};

// What the portal returned but the filters removed, so the user can see why and adjust keywords.
export type RejectedItem = { title: string; company: string; url: string; reason: RejectReason };

type PortalSummary = {
  status: 'pending' | 'running' | 'done' | 'error' | 'disabled';
  found?: number;
  matched?: number;
  rejected?: Partial<Record<RejectReason, number>>;
  rejectedItems?: RejectedItem[];
  error?: string;
};

type StoredListing = MatchInput & { id: string; url: string };

// Auto-apply portals first, so they win when the same job is on several portals.
const PORTAL_ORDER: Portal[] = ['jobstreet', 'glints', 'linkedin'];

// A user-side precondition (extension not running), not a portal problem: kept out of the scraper-health metrics.
class UserSide extends Error {}

// The search waiting longest since it was (re)started, one at a time per user: nobody can take every worker slot.
// The lock is renewed while the search runs (runScrape's save), so a long search is never picked up a second time.
export async function claimScrape(): Promise<ScrapeCampaign | null> {
  const [c] = await sql<ScrapeCampaign[]>`update campaigns set locked_until = now() + interval '30 minutes'
    where id = (select id from campaigns c where status = 'scraping' and (locked_until is null or locked_until < now())
                and user_id not in (select id from users where suspended_at is not null) -- suspended: waits
                and not exists (select 1 from campaigns o where o.user_id = c.user_id and o.id <> c.id
                                and o.status = 'scraping' and o.locked_until > now())
                order by scrape_requested_at limit 1 for update skip locked)
    returning *`;
  return c ?? null;
}

// Portal data (and, for Glints, data a user's browser sent) is stored within bounds.
const cap = (s: string | null | undefined, n: number) => (s ?? '').slice(0, n);

async function upsertListings(listings: (ScrapedListing & { detailed: boolean })[]) {
  if (!listings.length) return;
  const now = new Date();
  const rows = listings.map((l) => ({
    portal: l.portal, externalId: cap(l.externalId, 200), url: cap(l.url, 2000), title: cap(l.title, 300), company: cap(l.company, 200),
    location: cap(l.location, 200), workArrangement: cap(l.workArrangement, 200), jobType: cap(l.jobType, 200),
    experienceMin: l.experienceMin, experienceMax: l.experienceMax, seniorityLabel: cap(l.seniorityLabel, 100), salaryText: cap(l.salaryText, 200),
    description: cap(l.description, 50_000), skills: l.skills.slice(0, 50).map((s) => cap(s, 100)), questions: l.questions.slice(0, 50).map((q) => cap(q, 500)),
    postedAt: l.postedAt, applyMethod: l.applyMethod, applyUrl: l.applyUrl ? cap(l.applyUrl, 2000) : null, closed: l.closed,
    rawJson: l.raw == null || JSON.stringify(l.raw).length > 200_000 ? null : sql.json(l.raw as never),
    detailScrapedAt: l.detailed ? now : null, scrapedAt: now,
  }));
  // A failed detail fetch must not wipe details we already have.
  await sql`insert into job_listings ${sql(rows)} on conflict (portal, external_id) do update set
    url = excluded.url, title = excluded.title, company = excluded.company, location = excluded.location,
    work_arrangement = excluded.work_arrangement, job_type = excluded.job_type,
    experience_min = coalesce(excluded.experience_min, job_listings.experience_min),
    experience_max = coalesce(excluded.experience_max, job_listings.experience_max),
    seniority_label = case when excluded.detail_scraped_at is null then job_listings.seniority_label else excluded.seniority_label end,
    salary_text = excluded.salary_text,
    description = case when excluded.detail_scraped_at is null and job_listings.description <> '' then job_listings.description else excluded.description end,
    skills = excluded.skills,
    questions = case when excluded.detail_scraped_at is null then job_listings.questions else excluded.questions end,
    posted_at = excluded.posted_at,
    apply_method = case when excluded.detail_scraped_at is null then job_listings.apply_method else excluded.apply_method end,
    apply_url = case when excluded.detail_scraped_at is null then job_listings.apply_url else excluded.apply_url end,
    closed = excluded.closed, raw_json = excluded.raw_json,
    detail_scraped_at = coalesce(excluded.detail_scraped_at, job_listings.detail_scraped_at), scraped_at = excluded.scraped_at`;
}

async function loaderFor(portal: Portal, userId: string): Promise<Loader> {
  if (!ADAPTERS[portal].scrapeInUserBrowser) return get;
  const label = PORTAL_LABEL[portal];
  if (!isOnline(await extensionLastSeen(userId)))
    throw new UserSide(`Pencarian ${label} berjalan lewat Chrome di komputer Anda. Buka Chrome dengan ekstensi AutoJobs yang sudah dipasangkan, lalu klik "Cari ulang".`);
  const load = extensionLoader(userId, label);
  return async (url) => {
    try {
      return await load(url);
    } catch (e) {
      throw e instanceof ExtensionUnavailable ? new UserSide(e.message) : e;
    }
  };
}

// Pause between page loads on a portal: about one page a second, like a person clicking through results.
const PAGE_GAP_MS = 1000;

// Keywords take turns, page by page (page 1 of every keyword, then page 2, ...), so the per-portal limit isn't used up
// by the first keyword's pages before the others are searched at all. A keyword without more pages drops out.
// Only listings that `counts` (title matches) use up the limit: portals also return loosely related jobs.
export async function gather(keywords: string[], maxPages: number, max: number,
  fetchPage: (keyword: string, page: number) => Promise<{ listings: ScrapedListing[]; hasMore: boolean }>,
  progress: (found: number) => Promise<unknown> = async () => {}, counts: (l: ScrapedListing) => boolean = () => true,
  until = Infinity): Promise<ScrapedListing[]> {
  const byId = new Map<string, ScrapedListing>();
  let n = 0;
  let active = [...keywords];
  for (let page = 1; page <= maxPages && active.length; page++) {
    const more: string[] = [];
    for (const keyword of active) {
      if (Date.now() > until) return [...byId.values()]; // time's up for this portal: keep what was found
      const res = await fetchPage(keyword, page);
      for (const l of res.listings) {
        if (byId.has(l.externalId)) continue;
        byId.set(l.externalId, l);
        if (counts(l) && ++n >= max) break;
      }
      await progress(byId.size);
      if (n >= max) return [...byId.values()];
      if (res.hasMore) more.push(keyword);
    }
    active = more;
  }
  return [...byId.values()];
}

// At most this long per portal and run (pages + details): a slow or stalling browser can't hold a worker slot for hours.
const PORTAL_MINUTES = 15;

async function collect(portal: Portal, c: ScrapeCampaign, progress: (found: number) => Promise<unknown>) {
  const adapter = ADAPTERS[portal];
  const load = await loaderFor(portal, c.userId);
  const until = Date.now() + PORTAL_MINUTES * 60_000;
  let first = true;
  const found = await gather(c.positionInclude, c.maxPages, c.maxListings, async (keyword, page) => {
    if (!first) await sleep(PAGE_GAP_MS);
    first = false;
    return adapter.search(keyword, c.location, page, load);
  }, progress, (l) => !prefilter(l, c), until);
  // Pages loaded in a user's own browser (Glints) can't be checked by the server, so what they say is kept per user:
  // it never shows up in anybody else's search.
  if (adapter.scrapeInUserBrowser) for (const l of found) l.externalId = `${c.userId}:${l.externalId}`;
  const rejectedItems: RejectedItem[] = [];
  // Title / company checks need no detail page: filter first, then fetch details only for what's left.
  const keep = found.filter((l) => {
    const reason = prefilter(l, c);
    if (reason) rejectedItems.push({ title: l.title, company: l.company, url: l.url, reason });
    return !reason;
  });
  const ids = keep.map((l) => l.externalId);
  const fresh = new Set(
    ids.length
      ? (await sql<{ externalId: string }[]>`select external_id from job_listings where portal = ${portal}
          and external_id in ${sql(ids)} and detail_scraped_at > now() - interval '24 hours'`).map((r) => r.externalId)
      : [],
  );
  const toStore: (ScrapedListing & { detailed: boolean })[] = [];
  for (const l of keep) {
    if (fresh.has(l.externalId)) continue;
    if (Date.now() > until) {
      toStore.push({ ...l, detailed: false }); // out of time: matchable on title, without the details
      continue;
    }
    try {
      toStore.push({ ...(await adapter.detail(l, load)), detailed: true });
    } catch (e) {
      if (e instanceof UserSide) throw e;
      toStore.push({ ...l, detailed: false }); // still matchable on title; description filters may miss it
    }
    await progress(found.length); // also renews the search's lock
    await sleep(PAGE_GAP_MS);
  }
  await upsertListings(toStore);
  const listings = ids.length
    ? await sql<StoredListing[]>`select id, portal, external_id, url, title, company, description, experience_min, experience_max,
        seniority_label, job_type, apply_method, closed from job_listings where portal = ${portal} and external_id in ${sql(ids)}`
    : [];
  return { found: found.length, rejectedItems, listings };
}

async function appliedSets(userId: string) {
  const rows = await sql<{ portal: string; externalId: string; company: string; title: string }[]>`
    select l.portal, l.external_id, l.company, l.title from applications a join job_listings l on l.id = a.listing_id
    where a.user_id = ${userId} and not a.dry_run and a.status <> 'cancelled'`;
  return {
    keys: new Set(rows.map((r) => listingKey(r.portal, r.externalId))),
    companyTitles: new Set(rows.map((r) => companyTitleKey(r.company, r.title))),
  };
}

export async function runScrape(c: ScrapeCampaign) {
  const settings = await getSettings();
  const portals = PORTAL_ORDER.filter((p) => c.portals.includes(p));
  const summary: Record<string, PortalSummary> = Object.fromEntries(portals.map((p) => [p, { status: 'pending' }]));
  // Every progress update also renews the lock: a running search is never claimed a second time.
  const save = () => sql`update campaigns set scrape_summary = ${sql.json(summary)}, locked_until = now() + interval '30 minutes'
    where id = ${c.id} and status = 'scraping'`;
  await save();

  const perPortal = await Promise.all(
    portals.map(async (portal): Promise<{ listings: StoredListing[]; rejectedItems: RejectedItem[] }> => {
      if (!settings.portalEnabled[portal]) {
        summary[portal] = { status: 'disabled', error: 'Portal sedang dinonaktifkan oleh admin' };
        return { listings: [], rejectedItems: [] };
      }
      summary[portal] = { status: 'running', found: 0 };
      await save();
      try {
        const r = await collect(portal, c, (n) => { summary[portal].found = n; return save(); });
        summary[portal] = { status: 'done', found: r.found };
        await sql`insert into scrape_runs (campaign_id, portal, ok, listings) values (${c.id}, ${portal}, true, ${r.found})`;
        return r;
      } catch (e) {
        summary[portal] = { status: 'error', error: errorMessage(e) };
        if (!(e instanceof UserSide))
          await sql`insert into scrape_runs (campaign_id, portal, ok, error) values (${c.id}, ${portal}, false, ${errorMessage(e)})`;
        return { listings: [], rejectedItems: [] };
      }
    }),
  );

  const applied = await appliedSets(c.userId);
  const seen = new Set<string>();
  const matches: Record<string, unknown>[] = [];
  perPortal.forEach(({ listings, rejectedItems }, i) => {
    const s = summary[portals[i]];
    s.matched = 0;
    const reject = (l: StoredListing, reason: RejectReason) => rejectedItems.push({ title: l.title, company: l.company, url: l.url, reason });
    for (const l of listings) {
      const r = matchListing(l, c, applied);
      if (!r.ok) { reject(l, r.rejectedBy); continue; }
      const key = companyTitleKey(l.company, l.title);
      if (seen.has(key)) { reject(l, 'duplicate'); continue; }
      seen.add(key);
      matches.push({ campaignId: c.id, listingId: l.id, matchReason: r.reason, experienceLevels: r.levels, flags: r.flags });
      s.matched++;
    }
    s.rejected = {};
    for (const x of rejectedItems) s.rejected[x.reason] = (s.rejected[x.reason] ?? 0) + 1;
    s.rejectedItems = rejectedItems.slice(0, 200);
  });

  await sql.begin(async (tx) => {
    await tx`delete from campaign_matches where campaign_id = ${c.id}`;
    if (matches.length) await tx`insert into campaign_matches ${tx(matches)}`;
    await tx`update campaigns set status = 'ready', locked_until = null, scrape_summary = ${tx.json(summary)}
      where id = ${c.id} and status = 'scraping'`;
  });
}
