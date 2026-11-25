import { prisma } from '../db.js';
import {
  API,
  GscError,
  SCOPE_WRITE,
  accessToken,
  buildOpportunities,
  errorText,
  gscConfig,
  isoDay,
  query,
  siteOrigin,
  toRow,
  type GscConfig,
  type GscOpportunities,
  type GscRow,
} from './searchConsole.js';

/**
 * Search Console extras for Admin → Search performance (/admin/search-performance), same credentials as
 * lib/searchConsole.ts:
 *  - explore: the report for a chosen period / country / device (totals + previous period, days, queries,
 *    pages, opportunities), cached 1 h per filter combination;
 *  - keyword tracker: target keywords staff add; each day (job `search-keywords`) clicks, impressions and
 *    average position per keyword are stored (SearchKeywordDay), so the history outlives Google's 16 months;
 *  - sitemaps: list with last status and "submit" (needs the write scope = Full permission in Search Console).
 */

type Cfg = Extract<GscConfig, { configured: true }>;

/* ───────────────────────────────────── Filters ───────────────────────────────────── */

export const EXPLORE_DAYS = [7, 28, 90, 180] as const;
export const DEVICES = ['DESKTOP', 'MOBILE', 'TABLET'] as const;
/** Countries offered in the filter (ISO alpha-2 as shown to staff → alpha-3 lower case as the API wants it). */
export const COUNTRIES: Record<string, string> = {
  AZ: 'aze',
  DE: 'deu',
  RU: 'rus',
  TR: 'tur',
  UA: 'ukr',
  GE: 'geo',
  KZ: 'kaz',
  UZ: 'uzb',
  AT: 'aut',
  CH: 'che',
  US: 'usa',
  GB: 'gbr',
};
/** Search Console keeps 16 months of data. */
const MAX_RANGE_DAYS = 480;
const DAY_MS = 24 * 60 * 60 * 1000;
export const EXPLORE_CACHE_MS = 60 * 60 * 1000;

export interface ExploreInput {
  days?: number;
  from?: string;
  to?: string;
  country?: string;
  device?: string;
}

