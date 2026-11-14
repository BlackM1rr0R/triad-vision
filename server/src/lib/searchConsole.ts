import crypto from 'node:crypto';

/**
 * Google Search Console performance for the admin panel (Admin → Sayt → Axtarış nəticələri, /admin/search-performance).
 *
 * Configuration (environment, never stored in the database):
 *   GSC_SERVICE_ACCOUNT_JSON  the service account key file (JSON, as is or base64-encoded)
 *   GSC_SITE_URL              the Search Console property: "sc-domain:triad-vision.de" (domain property) or
 *                             "https://triad-vision.de/" (URL-prefix property)
 * The service account's e-mail must be added as a user of the property (Search Console → Settings → Users and
 * permissions → Add user, permission "Restricted" is enough). No Google library: the service account signs a JWT
 * (RS256) that is exchanged for an access token (scope webmasters.readonly), then the Search Analytics API is
 * queried for the last 28 days: totals, top queries, top pages, clicks per day and query+page pairs (5 requests).
 * From these rows the "opportunities" are computed (pure functions below): striking distance (position 4–20),
 * low CTR against an expected-CTR-by-position curve, a per-language breakdown and duplicate-looking URLs.
 * The URL Inspection API (same token) checks the index status of a fixed list of key pages per language on
 * demand (urlInspection, cached 24 h).
 *
 * Results are cached in memory for 6 hours (the API data changes once a day). The private key and the access
 * token never leave this module: they are not logged, not returned and not included in error messages.
 */

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const API = 'https://searchconsole.googleapis.com/webmasters/v3';
const INSPECT_API = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
export const GSC_CACHE_MS = 6 * 60 * 60 * 1000;
const RANGE_DAYS = 28;
/** Rows shown in the top-queries / top-pages tables. */
const ROW_LIMIT = 50;
/** Rows fetched for the opportunity analysis (one request each, the tables show the first ROW_LIMIT). */
const ANALYSIS_ROW_LIMIT = 250;
const QUERY_PAGE_ROW_LIMIT = 500;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export type GscConfig =
  | { configured: true; siteUrl: string; account: ServiceAccount }
  | { configured: false; siteUrl: string | null; reason: 'MISSING_CREDENTIALS' | 'MISSING_SITE' | 'INVALID_CREDENTIALS'; serviceAccountEmail: string | null };

/** Reads the configuration from the environment (each call: tests and a restart-free key rotation). */
export const gscConfig = (env: NodeJS.ProcessEnv = process.env): GscConfig => {
  const siteUrl = env.GSC_SITE_URL?.trim() || null;
  const raw = env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return { configured: false, siteUrl, reason: 'MISSING_CREDENTIALS', serviceAccountEmail: null };
  let account: Partial<ServiceAccount> | null = null;
  for (const text of [raw, Buffer.from(raw, 'base64').toString('utf8')]) {
    try {
      const parsed = JSON.parse(text) as Partial<ServiceAccount>;
      if (parsed && typeof parsed === 'object') {
        account = parsed;
        break;
      }
    } catch {
      /* try the next form */
    }
  }
  const email = typeof account?.client_email === 'string' ? account.client_email : null;
  if (!account || !email || typeof account.private_key !== 'string' || !account.private_key.includes('PRIVATE KEY')) {
    return { configured: false, siteUrl, reason: 'INVALID_CREDENTIALS', serviceAccountEmail: email };
  }
  if (!siteUrl) return { configured: false, siteUrl, reason: 'MISSING_SITE', serviceAccountEmail: email };
  return { configured: true, siteUrl, account: { client_email: email, private_key: account.private_key, token_uri: account.token_uri } };
};

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/** The signed JWT assertion of the service account (RFC 7523). */
export const signAssertion = (account: ServiceAccount, now = Date.now()) => {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: account.token_uri || TOKEN_URI, iat, exp: iat + 3600 }));
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.private_key, 'base64url');
  return `${header}.${claims}.${signature}`;
};

