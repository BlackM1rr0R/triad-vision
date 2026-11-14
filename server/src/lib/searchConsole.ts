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
 * queried for the last 28 days: totals, top queries, top pages and clicks per day.
 *
 * Results are cached in memory for 6 hours (the API data changes once a day). The private key and the access
 * token never leave this module: they are not logged, not returned and not included in error messages.
 */

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const API = 'https://searchconsole.googleapis.com/webmasters/v3';
export const GSC_CACHE_MS = 6 * 60 * 60 * 1000;
const RANGE_DAYS = 28;
const ROW_LIMIT = 50;

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
  fetchedAt: string;
}

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
  const [totals, queries, pages, days] = await Promise.all([
    query(cfg, access, base),
    query(cfg, access, { ...base, dimensions: ['query'], rowLimit: ROW_LIMIT }),
    query(cfg, access, { ...base, dimensions: ['page'], rowLimit: ROW_LIMIT }),
    query(cfg, access, { ...base, dimensions: ['date'], rowLimit: RANGE_DAYS + 2 }),
  ]);
  const { key: _key, ...total } = toRow(totals[0] ?? {});
  return {
    siteUrl: cfg.siteUrl,
    ...range,
    totals: total,
    queries: queries.map(toRow),
    pages: pages.map(toRow),
    days: days.map(toRow).sort((a, b) => a.key.localeCompare(b.key)),
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

/** Tests: forget the cached report and token. */
export const resetSearchConsoleCache = () => {
  cache = null;
  token = null;
  inflight = null;
};
