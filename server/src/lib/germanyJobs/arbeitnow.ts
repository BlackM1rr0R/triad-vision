import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import {
  PAGE_SIZE,
  MAX_PAGE,
  UpstreamError,
  fetchJson,
  fold,
  httpUrl,
  looksLikeAusbildung,
  plainText,
  positiveInt,
  type GermanyJob,
  type JobProvider,
  type ProviderPage,
  type SearchQuery,
} from './common.js';

/**
 * Arbeitnow (https://www.arbeitnow.com/api/job-board-api) — the default, free provider: no key, jobs in Germany
 * (many English-speaking / international roles). Its terms: "This is a free public API for jobs, please do not
 * abuse. I would appreciate linking back to the site." and (arbeitnow.com/terms §11) "You also agree to providing
 * a link back to Arbeitnow.com on your platform." So visitors never trigger a call:
 *
 *  - the feed (pages 1…ARBEITNOW_MAX_PAGES, 300 jobs each) is fetched at most once an hour — by the scheduler
 *    (jobs/germanyJobs.ts) or, right after a start without a fresh file cache, by the first search;
 *  - polite User-Agent, timeouts, exponential backoff after failures (15 min … 2 h); the last good feed is kept;
 *  - a small file cache (<UPLOADS_DIR>/cache/arbeitnow-feed.json) so a restart does not refetch immediately;
 *  - every refresh replaces the whole list: listings that left the feed are gone (no expired jobs);
 *  - searches filter in memory (keyword over title / tags / company / text, place, remote, working time,
 *    visa sponsorship, Ausbildung = "Ausbildung" / "Azubi" / "apprentice" in title or tags).
 * `visa_sponsorship=true` (mentioned on the Arbeitnow blog) is fetched as one extra page; when it returns the same
 * list as the unfiltered feed the parameter is treated as unsupported and no job is marked.
 * The description HTML goes through the app's sanitiser into a short text snippet; the full text stays at the source.
 * Off only with ARBEITNOW_ENABLED=0.
 */

export const ARBEITNOW_URL = 'https://www.arbeitnow.com/api/job-board-api';
export const FEED_TTL_MS = 60 * 60 * 1000;
const BACKOFF_MIN_MS = 15 * 60 * 1000;
const BACKOFF_MAX_MS = 2 * 60 * 60 * 1000;
const PAGE_DELAY_MS = 1500;

interface FeedJob extends GermanyJob {
  /** Folded text the keyword search runs over. */
  haystack: string;
  place: string;
  createdTs: number;
}

interface FeedState {
  items: FeedJob[];
  fetchedAt: number | null;
  lastError: string | null;
  failures: number;
  nextTryAt: number;
  refreshing: Promise<void> | null;
  loadedFromFile: boolean;
}

const fresh = (): FeedState => ({ items: [], fetchedAt: null, lastError: null, failures: 0, nextTryAt: 0, refreshing: null, loadedFromFile: false });
let state = fresh();

const cacheFile = () => path.join(path.dirname(config.uploads.privateDir), 'cache', 'arbeitnow-feed.json');
const maxPages = (env = process.env) => Math.min(positiveInt(env.ARBEITNOW_MAX_PAGES, 3), 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const str = (x: unknown) => (typeof x === 'string' ? x : '');
const strList = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean).slice(0, 12) : []);