export class GscError extends Error {
  constructor(
    public code: 'AUTH_FAILED' | 'NO_ACCESS' | 'API_ERROR',
    message: string,
  ) {
    super(message);
  }
}

/** Google's error text without anything we sent (the assertion is never echoed back, but keep it short). */
const errorText = async (res: Response) => {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; error_description?: string };
    const msg = typeof body.error === 'object' ? body.error?.message : (body.error_description ?? body.error);
    return String(msg ?? res.statusText).slice(0, 300);
  } catch {
    return res.statusText;
  }
};

let token: { value: string; until: number; email: string } | null = null;

const accessToken = async (account: ServiceAccount) => {
  if (token && token.email === account.client_email && token.until > Date.now() + 60_000) return token.value;
  const res = await fetch(account.token_uri || TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signAssertion(account) }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GscError('AUTH_FAILED', await errorText(res));
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new GscError('AUTH_FAILED', 'no access token');
  token = { value: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000, email: account.client_email };
  return token.value;
};

export interface GscRow {
  key: string;
  clicks: number;
  impressions: number;
  /** 0..1 */
  ctr: number;
  position: number;
}

export interface GscReport {
  siteUrl: string;
  startDate: string;
  endDate: string;
  totals: Omit<GscRow, 'key'>;
  queries: GscRow[];
  pages: GscRow[];
  days: GscRow[];
  opportunities: GscOpportunities;
  fetchedAt: string;
}

/* ───────────────────────────── Opportunities (pure, computed from the report rows) ───────────────────────────── */

export const SITE_LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];
const PREFIXED_LOCALES: readonly string[] = SITE_LOCALES.filter((l) => l !== 'az');

/** Striking distance: average position in this range (page 1 bottom … page 2) with at least one impression. */
export const STRIKING_MIN_POSITION = 4;
export const STRIKING_MAX_POSITION = 20;
/** Low CTR: only rows with enough impressions (small site: 20) and at least this many clicks expected. */
export const LOW_CTR_MIN_IMPRESSIONS = 20;
export const LOW_CTR_MIN_EXPECTED_CLICKS = 1;
/** Low CTR: flagged when the CTR is below this share of the expected CTR at that position. */
export const LOW_CTR_RATIO = 0.5;
const OPPORTUNITY_LIMIT = 25;

/**
 * Rough organic CTR by average position (public CTR studies, rounded down for a small multilingual site).
 * Beyond position 20 a CTR is not meaningful (the problem is the ranking), so such rows are never "low CTR".
 */
const EXPECTED_CTR: [maxPosition: number, ctr: number][] = [
  [1.5, 0.28],
  [2.5, 0.15],
  [3.5, 0.1],
  [5.5, 0.06],
  [10.5, 0.03],
  [20.5, 0.01],
];

/** Expected CTR (0..1) at an average position, null beyond position 20. */
export const expectedCtr = (position: number): number | null => {
  if (!(position > 0)) return null;
  return EXPECTED_CTR.find(([max]) => position <= max)?.[1] ?? null;
};

export interface StrikingRow extends GscRow {
  /** Queries: the page with the most impressions for this query (query+page data), if known. */
  page: string | null;
}

/** Queries or pages at position 4–20 with impressions, most impressions first. */
export const strikingDistance = (rows: GscRow[], topPage: Map<string, string> = new Map(), limit = OPPORTUNITY_LIMIT): StrikingRow[] =>
  rows
    .filter((r) => r.impressions > 0 && r.position >= STRIKING_MIN_POSITION && r.position <= STRIKING_MAX_POSITION)
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position)
    .slice(0, limit)
    .map((r) => ({ ...r, page: topPage.get(r.key) ?? null }));

export interface LowCtrRow extends GscRow {
  kind: 'query' | 'page';
  expectedCtr: number;
  /** impressions × expected CTR − clicks (rounded to 0.1): the clicks a better title/snippet could win. */
  missedClicks: number;
}