export interface ExploreFilter {
  startDate: string;
  endDate: string;
  /** Alpha-3 lower case, or null (all). */
  country: string | null;
  device: (typeof DEVICES)[number] | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const parseDay = (v: string) => (DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? new Date(`${v}T00:00:00Z`) : null);

/** Validates the filters; the period ends yesterday unless "from/to" are given (then capped to 16 months). */
export const normalizeExplore = (input: ExploreInput, now = new Date()): ExploreFilter | null => {
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  let start: Date;
  let end: Date = yesterday;
  if (input.from || input.to) {
    const f = input.from ? parseDay(input.from) : null;
    const t = input.to ? parseDay(input.to) : yesterday;
    if (!f || !t || f > t) return null;
    start = f;
    end = t > yesterday ? yesterday : t;
    if (start > end) return null;
    if ((end.getTime() - start.getTime()) / DAY_MS + 1 > MAX_RANGE_DAYS) return null;
  } else {
    const days = input.days ?? 28;
    if (!(EXPLORE_DAYS as readonly number[]).includes(days)) return null;
    start = new Date(end.getTime() - (days - 1) * DAY_MS);
  }
  let country: string | null = null;
  if (input.country) {
    country = COUNTRIES[input.country.toUpperCase()] ?? null;
    if (!country) return null;
  }
  let device: ExploreFilter['device'] = null;
  if (input.device) {
    device = (DEVICES as readonly string[]).includes(input.device.toUpperCase()) ? (input.device.toUpperCase() as ExploreFilter['device']) : null;
    if (!device) return null;
  }
  return { startDate: isoDay(start), endDate: isoDay(end), country, device };
};

/** The period right before the chosen one, of the same length (for the trend arrows). */
export const previousRange = (f: Pick<ExploreFilter, 'startDate' | 'endDate'>) => {
  const start = Date.parse(`${f.startDate}T00:00:00Z`);
  const len = Math.round((Date.parse(`${f.endDate}T00:00:00Z`) - start) / DAY_MS) + 1;
  return { startDate: isoDay(new Date(start - len * DAY_MS)), endDate: isoDay(new Date(start - DAY_MS)) };
};

/** Search Analytics request filter (dimensionFilterGroups) for country / device / one exact query. */
export const filterGroups = (f: { country?: string | null; device?: string | null; query?: string | null }) => {
  const filters = [
    ...(f.country ? [{ dimension: 'country', operator: 'equals', expression: f.country }] : []),
    ...(f.device ? [{ dimension: 'device', operator: 'equals', expression: f.device }] : []),
    ...(f.query ? [{ dimension: 'query', operator: 'equals', expression: f.query }] : []),
  ];
  return filters.length ? { dimensionFilterGroups: [{ groupType: 'and', filters }] } : {};
};

/* ───────────────────────────────────── Explore ───────────────────────────────────── */

export interface ExploreReport {
  filter: ExploreFilter;
  totals: Omit<GscRow, 'key'>;
  previous: Omit<GscRow, 'key'> | null;
  days: GscRow[];
  queries: GscRow[];
  pages: GscRow[];
  opportunities: GscOpportunities;
  fetchedAt: string;
}

const ROWS_SHOWN = 50;
const ROWS_FETCHED = 250;

const strip = ({ key: _k, ...rest }: GscRow) => rest;

export const fetchExplore = async (cfg: Cfg, filter: ExploreFilter, now = new Date()): Promise<ExploreReport> => {
  const access = await accessToken(cfg.account);
  const groups = filterGroups(filter);
  const base = { startDate: filter.startDate, endDate: filter.endDate, type: 'web', dataState: 'final', ...groups };
  const prev = previousRange(filter);
  const [totals, previous, days, queryRows, pageRows, queryPageRows] = await Promise.all([
    query(cfg, access, base),
    query(cfg, access, { ...base, ...prev }),
    query(cfg, access, { ...base, dimensions: ['date'], rowLimit: MAX_RANGE_DAYS + 5 }),
    query(cfg, access, { ...base, dimensions: ['query'], rowLimit: ROWS_FETCHED }),
    query(cfg, access, { ...base, dimensions: ['page'], rowLimit: ROWS_FETCHED }),
    query(cfg, access, { ...base, dimensions: ['query', 'page'], rowLimit: 500 }),
  ]);
  const queries = queryRows.map(toRow);
  const pages = pageRows.map(toRow);
  return {
    filter,
    totals: strip(toRow(totals[0] ?? {})),
    previous: previous[0] ? strip(toRow(previous[0])) : null,
    days: days.map(toRow).sort((a, b) => a.key.localeCompare(b.key)),
    queries: queries.slice(0, ROWS_SHOWN),
    pages: pages.slice(0, ROWS_SHOWN),
    opportunities: buildOpportunities(
      queries,
      pages,
      queryPageRows.map((r) => ({ query: r.keys?.[0] ?? '', page: r.keys?.[1] ?? '', impressions: r.impressions ?? 0 })),
    ),
    fetchedAt: now.toISOString(),
  };
};

const exploreCache = new Map<string, { at: number; report: ExploreReport }>();
const EXPLORE_CACHE_MAX = 40;

export type ExploreResult =
  | { configured: false; reason: string; siteUrl: string | null; serviceAccountEmail: string | null }
  | { configured: true; siteUrl: string; serviceAccountEmail: string; report: ExploreReport | null; error: { code: string; message: string } | null; cached: boolean };

export const errorOf = (err: unknown) => {
  const e = err instanceof GscError ? err : new GscError('API_ERROR', 'request failed');
  // Only the code and Google's message — never the key, the assertion or the token.
  console.warn(`[search-console] ${e.code}: ${e.message}`);
  return { code: e.code, message: e.message };
};

/** `refresh` refetches when the cached report is older than 10 minutes. */
export const exploreSearch = async (input: ExploreInput, { now = new Date(), refresh = false } = {}): Promise<ExploreResult | 'INVALID_FILTER'> => {
  const cfg = gscConfig();
  if (!cfg.configured) return { configured: false, reason: cfg.reason, siteUrl: cfg.siteUrl, serviceAccountEmail: cfg.serviceAccountEmail };
  const filter = normalizeExplore(input, now);
  if (!filter) return 'INVALID_FILTER';
  const base = { configured: true as const, siteUrl: cfg.siteUrl, serviceAccountEmail: cfg.account.client_email };
  const key = `${cfg.siteUrl}|${filter.startDate}|${filter.endDate}|${filter.country}|${filter.device}`;
  const hit = exploreCache.get(key);
  if (hit && now.getTime() - hit.at < (refresh ? 10 * 60 * 1000 : EXPLORE_CACHE_MS)) return { ...base, report: hit.report, error: null, cached: true };
  try {
    const report = await fetchExplore(cfg, filter, now);
    if (exploreCache.size >= EXPLORE_CACHE_MAX) exploreCache.delete(exploreCache.keys().next().value as string);
    exploreCache.set(key, { at: now.getTime(), report });
    return { ...base, report, error: null, cached: false };
  } catch (err) {
    return { ...base, report: hit?.report ?? null, error: errorOf(err), cached: !!hit };
  }
};

/* ───────────────────────────────────── Keyword tracker ───────────────────────────────────── */

export const MAX_KEYWORDS = 50;
const KEYWORD_HISTORY_DAYS = 90;

/** Trimmed, single-spaced, lower case (Search Console lower-cases queries); 2–200 characters. */
export const normalizeKeyword = (text: string) => {
  const k = text.replace(/\s+/g, ' ').trim().toLowerCase();
  return k.length >= 2 && k.length <= 200 ? k : null;
};

export interface KeywordDay {
  day: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface KeywordSummary {
  clicks: number;
  impressions: number;
  /** Impression-weighted average position, 0 = no impressions. */
  position: number;
}

/** Totals of a slice of days; position weighted by impressions (what Search Console does). */
export const summarizeDays = (days: KeywordDay[]): KeywordSummary => {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const d of days) {
    clicks += d.clicks;
    impressions += d.impressions;
    weighted += d.position * d.impressions;
  }
  return { clicks, impressions, position: impressions ? Math.round((weighted / impressions) * 10) / 10 : 0 };
};

export interface KeywordTrend {
  current: KeywordSummary;
  previous: KeywordSummary;
  /** Positive = moved up (smaller position number); null when one of the periods has no impressions. */
  positionChange: number | null;
}

/** Last 28 days against the 28 days before (ending at `end`). */
export const keywordTrend = (days: KeywordDay[], end: string): KeywordTrend => {
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const at = (d: KeywordDay) => Math.floor((endMs - Date.parse(`${d.day}T00:00:00Z`)) / DAY_MS);
  const current = summarizeDays(days.filter((d) => at(d) >= 0 && at(d) < 28));
  const previous = summarizeDays(days.filter((d) => at(d) >= 28 && at(d) < 56));
  const positionChange = current.impressions && previous.impressions ? Math.round((previous.position - current.position) * 10) / 10 : null;
  return { current, previous, positionChange };
};

const toDay = (key: string) => new Date(`${key}T00:00:00Z`);

/** Loads the last 90 days of one keyword from Search Analytics and stores them (replaces the range). */
export const syncKeyword = async (cfg: Cfg, access: string, kw: { id: string; keyword: string; country: string }, now = new Date()) => {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end.getTime() - (KEYWORD_HISTORY_DAYS - 1) * DAY_MS);
  const rows = await query(cfg, access, {
    startDate: isoDay(start),
    endDate: isoDay(end),
    dimensions: ['date'],
    type: 'web',
    dataState: 'final',
    rowLimit: KEYWORD_HISTORY_DAYS + 5,
    ...filterGroups({ country: kw.country || null, query: kw.keyword }),
  });
  const data = rows
    .map(toRow)
    .filter((r) => DATE_RE.test(r.key))
    .map((r) => ({ keywordId: kw.id, day: toDay(r.key), clicks: r.clicks, impressions: r.impressions, position: r.position }));
  await prisma.$transaction([
    prisma.searchKeywordDay.deleteMany({ where: { keywordId: kw.id, day: { gte: start, lte: end } } }),
    ...(data.length ? [prisma.searchKeywordDay.createMany({ data })] : []),
    prisma.searchKeyword.update({ where: { id: kw.id }, data: { lastSyncedAt: now } }),
  ]);
  return data.length;
};

