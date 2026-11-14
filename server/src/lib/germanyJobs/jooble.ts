import {
  CallBudget,
  PAGE_SIZE,
  QueryCache,
  UpstreamError,
  fetchJson,
  httpUrl,
  isOn,
  keywordsFor,
  plainText,
  positiveInt,
  queryKey,
  type GermanyJob,
  type JobProvider,
  type ProviderPage,
  type SearchQuery,
} from './common.js';

/**
 * Jooble REST API (https://jooble.org/api/about; free key per country by form — the German key from
 * de.jooble.org/api/about): POST https://jooble.org/api/{key}, JSON body { keywords, location, radius, page,
 * ResultOnPage }. Free plan: 100 requests per day per key (our budget: JOOBLE_MAX_CALLS_PER_DAY, default 90).
 *
 * OFF unless JOOBLE_API_KEY is set AND JOOBLE_ENABLED=1: Jooble's terms (jooble.org/info/terms §4(i)) say "Our
 * Site content may not be copied for republication … without our prior express written permission" and do not
 * exempt the API, so written confirmation from Jooble is needed before switching it on (docs/GERMANY_JOBS.md).
 * Cached 30 min per query; links go out through each job's `link`.
 */

const cache = new QueryCache<ProviderPage>(30 * 60 * 1000);
const budget = new CallBudget(() => ({ perMinute: positiveInt(process.env.JOOBLE_MAX_CALLS_PER_MINUTE, 10), perDay: positiveInt(process.env.JOOBLE_MAX_CALLS_PER_DAY, 90) }));
let lastFetchAt: number | null = null;
let lastError: string | null = null;

/** Radius steps Jooble accepts (km). */
const JOOBLE_RADII = [0, 4, 8, 16, 26, 40, 80] as const;
export const joobleRadius = (km: number) => JOOBLE_RADII.reduce((best, r) => (Math.abs(r - km) < Math.abs(best - km) ? r : best), 0 as number);

const host = (env: NodeJS.ProcessEnv) => (env.JOOBLE_API_HOST?.trim() || 'https://jooble.org').replace(/\/+$/, '');
const configured = (env: NodeJS.ProcessEnv) => !!env.JOOBLE_API_KEY?.trim();

export const normalizeJooble = (raw: unknown): GermanyJob | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = r.id == null ? '' : String(r.id).slice(0, 40);
  const title = plainText(r.title, 300);
  const url = httpUrl(r.link);
  if (!id || !title || !url) return null;
  const salary = plainText(r.salary, 80);
  const type = String(r.type ?? '').toLowerCase();
  const created = typeof r.updated === 'string' && !Number.isNaN(Date.parse(r.updated)) ? new Date(r.updated).toISOString() : null;
  return {
    id: `jooble:${id}`,
    source: 'jooble',
    title,
    company: plainText(r.company, 200) || null,
    location: plainText(r.location, 200) || null,
    snippet: plainText(r.snippet, 300),
    salaryMin: null,
    salaryMax: null,
    salaryText: salary || null, // text only: Jooble gives no reliable period / currency
    salaryPeriod: null,
    salaryPredicted: false,
    created,
    contractTime: /vollzeit|full/.test(type) ? 'full_time' : /teilzeit|part/.test(type) ? 'part_time' : null,
    contractType: /unbefristet|permanent/.test(type) ? 'permanent' : /befristet|contract|temporary/.test(type) ? 'contract' : null,
    remote: null,
    visaSponsorship: null,
    tags: [],
    url,
  };
};

export const joobleBody = (q: SearchQuery) => ({
  keywords: keywordsFor(q),
  location: q.where,
  radius: String(joobleRadius(q.where ? q.radius : 0)),
  page: String(q.page),
  ResultOnPage: String(PAGE_SIZE),
});

export const joobleProvider: JobProvider = {
  info: { id: 'jooble', name: 'Jooble', url: 'https://de.jooble.org' },
  enabled: (env = process.env) => configured(env) && isOn(env.JOOBLE_ENABLED),
  search: async (q) => {
    const env = process.env;
    if (!joobleProvider.enabled(env)) return { items: [], total: 0, pages: 1 };
    if (q.remote || q.visa) return { items: [], total: 0, pages: 1 };
    return cache.get(queryKey(q), async () => {
      if (!budget.take()) throw new UpstreamError('UPSTREAM_BUSY', 'own call budget reached');
      try {
        const body = (await fetchJson(`${host(env)}/api/${encodeURIComponent(env.JOOBLE_API_KEY!.trim())}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(joobleBody(q)),
        })) as { totalCount?: unknown; jobs?: unknown } | null;
        let items = (Array.isArray(body?.jobs) ? body.jobs : []).map(normalizeJooble).filter((x): x is GermanyJob => !!x);
        if (q.time === 'full') items = items.filter((j) => j.contractTime !== 'part_time');
        if (q.time === 'part') items = items.filter((j) => j.contractTime !== 'full_time');
        lastFetchAt = Date.now();
        lastError = null;
        const total = typeof body?.totalCount === 'number' ? body.totalCount : items.length;
        return { items, total, pages: Math.min(20, Math.max(1, Math.ceil(total / PAGE_SIZE))) };
      } catch (err) {
        lastError = (err as Error).message;
        throw err;
      }
    });
  },
  status: (env = process.env) => {
    const c = configured(env);
    const enabled = joobleProvider.enabled(env);
    return {
      id: 'jooble',
      name: 'Jooble',
      configured: c,
      enabled,
      note: enabled ? null : !c ? 'JOOBLE_API_KEY + JOOBLE_ENABLED=1 (written permission from Jooble first)' : 'JOOBLE_ENABLED=1 (written permission from Jooble first)',
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