/** Rows whose CTR is clearly below the expected CTR at their position, most missed clicks first. */
export const lowCtr = (rows: { kind: 'query' | 'page'; rows: GscRow[] }[], limit = OPPORTUNITY_LIMIT): LowCtrRow[] =>
  rows
    .flatMap(({ kind, rows: list }) =>
      list.flatMap((r) => {
        const exp = expectedCtr(r.position);
        if (exp === null || r.impressions < LOW_CTR_MIN_IMPRESSIONS || r.impressions * exp < LOW_CTR_MIN_EXPECTED_CLICKS) return [];
        const ctr = r.impressions ? r.clicks / r.impressions : 0;
        if (ctr >= exp * LOW_CTR_RATIO) return [];
        return [{ ...r, kind, expectedCtr: exp, missedClicks: round(r.impressions * exp - r.clicks, 1) }];
      }),
    )
    .sort((a, b) => b.missedClicks - a.missedClicks || b.impressions - a.impressions)
    .slice(0, limit);

export type DuplicateReason = 'http' | 'www' | 'lng' | 'query' | 'trailingSlash' | 'azPrefix' | 'alias';

/** Old alias routes the site 301s to the new path (deploy/Caddyfile). */
const ALIASES: Record<string, string> = { calculators: 'tools', workers: 'for-workers', candidates: 'for-workers', employers: 'for-employers' };

export interface CanonicalUrl {
  canonical: string;
  locale: SiteLocale;
  reasons: DuplicateReason[];
  /** Every reason is answered by a permanent redirect of the site (so Google should drop the URL over time). */
  redirected: boolean;
}

/**
 * The one clean URL a reported page URL should collapse into: https, no www, no query string, no trailing slash
 * (except the root), the language as a path prefix (az unprefixed): `/salary-calculator?lng=ru` →
 * `/ru/salary-calculator`, `?lng=az` and `/az/…` → unprefixed. The site 301s http, www, `/az/`, a trailing slash,
 * old aliases and every `?lng=` on public paths (deploy/Caddyfile @lnglegacy: on a prefixed path the prefix wins and
 * the parameter is dropped; an unknown value is dropped); other query strings are served as is (only the canonical
 * tag helps).
 */
export const canonicalPageUrl = (raw: string): CanonicalUrl | null => {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const reasons: DuplicateReason[] = [];
  let redirected = true;
  if (u.protocol === 'http:') reasons.push('http');
  let host = u.host.toLowerCase();
  if (host.startsWith('www.')) {
    reasons.push('www');
    host = host.slice(4);
  }
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) reasons.push('trailingSlash');
  const segments = u.pathname.split('/').filter(Boolean);
  if (segments[0]?.toLowerCase() === 'az') {
    reasons.push('azPrefix');
    segments.shift();
  }
  let locale: SiteLocale = 'az';
  const prefixed = !!segments[0] && PREFIXED_LOCALES.includes(segments[0].toLowerCase());
  if (prefixed) locale = segments.shift()!.toLowerCase() as SiteLocale;
  // Same rule as Caddy: case-insensitive, an optional region (ru-RU, de_DE); the path prefix wins over ?lng=.
  const lng = /^([a-z]{2})(?:[-_,].*)?$/.exec(u.searchParams.get('lng')?.toLowerCase() ?? '')?.[1];
  if (u.searchParams.has('lng')) {
    reasons.push('lng');
    if (!prefixed && lng && (SITE_LOCALES as readonly string[]).includes(lng)) locale = lng as SiteLocale;
  }
  if ([...u.searchParams.keys()].some((k) => k !== 'lng')) {
    reasons.push('query');
    redirected = false;
  }
  if (segments.length === 1 && ALIASES[segments[0]]) {
    reasons.push('alias');
    segments[0] = ALIASES[segments[0]];
  }
  const path = [...(locale === 'az' ? [] : [locale]), ...segments].join('/');
  return { canonical: `https://${host}/${path}`, locale, reasons, redirected: reasons.length > 0 && redirected };
};

export interface LocaleStats extends Omit<GscRow, 'key'> {
  locale: SiteLocale;
  pages: number;
}

