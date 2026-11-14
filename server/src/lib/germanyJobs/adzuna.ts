import {
  CallBudget,
  PAGE_SIZE,
  MAX_PAGE,
  QueryCache,
  UpstreamError,
  fetchJson,
  httpUrl,
  isOn,
  keywordsFor,
  plainText,
  positiveInt,
  positiveNumber,
  queryKey,
  type GermanyJob,
  type JobProvider,
  type ProviderPage,
  type SearchQuery,
} from './common.js';

/**
 * Adzuna API (https://developer.adzuna.com — GET https://api.adzuna.com/v1/api/jobs/de/search/{page}), optional
 * and paid beyond a short trial: OFF unless ADZUNA_APP_ID + ADZUNA_APP_KEY are set AND ADZUNA_ENABLED=1.
 *
 * Adzuna terms (developer.adzuna.com/docs/terms_of_service): "An API user shall label each displayed advert with the
 * phrase "Adzuna" at least 116 X 23 pixels in size" and "the word "Adzuna" shall be hyperlinked to
 * http://www.adzuna.co.uk or the relevant local domain" (the client renders that badge per card); "An API user agrees
 * to direct all queries via Adzuna" (links go through `redirect_url`); on termination all Adzuna data must be
 * removed (nothing is stored: 20 min in-memory cache per query); commercial use after the 14-day trial needs a
 * licence agreement. The app key never leaves the server and is never logged.
 */

export const ADZUNA_BASE = 'https://api.adzuna.com/v1/api/jobs/de/search';
export const CACHE_TTL_MS = 20 * 60 * 1000;
const cache = new QueryCache<ProviderPage>(CACHE_TTL_MS);
const budget = new CallBudget(() => ({ perMinute: positiveInt(process.env.ADZUNA_MAX_CALLS_PER_MINUTE, 20), perDay: positiveInt(process.env.ADZUNA_MAX_CALLS_PER_DAY, 200) }));
let lastFetchAt: number | null = null;
let lastError: string | null = null;

const keys = (env: NodeJS.ProcessEnv) => {
  const appId = env.ADZUNA_APP_ID?.trim();
  const appKey = env.ADZUNA_APP_KEY?.trim();
  return appId && appKey ? { appId, appKey } : null;
};

/** The Adzuna query string of a search (app id / key included — never sent to the browser). */
export const adzunaParams = (q: SearchQuery, cfg: { appId: string; appKey: string }) => {
  const p = new URLSearchParams({ app_id: cfg.appId, app_key: cfg.appKey, results_per_page: String(PAGE_SIZE), 'content-type': 'application/json' });
  const what = keywordsFor(q);
  if (what) p.set('what', what);
  if (q.where) {
    p.set('where', q.where);
    p.set('distance', String(q.radius));
  }
  if (q.time === 'full') p.set('full_time', '1');
  if (q.time === 'part') p.set('part_time', '1');
  if (q.sort === 'date') p.set('sort_by', 'date');
  p.set('max_days_old', '60');
  return p;
};

/** One Adzuna result → our shape; null when it has no usable id / title / link. */
export const normalizeAdzuna = (raw: unknown): GermanyJob | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = r.id == null ? '' : String(r.id).slice(0, 64);
  const title = plainText(r.title, 300);
  const url = httpUrl(r.redirect_url);
  if (!id || !title || !url) return null;
  const company = r.company as { display_name?: unknown } | undefined;
  const location = r.location as { display_name?: unknown } | undefined;
  const created = typeof r.created === 'string' && !Number.isNaN(Date.parse(r.created)) ? new Date(r.created).toISOString() : null;
  const min = positiveNumber(r.salary_min);
  const max = positiveNumber(r.salary_max);
  return {
    id: `adzuna:${id}`,
    source: 'adzuna',
    title,
    company: plainText(company?.display_name, 200) || null,
    location: plainText(location?.display_name, 200) || null,
    snippet: plainText(r.description, 300),
    salaryMin: min,
    salaryMax: max,
    salaryText: null,
    salaryPeriod: min || max ? 'year' : null,
    salaryPredicted: r.salary_is_predicted === 1 || r.salary_is_predicted === '1' || r.salary_is_predicted === true,
    created,
    contractTime: r.contract_time === 'full_time' || r.contract_time === 'part_time' ? r.contract_time : null,
    contractType: r.contract_type === 'permanent' || r.contract_type === 'contract' ? r.contract_type : null,
    remote: null,
    visaSponsorship: null,
    tags: [],
    url,
  };
};

export const adzunaProvider: JobProvider = {
  info: { id: 'adzuna', name: 'Adzuna', url: 'https://www.adzuna.de' },
  enabled: (env = process.env) => !!keys(env) && isOn(env.ADZUNA_ENABLED),
  search: async (q) => {
    const cfg = keys(process.env);
    if (!cfg || !isOn(process.env.ADZUNA_ENABLED)) return { items: [], total: 0, pages: 1 };
    if (q.remote || q.visa) return { items: [], total: 0, pages: 1 };
    return cache.get(queryKey(q), async () => {
      if (!budget.take()) throw new UpstreamError('UPSTREAM_BUSY', 'own call budget reached');
      try {
        const body = (await fetchJson(`${ADZUNA_BASE}/${q.page}?${adzunaParams(q, cfg).toString()}`)) as { results?: unknown; count?: unknown } | null;
        const items = (Array.isArray(body?.results) ? body.results : []).map(normalizeAdzuna).filter((x): x is GermanyJob => !!x);
        const total = typeof body?.count === 'number' && body.count >= 0 ? Math.floor(body.count) : items.length;
        lastFetchAt = Date.now();
        lastError = null;
        return { items, total, pages: Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / PAGE_SIZE))) };
      } catch (err) {
        lastError = (err as Error).message;
        throw err;
      }
    });
  },
  status: (env = process.env) => {
    const configured = !!keys(env);
    const enabled = adzunaProvider.enabled(env);
    return {
      id: 'adzuna',
      name: 'Adzuna',
      configured,
      enabled,
      note: enabled ? null : configured ? 'ADZUNA_ENABLED=1 (paid plan needed)' : 'ADZUNA_APP_ID + ADZUNA_APP_KEY + ADZUNA_ENABLED=1',
      lastFetchAt: lastFetchAt ? new Date(lastFetchAt).toISOString() : null,
      lastError,
    };
  },
  reset: () => {
    cache.clear();
    budget.reset();
    lastFetchAt = null;
    lastError = null;
  },
};