/** Daily job + manual refresh: every tracked keyword (failures of one do not stop the others). */
export const syncAllKeywords = async (now = new Date()) => {
  const cfg = gscConfig();
  if (!cfg.configured) return { synced: 0, failed: 0, configured: false };
  const list = await prisma.searchKeyword.findMany({ orderBy: { createdAt: 'asc' }, take: MAX_KEYWORDS });
  if (!list.length) return { synced: 0, failed: 0, configured: true };
  const access = await accessToken(cfg.account);
  let synced = 0;
  let failed = 0;
  for (const kw of list) {
    try {
      await syncKeyword(cfg, access, kw, now);
      synced++;
    } catch (err) {
      failed++;
      errorOf(err);
    }
  }
  return { synced, failed, configured: true };
};

export interface TrackedKeyword {
  id: string;
  keyword: string;
  /** ISO alpha-2 of the country filter, '' = all. */
  country: string;
  lastSyncedAt: string | null;
  trend: KeywordTrend;
  days: KeywordDay[];
}

const alpha2 = (a3: string) => Object.entries(COUNTRIES).find(([, v]) => v === a3)?.[0] ?? '';

export const listKeywords = async (now = new Date()): Promise<TrackedKeyword[]> => {
  const end = isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)));
  const since = new Date(Date.parse(`${end}T00:00:00Z`) - (KEYWORD_HISTORY_DAYS - 1) * DAY_MS);
  const [keywords, days] = await Promise.all([
    prisma.searchKeyword.findMany({ orderBy: { createdAt: 'asc' }, take: MAX_KEYWORDS }),
    prisma.searchKeywordDay.findMany({ where: { day: { gte: since } }, orderBy: { day: 'asc' } }),
  ]);
  const byKeyword = new Map<string, KeywordDay[]>();
  for (const d of days) {
    const list = byKeyword.get(d.keywordId) ?? [];
    list.push({ day: isoDay(d.day), clicks: d.clicks, impressions: d.impressions, position: Math.round(d.position * 10) / 10 });
    byKeyword.set(d.keywordId, list);
  }
  return keywords.map((k) => {
    const list = byKeyword.get(k.id) ?? [];
    return { id: k.id, keyword: k.keyword, country: alpha2(k.country), lastSyncedAt: k.lastSyncedAt?.toISOString() ?? null, trend: keywordTrend(list, end), days: list };
  });
};