/** Clicks, impressions, CTR and impression-weighted position per site language, from the page rows. */
export const localeBreakdown = (pages: GscRow[]): LocaleStats[] => {
  const acc = new Map<SiteLocale, { clicks: number; impressions: number; weighted: number; pages: number }>(
    SITE_LOCALES.map((l) => [l, { clicks: 0, impressions: 0, weighted: 0, pages: 0 }]),
  );
  for (const r of pages) {
    const c = canonicalPageUrl(r.key);
    if (!c) continue;
    const a = acc.get(c.locale)!;
    a.clicks += r.clicks;
    a.impressions += r.impressions;
    a.weighted += r.position * r.impressions;
    a.pages += 1;
  }
  return SITE_LOCALES.map((locale) => {
    const a = acc.get(locale)!;
    return {
      locale,
      clicks: a.clicks,
      impressions: a.impressions,
      ctr: a.impressions ? round(a.clicks / a.impressions, 4) : 0,
      position: a.impressions ? round(a.weighted / a.impressions, 1) : 0,
      pages: a.pages,
    };
  });
};

export interface DuplicateUrl extends GscRow {
  reasons: DuplicateReason[];
  redirected: boolean;
}

export interface DuplicateGroup {
  canonical: string;
  /** The clean URL's own row when Google reports it too. */
  canonicalRow: GscRow | null;
  urls: DuplicateUrl[];
  /** Impressions of the duplicate URLs (not the canonical). */
  impressions: number;
  clicks: number;
}

/** Page URLs that are a variant of a clean URL, grouped by that URL, most duplicate impressions first. */
export const duplicateUrls = (pages: GscRow[], limit = OPPORTUNITY_LIMIT): DuplicateGroup[] => {
  const byKey = new Map(pages.map((r) => [r.key, r]));
  const groups = new Map<string, DuplicateGroup>();
  for (const r of pages) {
    const c = canonicalPageUrl(r.key);
    if (!c || c.reasons.length === 0) continue;
    let g = groups.get(c.canonical);
    if (!g) {
      g = { canonical: c.canonical, canonicalRow: byKey.get(c.canonical) ?? null, urls: [], impressions: 0, clicks: 0 };
      groups.set(c.canonical, g);
    }
    g.urls.push({ ...r, reasons: c.reasons, redirected: c.redirected });
    g.impressions += r.impressions;
    g.clicks += r.clicks;
  }
  return [...groups.values()]
    .map((g) => ({ ...g, urls: g.urls.sort((a, b) => b.impressions - a.impressions) }))
    .sort((a, b) => b.impressions - a.impressions || a.canonical.localeCompare(b.canonical))
    .slice(0, limit);
};

export interface GscOpportunities {
  strikingQueries: StrikingRow[];
  strikingPages: StrikingRow[];
  lowCtr: LowCtrRow[];
  locales: LocaleStats[];
  duplicates: DuplicateGroup[];
}

interface QueryPageRow {
  query: string;
  page: string;
  impressions: number;
}

/** All opportunity sections from the (longer) query and page lists and the query+page rows. */
export const buildOpportunities = (queries: GscRow[], pages: GscRow[], queryPages: QueryPageRow[] = []): GscOpportunities => {
  const best = new Map<string, QueryPageRow>();
  for (const qp of queryPages) {
    const cur = best.get(qp.query);
    if (!cur || qp.impressions > cur.impressions) best.set(qp.query, qp);
  }
  const topPage = new Map([...best].map(([q, r]) => [q, r.page]));
  return {
    strikingQueries: strikingDistance(queries, topPage),
    strikingPages: strikingDistance(pages),
    lowCtr: lowCtr([
      { kind: 'query', rows: queries },
      { kind: 'page', rows: pages },
    ]),
    locales: localeBreakdown(pages),
    duplicates: duplicateUrls(pages),
  };
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The 28 days ending yesterday (UTC; Search Console data of today is still incomplete). */
export const reportRange = (now = new Date()) => {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end.getTime() - (RANGE_DAYS - 1) * 24 * 60 * 60 * 1000);
  return { startDate: isoDay(start), endDate: isoDay(end) };
};

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
const toRow = (r: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }): GscRow => ({
  key: r.keys?.[0] ?? '',
  clicks: r.clicks ?? 0,
  impressions: r.impressions ?? 0,
  ctr: round(r.ctr ?? 0, 4),
  position: round(r.position ?? 0, 1),
});