/** One Arbeitnow job → our shape (null without slug / title / link). */
export const normalizeArbeitnow = (raw: unknown, visa: Set<string> | null): FeedJob | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const slug = str(r.slug).slice(0, 120);
  const title = plainText(r.title, 300);
  const url = httpUrl(r.url);
  if (!slug || !title || !url) return null;
  const tags = strList(r.tags);
  const types = strList(r.job_types).map((t) => t.toLowerCase());
  const created = typeof r.created_at === 'number' && r.created_at > 0 ? r.created_at * 1000 : 0;
  const description = plainText(r.description, 4000);
  const company = plainText(r.company_name, 200) || null;
  const location = plainText(r.location, 200) || null;
  const full = types.some((t) => /full|vollzeit/.test(t));
  const part = types.some((t) => /part|teilzeit|werkstudent|mini/.test(t));
  return {
    id: `arbeitnow:${slug}`,
    source: 'arbeitnow',
    title,
    company,
    location,
    snippet: description.length > 300 ? `${description.slice(0, 299).trimEnd()}…` : description,
    salaryMin: null,
    salaryMax: null,
    salaryText: null,
    salaryPeriod: null,
    salaryPredicted: false,
    created: created ? new Date(created).toISOString() : null,
    contractTime: full && !part ? 'full_time' : part && !full ? 'part_time' : null,
    contractType: types.some((t) => /permanent|unbefristet/.test(t)) ? 'permanent' : types.some((t) => /contract|befristet|temporary/.test(t)) ? 'contract' : null,
    remote: r.remote === true ? true : r.remote === false ? false : null,
    visaSponsorship: visa ? visa.has(slug) : null,
    tags,
    url,
    haystack: fold([title, company ?? '', tags.join(' '), types.join(' '), description].join(' ')),
    place: fold(location ?? ''),
    createdTs: created,
  };
};

const fetchFeedPage = async (page: number, extra = '') => {
  const body = (await fetchJson(`${ARBEITNOW_URL}?page=${page}${extra}`, { timeoutMs: 15_000 })) as { data?: unknown; links?: { next?: unknown } } | null;
  return { data: Array.isArray(body?.data) ? body.data : [], hasNext: typeof body?.links?.next === 'string' && !!body.links.next };
};

const persist = async () => {
  try {
    const file = cacheFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const slim = state.items.map(({ haystack: _h, place: _p, createdTs: _c, ...j }) => j);
    await fs.writeFile(file, JSON.stringify({ fetchedAt: state.fetchedAt, items: slim }));
  } catch (err) {
    console.error('[germany-jobs] arbeitnow cache write failed', (err as Error).message);
  }
};

const rehydrate = (j: GermanyJob): FeedJob => ({
  ...j,
  haystack: fold([j.title, j.company ?? '', j.tags.join(' '), j.snippet].join(' ')),
  place: fold(j.location ?? ''),
  createdTs: j.created ? Date.parse(j.created) : 0,
});

/** After a start: the file cache, when it is younger than the feed TTL (no immediate refetch). */
const loadFile = async (now: number) => {
  if (state.loadedFromFile) return;
  state.loadedFromFile = true;
  try {
    const raw = JSON.parse(await fs.readFile(cacheFile(), 'utf8')) as { fetchedAt?: number; items?: GermanyJob[] };
    if (typeof raw.fetchedAt === 'number' && now - raw.fetchedAt < FEED_TTL_MS && Array.isArray(raw.items) && !state.fetchedAt) {
      state.items = raw.items.map(rehydrate);
      state.fetchedAt = raw.fetchedAt;
    }
  } catch {
    /* no cache yet */
  }
};

/** Fetches the feed (pages 1…cap) and replaces the list. Never throws; failures back off. */
export const refreshArbeitnow = async (opts: { now?: number; force?: boolean; delayMs?: number } = {}): Promise<void> => {
  const now = opts.now ?? Date.now();
  if (state.refreshing) return state.refreshing;
  if (!opts.force && now < state.nextTryAt) return;
  if (!opts.force && state.fetchedAt && now - state.fetchedAt < FEED_TTL_MS) return;
  const delay = opts.delayMs ?? (config.isTest ? 0 : PAGE_DELAY_MS);
  state.refreshing = (async () => {
    try {
      const raws: unknown[] = [];
      let firstSlugs: string[] = [];
      for (let page = 1; page <= maxPages(); page++) {
        if (page > 1 && delay) await sleep(delay);
        const r = await fetchFeedPage(page);
        if (page === 1) firstSlugs = r.data.map((d) => str((d as { slug?: unknown })?.slug));
        raws.push(...r.data);
        if (!r.hasNext) break;
      }
      let visa: Set<string> | null = null;
      try {
        if (delay) await sleep(delay);
        const v = await fetchFeedPage(1, '&visa_sponsorship=true');
        const slugs = v.data.map((d) => str((d as { slug?: unknown })?.slug)).filter(Boolean);
        // Same list as the unfiltered feed → the parameter is ignored: do not mark anything.
        const same = slugs.length === firstSlugs.length && slugs.every((s, i) => s === firstSlugs[i]);
        visa = same ? null : new Set(slugs);
      } catch {
        visa = null;
      }
      const seen = new Set<string>();
      const items: FeedJob[] = [];
      for (const raw of raws) {
        const j = normalizeArbeitnow(raw, visa);
        if (j && !seen.has(j.id)) {
          seen.add(j.id);
          items.push(j);
        }
      }
      state.items = items;
      state.fetchedAt = Date.now();
      state.lastError = null;
      state.failures = 0;
      state.nextTryAt = 0;
      await persist();
    } catch (err) {
      state.failures += 1;
      state.lastError = err instanceof UpstreamError ? `${err.code}: ${err.message}` : String((err as Error).message ?? err);
      state.nextTryAt = Date.now() + Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (state.failures - 1));
      console.error('[germany-jobs] arbeitnow refresh failed', state.lastError);
    } finally {
      state.refreshing = null;
    }
  })();
  return state.refreshing;
};