export type AddKeywordResult = { ok: true; id: string; synced: boolean } | { ok: false; code: 'INVALID_KEYWORD' | 'INVALID_COUNTRY' | 'KEYWORD_LIMIT' | 'KEYWORD_EXISTS' };

/** Adds a keyword and loads its history right away when credentials exist (failure: it is filled by the daily job). */
export const addKeyword = async (text: string, countryCode: string | undefined, userId: string): Promise<AddKeywordResult> => {
  const keyword = normalizeKeyword(text);
  if (!keyword) return { ok: false, code: 'INVALID_KEYWORD' };
  let country = '';
  if (countryCode) {
    country = COUNTRIES[countryCode.toUpperCase()] ?? '';
    if (!country) return { ok: false, code: 'INVALID_COUNTRY' };
  }
  if ((await prisma.searchKeyword.count()) >= MAX_KEYWORDS) return { ok: false, code: 'KEYWORD_LIMIT' };
  if (await prisma.searchKeyword.findUnique({ where: { keyword_country: { keyword, country } } })) return { ok: false, code: 'KEYWORD_EXISTS' };
  const row = await prisma.searchKeyword.create({ data: { keyword, country, createdById: userId } });
  let synced = false;
  const cfg = gscConfig();
  if (cfg.configured) {
    try {
      await syncKeyword(cfg, await accessToken(cfg.account), row);
      synced = true;
    } catch (err) {
      errorOf(err);
    }
  }
  return { ok: true, id: row.id, synced };
};

export const removeKeyword = async (id: string) => {
  const row = await prisma.searchKeyword.findUnique({ where: { id } });
  if (!row) return false;
  await prisma.$transaction([prisma.searchKeywordDay.deleteMany({ where: { keywordId: id } }), prisma.searchKeyword.delete({ where: { id } })]);
  return true;
};

/* ───────────────────────────────────── Sitemaps ───────────────────────────────────── */