const query = async (cfg: Extract<GscConfig, { configured: true }>, access: string, body: Record<string, unknown>) => {
  const res = await fetch(`${API}/sites/${encodeURIComponent(cfg.siteUrl)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 403) throw new GscError('NO_ACCESS', await errorText(res));
  if (!res.ok) throw new GscError('API_ERROR', await errorText(res));
  return ((await res.json()) as { rows?: Parameters<typeof toRow>[0][] }).rows ?? [];
};

export const fetchGscReport = async (cfg: Extract<GscConfig, { configured: true }>, now = new Date()): Promise<GscReport> => {
  const access = await accessToken(cfg.account);
  const range = reportRange(now);
  const base = { ...range, type: 'web', dataState: 'final' };
  const [totals, queryRows, pageRows, days, queryPageRows] = await Promise.all([
    query(cfg, access, base),
    query(cfg, access, { ...base, dimensions: ['query'], rowLimit: ANALYSIS_ROW_LIMIT }),
    query(cfg, access, { ...base, dimensions: ['page'], rowLimit: ANALYSIS_ROW_LIMIT }),
    query(cfg, access, { ...base, dimensions: ['date'], rowLimit: RANGE_DAYS + 2 }),
    query(cfg, access, { ...base, dimensions: ['query', 'page'], rowLimit: QUERY_PAGE_ROW_LIMIT }),
  ]);
  const { key: _key, ...total } = toRow(totals[0] ?? {});
  const queries = queryRows.map(toRow);
  const pages = pageRows.map(toRow);
  const queryPages = queryPageRows.map((r) => ({ query: r.keys?.[0] ?? '', page: r.keys?.[1] ?? '', impressions: r.impressions ?? 0 }));
  return {
    siteUrl: cfg.siteUrl,
    ...range,
    totals: total,
    queries: queries.slice(0, ROW_LIMIT),
    pages: pages.slice(0, ROW_LIMIT),
    days: days.map(toRow).sort((a, b) => a.key.localeCompare(b.key)),
    opportunities: buildOpportunities(queries, pages, queryPages),
    fetchedAt: now.toISOString(),
  };
};

let cache: { at: number; site: string; report: GscReport } | null = null;
let inflight: Promise<GscReport> | null = null;

export type GscResult =
  | { configured: false; reason: string; siteUrl: string | null; serviceAccountEmail: string | null }
  | { configured: true; siteUrl: string; serviceAccountEmail: string; report: GscReport | null; error: { code: string; message: string } | null; cached: boolean };

/**
 * The admin page's data: the cached report (≤ 6 h old), or a fresh one. `refresh` refetches when the cached
 * report is older than 10 minutes (protects the API quota from repeated clicks).
 */
export const searchPerformance = async ({ refresh = false, now = new Date() } = {}): Promise<GscResult> => {
  const cfg = gscConfig();
  if (!cfg.configured) return { configured: false, reason: cfg.reason, siteUrl: cfg.siteUrl, serviceAccountEmail: cfg.serviceAccountEmail };
  const base = { configured: true as const, siteUrl: cfg.siteUrl, serviceAccountEmail: cfg.account.client_email };
  const age = cache && cache.site === cfg.siteUrl ? now.getTime() - cache.at : Infinity;
  if (cache && age < (refresh ? 10 * 60 * 1000 : GSC_CACHE_MS)) return { ...base, report: cache.report, error: null, cached: true };
  try {
    inflight ??= fetchGscReport(cfg, now).finally(() => {
      inflight = null;
    });
    const report = await inflight;
    cache = { at: now.getTime(), site: cfg.siteUrl, report };
    return { ...base, report, error: null, cached: false };
  } catch (err) {
    const e = err instanceof GscError ? err : new GscError('API_ERROR', 'request failed');
    // Only the error code and Google's message — never the key, the assertion or the token.
    console.warn(`[search-console] ${e.code}: ${e.message}`);
    return { ...base, report: cache?.site === cfg.siteUrl ? cache.report : null, error: { code: e.code, message: e.message }, cached: !!cache };
  }
};

/* ───────────────────────────── URL Inspection (index status of the key pages) ───────────────────────────── */

/** Inspection results are cached 24 h; `refresh` re-inspects only when they are older than 1 h (quota 2000/day). */
export const INSPECTION_CACHE_MS = 24 * 60 * 60 * 1000;
export const INSPECTION_REFRESH_MS = 60 * 60 * 1000;
/** A run where every URL failed is kept only briefly (a fixed permission should show up soon). */
const INSPECTION_FAILED_CACHE_MS = 10 * 60 * 1000;
/** Parallel inspect requests (quota 600/min; the list is 42 URLs). */
const INSPECTION_CONCURRENCY = 3;
/** The key pages inspected in every language (az at the root, the others under /de, /en, …). */
export const INSPECTION_PATHS = ['', '/jobs', '/salary-calculator', '/chancenkarte-calculator', '/blue-card-check', '/guides', '/cities'] as const;

/**
 * The public site origin: the URL-prefix property's origin, or for a domain property ("sc-domain:triad-vision.de")
 * CLIENT_URL when it is on that domain, else https://<domain>.
 */
export const siteOrigin = (siteUrl: string, clientUrl: string | undefined = process.env.CLIENT_URL): string => {
  if (siteUrl.startsWith('sc-domain:')) {
    const domain = siteUrl.slice('sc-domain:'.length).trim().toLowerCase();
    try {
      const c = clientUrl ? new URL(clientUrl) : null;
      if (c && (c.hostname === domain || c.hostname.endsWith(`.${domain}`))) return c.origin;
    } catch {
      /* fall through */
    }
    return `https://${domain}`;
  }
  return new URL(siteUrl).origin;
};

