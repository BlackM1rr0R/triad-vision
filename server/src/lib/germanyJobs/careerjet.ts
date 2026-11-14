import crypto from 'node:crypto';
import { config } from '../../config.js';
import {
  CallBudget,
  PAGE_SIZE,
  QueryCache,
  UpstreamError,
  fetchJson,
  httpUrl,
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
 * Careerjet publisher API (https://www.careerjet.com/partners/api/, free, revenue share for publishers):
 * GET https://search.api.careerjet.net/v4/query, HTTP Basic auth with the API key as user name, locale de_DE.
 * Careerjet's partner pages invite publishers to "embed Careerjet's job search results on your site"; they state
 * no attribution text — we show "Jobs by Careerjet" (link to careerjet.de) per card and in the footer and link
 * out only through each job's `url` (Careerjet's tracking link).
 * `user_ip` and `user_agent` of the visitor are REQUIRED by the API ("the IP address of the user whose action(s)
 * triggered the API call"): passed server-side on that one call, never stored, logged or part of the cache key.
 * Responses are cached 30 min per query. Enabled when CAREERJET_API_KEY is set (the 32-hex key of the publisher panel →
 * "Access API"; no extra flag). The panel whitelists server IPs, so calls from elsewhere (local dev) answer 403: that
 * is reported as a provider error (status panel), the search still answers from the other sources.
 */

export const CAREERJET_URL = 'https://search.api.careerjet.net/v4/query';
const cache = new QueryCache<ProviderPage>(30 * 60 * 1000);
const budget = new CallBudget(() => ({ perMinute: positiveInt(process.env.CAREERJET_MAX_CALLS_PER_MINUTE, 30), perDay: positiveInt(process.env.CAREERJET_MAX_CALLS_PER_DAY, 2000) }));
let lastFetchAt: number | null = null;
let lastError: string | null = null;

const keyOf = (env: NodeJS.ProcessEnv) => (env.CAREERJET_API_KEY ?? '').trim();

const PERIOD: Record<string, GermanyJob['salaryPeriod']> = { Y: 'year', M: 'month', W: 'week', D: 'day', H: 'hour' };

export const normalizeCareerjet = (raw: unknown, i: number): GermanyJob | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = plainText(r.title, 300);
  const url = httpUrl(r.url);
  if (!title || !url) return null;
  const created = typeof r.date === 'string' && !Number.isNaN(Date.parse(r.date)) ? new Date(r.date).toISOString() : null;
  const min = positiveNumber(r.salary_min);
  const max = positiveNumber(r.salary_max);
  return {
    // No id in the response: the tracking URL identifies the listing.
    id: `careerjet:${crypto.createHash('sha1').update(url).digest('hex').slice(0, 20) || i}`,
    source: 'careerjet',
    title,
    company: plainText(r.company, 200) || null,
    location: plainText(r.locations, 200) || null,
    snippet: plainText(r.description, 300),
    salaryMin: min,
    salaryMax: max,
    salaryText: !min && !max ? plainText(r.salary, 80) || null : null,
    salaryPeriod: PERIOD[String(r.salary_type ?? '')] ?? null,
    salaryPredicted: false,
    created,
    contractTime: null,
    contractType: null,
    remote: null,
    visaSponsorship: null,
    tags: [],
    url,
  };
};

export const careerjetParams = (q: SearchQuery, ctx: { ip: string; userAgent: string }) => {
  const p = new URLSearchParams({ locale_code: 'de_DE', page: String(Math.min(q.page, 10)), page_size: String(PAGE_SIZE), user_ip: ctx.ip, user_agent: ctx.userAgent, fragment_size: '300' });
  const kw = keywordsFor(q);
  if (kw) p.set('keywords', kw);
  if (q.where) {
    p.set('location', q.where);
    if (q.radius) p.set('radius', String(q.radius));
  }
  if (q.time === 'full') p.set('work_hours', 'f');
  if (q.time === 'part') p.set('work_hours', 'p');
  if (q.sort === 'date') p.set('sort', 'date');
  return p;
};

export const careerjetProvider: JobProvider = {
  info: { id: 'careerjet', name: 'Careerjet', url: 'https://www.careerjet.de' },
  enabled: (env = process.env) => !!keyOf(env),
  search: async (q, ctx) => {
    const key = keyOf(process.env);
    if (!key) return { items: [], total: 0, pages: 1 };
    // Remote / visa sponsorship are not known for these listings.
    if (q.remote || q.visa || q.page > 10) return { items: [], total: 0, pages: 1 };
    return cache.get(queryKey(q), async () => {
      if (!budget.take()) throw new UpstreamError('UPSTREAM_BUSY', 'own call budget reached');
      try {
        const body = (await fetchJson(`${CAREERJET_URL}?${careerjetParams(q, { ip: ctx.ip ?? '0.0.0.0', userAgent: ctx.userAgent ?? 'Mozilla/5.0' }).toString()}`, {
          // Careerjet answers 403 "Undeclared referrer" without a Referer: the page the results are shown on.
          headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, Referer: `${config.clientUrl}/jobs/germany` },
        })) as { type?: unknown; jobs?: unknown; hits?: unknown; pages?: unknown } | null;
        const items = (Array.isArray(body?.jobs) ? body.jobs : []).map(normalizeCareerjet).filter((x): x is GermanyJob => !!x);
        lastFetchAt = Date.now();
        lastError = null;
        const total = typeof body?.hits === 'number' ? body.hits : items.length;
        return { items, total, pages: Math.min(10, Math.max(1, typeof body?.pages === 'number' ? body.pages : Math.ceil(total / PAGE_SIZE))) };
      } catch (err) {
        const msg = (err as Error).message;
        lastError = msg === 'HTTP 403' ? 'HTTP 403 (key invalid, this server IP is not whitelisted, or the Referer is not accepted in the Careerjet panel)' : msg;
        throw err;
      }
    });
  },
  status: (env = process.env) => {
    const configured = !!keyOf(env);
    return {
      id: 'careerjet',
      name: 'Careerjet',
      configured,
      enabled: configured,
      note: configured ? null : 'CAREERJET_API_KEY',
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