export interface SitemapInfo {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  isSitemapsIndex: boolean;
  errors: number;
  warnings: number;
  /** Submitted vs. indexed URLs per type when Google reports them. */
  contents: { type: string; submitted: number; indexed: number }[];
}

const num = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? Number(v) || 0 : 0);

/** sitemaps.list response → plain rows. */
export const mapSitemaps = (body: unknown): SitemapInfo[] => {
  const list = (body as { sitemap?: Record<string, unknown>[] } | null)?.sitemap ?? [];
  return list.map((s) => ({
    path: String(s.path ?? ''),
    lastSubmitted: typeof s.lastSubmitted === 'string' ? s.lastSubmitted : null,
    lastDownloaded: typeof s.lastDownloaded === 'string' ? s.lastDownloaded : null,
    isPending: s.isPending === true,
    isSitemapsIndex: s.isSitemapsIndex === true,
    errors: num(s.errors),
    warnings: num(s.warnings),
    contents: Array.isArray(s.contents)
      ? (s.contents as Record<string, unknown>[]).map((c) => ({ type: String(c.type ?? ''), submitted: num(c.submitted), indexed: num(c.indexed) }))
      : [],
  }));
};

/** The sitemap staff submit: the site's own /sitemap.xml. */
export const sitemapUrl = (siteUrl: string) => `${siteOrigin(siteUrl)}/sitemap.xml`;

export type SitemapsResult =
  | { configured: false; reason: string; siteUrl: string | null; serviceAccountEmail: string | null }
  | { configured: true; siteUrl: string; sitemapUrl: string; sitemaps: SitemapInfo[]; error: { code: string; message: string } | null };

export const listSitemaps = async (): Promise<SitemapsResult> => {
  const cfg = gscConfig();
  if (!cfg.configured) return { configured: false, reason: cfg.reason, siteUrl: cfg.siteUrl, serviceAccountEmail: cfg.serviceAccountEmail };
  const base = { configured: true as const, siteUrl: cfg.siteUrl, sitemapUrl: sitemapUrl(cfg.siteUrl) };
  try {
    const res = await fetch(`${API}/sites/${encodeURIComponent(cfg.siteUrl)}/sitemaps`, {
      headers: { Authorization: `Bearer ${await accessToken(cfg.account)}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 403) throw new GscError('NO_ACCESS', await errorText(res));
    if (!res.ok) throw new GscError('API_ERROR', await errorText(res));
    return { ...base, sitemaps: mapSitemaps(await res.json()), error: null };
  } catch (err) {
    return { ...base, sitemaps: [], error: errorOf(err) };
  }
};

let lastSubmitAt = 0;
export const SUBMIT_COOLDOWN_MS = 60 * 1000;

export type SubmitResult = { ok: true; sitemapUrl: string } | { ok: false; code: 'NOT_CONFIGURED' | 'RATE_LIMITED' | 'NO_ACCESS' | 'AUTH_FAILED' | 'API_ERROR'; message?: string };

/** Submits /sitemap.xml (scope webmasters: the service account needs "Full" permission). One submit per minute. */
export const submitSitemap = async (now = Date.now()): Promise<SubmitResult> => {
  const cfg = gscConfig();
  if (!cfg.configured) return { ok: false, code: 'NOT_CONFIGURED' };
  if (now - lastSubmitAt < SUBMIT_COOLDOWN_MS) return { ok: false, code: 'RATE_LIMITED' };
  lastSubmitAt = now;
  const url = sitemapUrl(cfg.siteUrl);
  try {
    const access = await accessToken(cfg.account, SCOPE_WRITE);
    const res = await fetch(`${API}/sites/${encodeURIComponent(cfg.siteUrl)}/sitemaps/${encodeURIComponent(url)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${access}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 403) throw new GscError('NO_ACCESS', await errorText(res));
    if (!res.ok) throw new GscError('API_ERROR', await errorText(res));
    return { ok: true, sitemapUrl: url };
  } catch (err) {
    const e = errorOf(err);
    return { ok: false, code: e.code as 'NO_ACCESS' | 'AUTH_FAILED' | 'API_ERROR', message: e.message };
  }
};

export const resetTrackerCache = () => {
  exploreCache.clear();
  lastSubmitAt = 0;
};