/** The inspected URLs: every key path in every language. */
export const inspectionTargets = (origin: string) =>
  SITE_LOCALES.flatMap((locale) =>
    INSPECTION_PATHS.map((path) => {
      const p = `${locale === 'az' ? '' : `/${locale}`}${path}`;
      return { locale, path: path || '/', url: `${origin}${p || '/'}` };
    }),
  );

export interface InspectionRow {
  url: string;
  locale: SiteLocale;
  path: string;
  /** PASS | PARTIAL | FAIL | NEUTRAL | VERDICT_UNSPECIFIED */
  verdict: string | null;
  /** Human-readable, e.g. "Submitted and indexed", "Crawled - currently not indexed". */
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  /** Google chose a canonical other than the inspected URL. */
  canonicalMismatch: boolean;
  /** Deep link into Search Console's inspection report. */
  link: string | null;
  error: { code: string; message: string } | null;
}

const sameUrl = (a: string, b: string) => {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return a === b;
  }
};

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** One URL's row from the index:inspect response body. */
export const parseInspection = (target: { url: string; locale: SiteLocale; path: string }, body: unknown): InspectionRow => {
  const result = (body as { inspectionResult?: { inspectionResultLink?: unknown; indexStatusResult?: Record<string, unknown> } } | null)?.inspectionResult;
  const s = result?.indexStatusResult ?? {};
  const googleCanonical = str(s.googleCanonical);
  return {
    ...target,
    verdict: str(s.verdict),
    coverageState: str(s.coverageState),
    indexingState: str(s.indexingState),
    robotsTxtState: str(s.robotsTxtState),
    pageFetchState: str(s.pageFetchState),
    lastCrawlTime: str(s.lastCrawlTime),
    googleCanonical,
    userCanonical: str(s.userCanonical),
    canonicalMismatch: !!googleCanonical && !sameUrl(googleCanonical, target.url),
    link: str(result?.inspectionResultLink),
    error: null,
  };
};

