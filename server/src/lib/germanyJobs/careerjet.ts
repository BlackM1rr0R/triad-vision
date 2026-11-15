import crypto from 'node:crypto';
import { isIP } from 'node:net';
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
  type SearchContext,
  type SearchQuery,
} from './common.js';
import { prisma } from '../../db.js';

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

/**
 * Careerjet rejects calls without a real public user_ip ("Invalid user_ip" for 0.0.0.0). Calls without a visitor
 * (e-mail alerts) and visitors with a private / missing address send the server's own public IP instead
 * (CAREERJET_SERVER_IP, the address whitelisted in the Careerjet panel).
 */
const isPublicIp = (ip: string | null | undefined): ip is string =>
  !!ip && isIP(ip) !== 0 && !/^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i.test(ip);
export const careerjetUserIp = (ip: string | null | undefined, env = process.env) => (isPublicIp(ip) ? ip : env.CAREERJET_SERVER_IP || ip || '');

/** One API call (no cache, no budget: the callers decide). */
const callCareerjet = async (key: string, q: SearchQuery, ctx: SearchContext): Promise<ProviderPage> => {
  try {
    const body = (await fetchJson(`${CAREERJET_URL}?${careerjetParams(q, { ip: careerjetUserIp(ctx.ip), userAgent: ctx.userAgent ?? 'Mozilla/5.0' }).toString()}`, {
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
      return callCareerjet(key, q, ctx);
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

// ─── Job alerts: a separate, strict daily budget ─────────────────────

/**
 * Germany job alerts (lib/germanyJobs/alerts.ts) may call Careerjet only within their own daily budget
 * (CAREERJET_ALERT_CALLS_PER_DAY, default 100; 0 = alerts never call Careerjet), kept apart from the visitors'
 * budget and persisted (Setting row), so a restart does not hand out a fresh budget. A fresh entry of the shared
 * 30-minute search cache costs nothing. Identical alert queries are grouped by the caller (one call serves all).
 */
export const ALERT_BUDGET_KEY = 'germanyJobAlerts.careerjetBudget';
export const alertCallsPerDay = (env: NodeJS.ProcessEnv = process.env) => {
  const raw = env.CAREERJET_ALERT_CALLS_PER_DAY;
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : 100;
};

const utcDay = (now: Date) => now.toISOString().slice(0, 10);

export const careerjetAlertBudget = async (now = new Date()) => {
  const row = await prisma.setting.findUnique({ where: { key: ALERT_BUDGET_KEY } });
  const v = (row?.value ?? null) as { day?: string; used?: number } | null;
  const used = v?.day === utcDay(now) && typeof v.used === 'number' ? v.used : 0;
  return { day: utcDay(now), used, limit: alertCallsPerDay() };
};

/** Takes one call of today's alert budget; false when it is used up. */
const takeAlertCall = async (now: Date) => {
  const b = await careerjetAlertBudget(now);
  if (b.used >= b.limit) return false;
  const value = { day: b.day, used: b.used + 1 };
  await prisma.setting.upsert({ where: { key: ALERT_BUDGET_KEY }, create: { key: ALERT_BUDGET_KEY, value }, update: { value } });
  return true;
};

export type AlertSearchStatus = 'off' | 'unsupported' | 'cache' | 'called' | 'budget' | 'error';

/** Newest Careerjet listings of an alert query (page 1, by date). Never throws. */
export const careerjetAlertSearch = async (q: SearchQuery, now = new Date()): Promise<{ items: GermanyJob[]; status: AlertSearchStatus }> => {
  const key = keyOf(process.env);
  if (!key) return { items: [], status: 'off' };
  if (q.remote || q.visa) return { items: [], status: 'unsupported' }; // not known for these listings (as in a search)
  const query: SearchQuery = { ...q, sort: 'date', page: 1 };
  const ck = queryKey(query);
  const hit = cache.peek(ck);
  if (hit) return { items: hit.items, status: 'cache' };
  if (!(await takeAlertCall(now))) return { items: [], status: 'budget' };
  try {
    // No visitor triggered this call: neutral values for the required user_ip / user_agent.
    const page = await cache.get(ck, () => callCareerjet(key, query, { ip: null, userAgent: null }));
    return { items: page.items, status: 'called' };
  } catch (err) {
    console.error('[germany-job-alerts] careerjet failed', (err as Error).message);
    return { items: [], status: 'error' };
  }
};