/** Local filter of the feed (pure; exported for tests). */
export const filterFeed = (items: FeedJob[], q: SearchQuery) => {
  const words = fold(q.q).split(' ').filter((w) => w.length > 1);
  const place = fold(q.where);
  const out = items.filter((j) => {
    if (words.length && !words.every((w) => j.haystack.includes(w))) return false;
    if (place && !j.place.includes(place)) return false;
    if (q.type === 'ausbildung' && !looksLikeAusbildung(`${j.title} ${j.tags.join(' ')}`)) return false;
    if (q.time === 'full' && j.contractTime !== 'full_time') return false;
    if (q.time === 'part' && j.contractTime !== 'part_time') return false;
    if (q.remote && j.remote !== true) return false;
    if (q.visa && j.visaSponsorship !== true) return false;
    return true;
  });
  return q.sort === 'date' ? [...out].sort((a, b) => b.createdTs - a.createdTs) : out;
};

const strip = ({ haystack: _h, place: _p, createdTs: _c, ...j }: FeedJob): GermanyJob => j;

export const arbeitnowProvider: JobProvider = {
  info: { id: 'arbeitnow', name: 'Arbeitnow', url: 'https://www.arbeitnow.com' },
  enabled: (env = process.env) => env.ARBEITNOW_ENABLED !== '0' && env.ARBEITNOW_ENABLED?.toLowerCase() !== 'false',
  search: async (q): Promise<ProviderPage> => {
    const now = Date.now();
    await loadFile(now);
    // No data yet (first search after a start without cache): wait for the feed; otherwise serve what we have.
    if (!state.fetchedAt) await refreshArbeitnow({ now });
    else if (now - state.fetchedAt >= FEED_TTL_MS) void refreshArbeitnow({ now });
    if (!state.fetchedAt && state.lastError) throw new UpstreamError('UPSTREAM_ERROR', state.lastError);
    const all = filterFeed(state.items, q);
    const start = (q.page - 1) * PAGE_SIZE;
    return { items: all.slice(start, start + PAGE_SIZE).map(strip), total: all.length, pages: Math.min(MAX_PAGE, Math.max(1, Math.ceil(all.length / PAGE_SIZE))) };
  },
  status: (env = process.env) => {
    const enabled = arbeitnowProvider.enabled(env);
    return {
      id: 'arbeitnow',
      name: 'Arbeitnow',
      configured: true,
      enabled,
      note: enabled ? null : 'ARBEITNOW_ENABLED=0',
      lastFetchAt: state.fetchedAt ? new Date(state.fetchedAt).toISOString() : null,
      lastError: state.lastError,
      items: state.items.length,
    };
  },
  reset: () => {
    state = fresh();
    state.loadedFromFile = true; // tests never read a file cache
  },
};

/** Scheduler entry (jobs/germanyJobs.ts): refresh when due and enabled. */
export const scheduledArbeitnowRefresh = async () => {
  if (!arbeitnowProvider.enabled()) return;
  await loadFile(Date.now());
  await refreshArbeitnow();
};