const emptyInspection = (target: { url: string; locale: SiteLocale; path: string }, error: InspectionRow['error']): InspectionRow => ({
  ...parseInspection(target, null),
  error,
});

const inspectOne = async (cfg: Extract<GscConfig, { configured: true }>, access: string, target: { url: string; locale: SiteLocale; path: string }) => {
  try {
    const res = await fetch(INSPECT_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: target.url, siteUrl: cfg.siteUrl }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return emptyInspection(target, { code: res.status === 403 ? 'NO_ACCESS' : res.status === 429 ? 'QUOTA' : 'API_ERROR', message: await errorText(res) });
    return parseInspection(target, await res.json());
  } catch (err) {
    // Only the error's name (TimeoutError, TypeError…): a message could quote the request.
    return emptyInspection(target, { code: 'API_ERROR', message: err instanceof Error ? err.name : 'request failed' });
  }
};

export interface InspectionReport {
  siteUrl: string;
  origin: string;
  rows: InspectionRow[];
  fetchedAt: string;
}

export const fetchInspection = async (cfg: Extract<GscConfig, { configured: true }>, now = new Date()): Promise<InspectionReport> => {
  const access = await accessToken(cfg.account);
  const origin = siteOrigin(cfg.siteUrl);
  const targets = inspectionTargets(origin);
  const rows: InspectionRow[] = new Array(targets.length);
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const i = next++;
      rows[i] = await inspectOne(cfg, access, targets[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(INSPECTION_CONCURRENCY, targets.length) }, worker));
  return { siteUrl: cfg.siteUrl, origin, rows, fetchedAt: now.toISOString() };
};

let inspectionCache: { at: number; ttl: number; site: string; report: InspectionReport } | null = null;
let inspectionInflight: Promise<InspectionReport> | null = null;

export type InspectionResult =
  | { configured: false; reason: string; siteUrl: string | null; serviceAccountEmail: string | null }
  | { configured: true; siteUrl: string; serviceAccountEmail: string; report: InspectionReport | null; error: { code: string; message: string } | null; cached: boolean };

/** The admin page's indexing check: cached ≤ 24 h, `refresh` re-inspects when the cached run is older than 1 h. */
export const urlInspection = async ({ refresh = false, now = new Date() } = {}): Promise<InspectionResult> => {
  const cfg = gscConfig();
  if (!cfg.configured) return { configured: false, reason: cfg.reason, siteUrl: cfg.siteUrl, serviceAccountEmail: cfg.serviceAccountEmail };
  const base = { configured: true as const, siteUrl: cfg.siteUrl, serviceAccountEmail: cfg.account.client_email };
  const c = inspectionCache && inspectionCache.site === cfg.siteUrl ? inspectionCache : null;
  const age = c ? now.getTime() - c.at : Infinity;
  if (c && age < (refresh ? Math.min(INSPECTION_REFRESH_MS, c.ttl) : c.ttl)) return { ...base, report: c.report, error: null, cached: true };
  try {
    inspectionInflight ??= fetchInspection(cfg, now).finally(() => {
      inspectionInflight = null;
    });
    const report = await inspectionInflight;
    const failed = report.rows.length > 0 && report.rows.every((r) => r.error);
    inspectionCache = { at: now.getTime(), ttl: failed ? INSPECTION_FAILED_CACHE_MS : INSPECTION_CACHE_MS, site: cfg.siteUrl, report };
    return { ...base, report, error: null, cached: false };
  } catch (err) {
    const e = err instanceof GscError ? err : new GscError('API_ERROR', 'request failed');
    console.warn(`[search-console] inspection ${e.code}: ${e.message}`);
    return { ...base, report: c?.report ?? null, error: { code: e.code, message: e.message }, cached: !!c };
  }
};

/** Tests: forget the cached report, inspection and token. */
export const resetSearchConsoleCache = () => {
  cache = null;
  token = null;
  inflight = null;
  inspectionCache = null;
  inspectionInflight = null;
};
