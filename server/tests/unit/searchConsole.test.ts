import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GSC_CACHE_MS,
  INSPECTION_CACHE_MS,
  buildOpportunities,
  canonicalPageUrl,
  duplicateUrls,
  expectedCtr,
  gscConfig,
  inspectionTargets,
  localeBreakdown,
  lowCtr,
  parseInspection,
  reportRange,
  resetSearchConsoleCache,
  searchPerformance,
  signAssertion,
  siteOrigin,
  strikingDistance,
  urlInspection,
  type GscRow,
} from '../../src/lib/searchConsole.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ACCOUNT = { type: 'service_account', client_email: 'gsc-reader@proj.iam.gserviceaccount.com', private_key: PEM, token_uri: 'https://oauth2.googleapis.com/token' };

const row = (key: string | null, clicks: number) => ({ ...(key ? { keys: [key] } : {}), clicks, impressions: clicks * 20, ctr: 0.05, position: 7.345 });

/** Fake Google: token endpoint + Search Analytics, answering by the requested dimension. */
const google = (opts: { status?: number } = {}) =>
  vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'ya29.secret-token', expires_in: 3600 });
    if (opts.status) return Response.json({ error: { message: 'User does not have sufficient permission for site' } }, { status: opts.status });
    const body = JSON.parse(String(init?.body)) as { dimensions?: string[] };
    const dim = body.dimensions?.join('+');
    if (!dim) return Response.json({ rows: [row(null, 120)] });
    if (dim === 'query+page') return Response.json({ rows: [{ keys: ['lkw fahrer jobs', 'https://triad-vision.de/de/jobs'], clicks: 1, impressions: 200, ctr: 0.005, position: 7 }] });
    if (dim === 'query') return Response.json({ rows: [row('almaniyada iş', 40), row('lkw fahrer jobs', 12)] });
    if (dim === 'page') return Response.json({ rows: [row('https://triad-vision.de/de/jobs', 30)] });
    return Response.json({ rows: [row('2026-11-12', 5), row('2026-11-11', 4)] });
  });

const env = { ...process.env };
beforeEach(() => resetSearchConsoleCache());
afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Search Console configuration', () => {
  it('explains what is missing and accepts the key as JSON or base64', () => {
    expect(gscConfig({})).toMatchObject({ configured: false, reason: 'MISSING_CREDENTIALS' });
    expect(gscConfig({ GSC_SERVICE_ACCOUNT_JSON: '{"client_email":"x@y"}' })).toMatchObject({ configured: false, reason: 'INVALID_CREDENTIALS', serviceAccountEmail: 'x@y' });
    expect(gscConfig({ GSC_SERVICE_ACCOUNT_JSON: JSON.stringify(ACCOUNT) })).toMatchObject({ configured: false, reason: 'MISSING_SITE', serviceAccountEmail: ACCOUNT.client_email });
    const b64 = Buffer.from(JSON.stringify(ACCOUNT)).toString('base64');
    expect(gscConfig({ GSC_SERVICE_ACCOUNT_JSON: b64, GSC_SITE_URL: 'sc-domain:triad-vision.de' })).toMatchObject({ configured: true, siteUrl: 'sc-domain:triad-vision.de' });
  });

  it('signs a verifiable RS256 assertion for the read-only scope', () => {
    const jwt = signAssertion(ACCOUNT, Date.UTC(2026, 10, 14));
    const [h, c, s] = jwt.split('.');
    expect(crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, s, 'base64url')).toBe(true);
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toMatchObject({ iss: ACCOUNT.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: ACCOUNT.token_uri });
    expect(claims.exp - claims.iat).toBe(3600);
  });

  it('reports the 28 days ending yesterday', () => {
    expect(reportRange(new Date('2026-11-14T10:00:00Z'))).toEqual({ startDate: '2026-10-17', endDate: '2026-11-13' });
  });
});

describe('searchPerformance', () => {
  it('returns the setup state when not configured', async () => {
    delete process.env.GSC_SERVICE_ACCOUNT_JSON;
    delete process.env.GSC_SITE_URL;
    expect(await searchPerformance()).toEqual({ configured: false, reason: 'MISSING_CREDENTIALS', siteUrl: null, serviceAccountEmail: null });
  });

  it('fetches totals, queries, pages and days once and caches them for 6 hours', async () => {
    process.env.GSC_SERVICE_ACCOUNT_JSON = JSON.stringify(ACCOUNT);
    process.env.GSC_SITE_URL = 'sc-domain:triad-vision.de';
    const fetchMock = google();
    vi.stubGlobal('fetch', fetchMock);
    const now = new Date('2026-11-14T10:00:00Z');
    const r = await searchPerformance({ now });
    if (!r.configured) throw new Error('expected configured');
    expect(r.error).toBeNull();
    expect(r.report?.totals).toEqual({ clicks: 120, impressions: 2400, ctr: 0.05, position: 7.3 });
    expect(r.report?.queries.map((q) => q.key)).toEqual(['almaniyada iş', 'lkw fahrer jobs']);
    expect(r.report?.pages[0].key).toBe('https://triad-vision.de/de/jobs');
    expect(r.report?.days.map((d) => d.key)).toEqual(['2026-11-11', '2026-11-12']);
    expect(fetchMock).toHaveBeenCalledTimes(6); // token + 5 queries
    // Position 7.3 → striking distance; the query's top page comes from the query+page rows.
    expect(r.report?.opportunities.strikingQueries.find((q) => q.key === 'lkw fahrer jobs')?.page).toBe('https://triad-vision.de/de/jobs');
    expect(r.report?.opportunities.locales.find((l) => l.locale === 'de')).toMatchObject({ clicks: 30, impressions: 600, pages: 1 });
    const apiCall = fetchMock.mock.calls[1];
    expect(String(apiCall[0])).toBe('https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Atriad-vision.de/searchAnalytics/query');
    expect((apiCall[1]?.headers as Record<string, string>).Authorization).toBe('Bearer ya29.secret-token');

    expect((await searchPerformance({ now: new Date(now.getTime() + GSC_CACHE_MS - 1000) })) as { cached: boolean }).toMatchObject({ cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    // An explicit refresh within 10 minutes still uses the cache (API quota).
    expect(await searchPerformance({ refresh: true, now: new Date(now.getTime() + 60_000) })).toMatchObject({ cached: true });
    await searchPerformance({ now: new Date(now.getTime() + GSC_CACHE_MS + 1000) });
    expect(fetchMock).toHaveBeenCalledTimes(11); // token cached, 5 new queries
  });

  it('reports a missing permission without leaking the key or the token', async () => {
    process.env.GSC_SERVICE_ACCOUNT_JSON = JSON.stringify(ACCOUNT);
    process.env.GSC_SITE_URL = 'sc-domain:triad-vision.de';
    vi.stubGlobal('fetch', google({ status: 403 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await searchPerformance();
    expect(r).toMatchObject({ configured: true, report: null, error: { code: 'NO_ACCESS' }, serviceAccountEmail: ACCOUNT.client_email });
    const out = JSON.stringify(r) + JSON.stringify(warn.mock.calls);
    expect(out).not.toContain('PRIVATE KEY');
    expect(out).not.toContain(PEM.split('\n')[1]);
    expect(out).not.toContain('ya29.secret-token');
  });
});

const r = (key: string, clicks: number, impressions: number, position: number): GscRow => ({ key, clicks, impressions, ctr: impressions ? Math.round((clicks / impressions) * 10000) / 10000 : 0, position });

/** Rows shaped like the real property's data (28 days, a young multilingual site). */
const QUERIES = [
  r('калькулятор налогов в германии', 0, 11, 8.8),
  r('almaniyada iş', 4, 40, 2.1),
  r('chancenkarte punkte rechner', 0, 64, 6.2),
  r('blue card germany salary 2026', 1, 9, 24.5),
  r('lkw fahrer jobs deutschland', 0, 0, 12),
];
const PAGES = [
  r('https://triad-vision.de/salary-calculator?lng=ru', 0, 17, 8.1),
  r('https://triad-vision.de/ru/anerkennung', 0, 50, 55.1),
  r('https://triad-vision.de/ru/salary-calculator', 2, 30, 7.0),
  r('https://triad-vision.de/', 5, 120, 3.2),
  r('https://triad-vision.de/de/jobs', 1, 80, 9.0),
  r('https://triad-vision.de/jobs/?lng=az', 0, 5, 14),
  r('https://www.triad-vision.de/az/guides', 0, 3, 18),
  r('http://triad-vision.de/en/cities/', 0, 2, 30),
  r('https://triad-vision.de/de/jobs?city=berlin', 0, 4, 11),
];

describe('opportunities', () => {
  it('striking distance: position 4–20 with impressions, most impressions first', () => {
    const s = strikingDistance(QUERIES, new Map([['калькулятор налогов в германии', 'https://triad-vision.de/ru/salary-calculator']]));
    expect(s.map((q) => q.key)).toEqual(['chancenkarte punkte rechner', 'калькулятор налогов в германии']);
    expect(s[1].page).toBe('https://triad-vision.de/ru/salary-calculator');
    expect(s[0].page).toBeNull();
    // /ru/anerkennung at 55.1 is too far, the root at 3.2 is already top 3.
    const pages = strikingDistance(PAGES).map((p) => p.key);
    expect(pages).not.toContain('https://triad-vision.de/ru/anerkennung');
    expect(pages).not.toContain('https://triad-vision.de/');
    expect(pages[0]).toBe('https://triad-vision.de/de/jobs');
  });

  it('low CTR: enough impressions, a click expected and CTR under half the curve', () => {
    expect(expectedCtr(1)).toBe(0.28);
    expect(expectedCtr(4.8)).toBe(0.06);
    expect(expectedCtr(8.8)).toBe(0.03);
    expect(expectedCtr(55.1)).toBeNull();
    const low = lowCtr([
      { kind: 'query', rows: QUERIES },
      { kind: 'page', rows: PAGES },
    ]);
    // 64 impressions at 6.2: 1.9 clicks expected, none → flagged; the root (5/120 = 4.2% at 3.2, expected 10%) too.
    expect(low.map((l) => [l.kind, l.key])).toEqual([
      ['page', 'https://triad-vision.de/'],
      ['query', 'chancenkarte punkte rechner'],
      ['page', 'https://triad-vision.de/de/jobs'],
    ]);
    expect(low[1]).toMatchObject({ expectedCtr: 0.03, missedClicks: 1.9 });
    // 11 impressions (below 20), 55.1 (no curve) and 30 impressions at 7.0 with 2 clicks are not flagged.
    const keys = low.map((l) => l.key);
    expect(keys).not.toContain('калькулятор налогов в германии');
    expect(keys).not.toContain('https://triad-vision.de/ru/anerkennung');
    expect(keys).not.toContain('https://triad-vision.de/ru/salary-calculator');
  });

  it('maps duplicate-looking URLs to the clean canonical', () => {
    expect(canonicalPageUrl('https://triad-vision.de/salary-calculator?lng=ru')).toEqual({
      canonical: 'https://triad-vision.de/ru/salary-calculator',
      locale: 'ru',
      reasons: ['lng'],
      redirected: true,
    });
    expect(canonicalPageUrl('https://triad-vision.de/jobs/?lng=az')).toMatchObject({ canonical: 'https://triad-vision.de/jobs', locale: 'az', reasons: ['trailingSlash', 'lng'], redirected: true });
    expect(canonicalPageUrl('https://www.triad-vision.de/az/guides')).toMatchObject({ canonical: 'https://triad-vision.de/guides', reasons: ['www', 'azPrefix'], redirected: true });
    expect(canonicalPageUrl('http://triad-vision.de/en/cities/')).toMatchObject({ canonical: 'https://triad-vision.de/en/cities', locale: 'en', reasons: ['http', 'trailingSlash'] });
    expect(canonicalPageUrl('https://triad-vision.de/de/calculators')).toMatchObject({ canonical: 'https://triad-vision.de/de/tools', reasons: ['alias'] });
    // Other query strings are not redirected; on a prefixed path the prefix wins and ?lng= is dropped (redirected).
    expect(canonicalPageUrl('https://triad-vision.de/de/jobs?city=berlin')).toMatchObject({ canonical: 'https://triad-vision.de/de/jobs', reasons: ['query'], redirected: false });
    expect(canonicalPageUrl('https://triad-vision.de/de/jobs?lng=ru')).toMatchObject({ canonical: 'https://triad-vision.de/de/jobs', locale: 'de', redirected: true });
    expect(canonicalPageUrl('https://triad-vision.de/salary-calculator?lng=RU-ru')).toMatchObject({ canonical: 'https://triad-vision.de/ru/salary-calculator', locale: 'ru', redirected: true });
    // Clean URLs: no reasons.
    expect(canonicalPageUrl('https://triad-vision.de/')).toEqual({ canonical: 'https://triad-vision.de/', locale: 'az', reasons: [], redirected: false });
    expect(canonicalPageUrl('https://triad-vision.de/ru/anerkennung')?.reasons).toEqual([]);
    expect(canonicalPageUrl('not a url')).toBeNull();

    const groups = duplicateUrls(PAGES);
    expect(groups[0]).toMatchObject({
      canonical: 'https://triad-vision.de/ru/salary-calculator',
      canonicalRow: { key: 'https://triad-vision.de/ru/salary-calculator', impressions: 30 },
      impressions: 17,
      urls: [{ key: 'https://triad-vision.de/salary-calculator?lng=ru', reasons: ['lng'], redirected: true }],
    });
    expect(groups.map((g) => g.canonical)).toEqual([
      'https://triad-vision.de/ru/salary-calculator',
      'https://triad-vision.de/jobs',
      'https://triad-vision.de/de/jobs',
      'https://triad-vision.de/guides',
      'https://triad-vision.de/en/cities',
    ]);
    expect(groups[1].canonicalRow).toBeNull();
    expect(groups[2].canonicalRow?.impressions).toBe(80);
  });

  it('breaks clicks, impressions, CTR and weighted position down by language', () => {
    const locales = localeBreakdown(PAGES);
    expect(locales.map((l) => l.locale)).toEqual(['az', 'de', 'en', 'ru', 'tr', 'uk']);
    const ru = locales.find((l) => l.locale === 'ru')!;
    // /salary-calculator?lng=ru counts as Russian: 17 + 50 + 30 impressions.
    expect(ru).toMatchObject({ clicks: 2, impressions: 97, pages: 3, ctr: 0.0206 });
    expect(ru.position).toBe(Math.round(((8.1 * 17 + 55.1 * 50 + 7 * 30) / 97) * 10) / 10);
    expect(locales.find((l) => l.locale === 'tr')).toEqual({ locale: 'tr', clicks: 0, impressions: 0, ctr: 0, position: 0, pages: 0 });
    expect(locales.find((l) => l.locale === 'az')).toMatchObject({ impressions: 128, pages: 3 });
  });

  it('builds all sections, the query page from the query+page pair with most impressions', () => {
    const o = buildOpportunities(QUERIES, PAGES, [
      { query: 'chancenkarte punkte rechner', page: 'https://triad-vision.de/de/chancenkarte-calculator', impressions: 50 },
      { query: 'chancenkarte punkte rechner', page: 'https://triad-vision.de/chancenkarte-calculator', impressions: 14 },
    ]);
    expect(o.strikingQueries[0]).toMatchObject({ key: 'chancenkarte punkte rechner', page: 'https://triad-vision.de/de/chancenkarte-calculator' });
    expect(o.locales).toHaveLength(6);
    expect(o.duplicates.length).toBeGreaterThan(0);
    expect(o.lowCtr.length).toBeGreaterThan(0);
  });
});

describe('URL Inspection', () => {
  const INSPECTED = {
    inspectionResult: {
      inspectionResultLink: 'https://search.google.com/search-console/inspect?resource_id=x&id=y',
      indexStatusResult: {
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        robotsTxtState: 'ALLOWED',
        indexingState: 'INDEXING_ALLOWED',
        lastCrawlTime: '2026-11-10T08:12:00Z',
        pageFetchState: 'SUCCESSFUL',
        googleCanonical: 'https://triad-vision.de/ru/salary-calculator',
        userCanonical: 'https://triad-vision.de/ru/salary-calculator',
      },
    },
  };

  it('derives the origin and the key URLs of every language', () => {
    expect(siteOrigin('https://triad-vision.de/')).toBe('https://triad-vision.de');
    expect(siteOrigin('sc-domain:triad-vision.de', 'https://triad-vision.de')).toBe('https://triad-vision.de');
    expect(siteOrigin('sc-domain:triad-vision.de', 'http://localhost:5173')).toBe('https://triad-vision.de');
    const t = inspectionTargets('https://triad-vision.de');
    expect(t).toHaveLength(42);
    expect(t[0]).toEqual({ locale: 'az', path: '/', url: 'https://triad-vision.de/' });
    const urls = t.map((x) => x.url);
    expect(urls).toContain('https://triad-vision.de/de');
    expect(urls).toContain('https://triad-vision.de/uk/cities');
    expect(urls).toContain('https://triad-vision.de/salary-calculator');
  });

  it('parses the index status and flags a Google-chosen canonical', () => {
    const target = { locale: 'ru' as const, path: '/salary-calculator', url: 'https://triad-vision.de/ru/salary-calculator' };
    expect(parseInspection(target, INSPECTED)).toEqual({
      ...target,
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      indexingState: 'INDEXING_ALLOWED',
      robotsTxtState: 'ALLOWED',
      pageFetchState: 'SUCCESSFUL',
      lastCrawlTime: '2026-11-10T08:12:00Z',
      googleCanonical: 'https://triad-vision.de/ru/salary-calculator',
      userCanonical: 'https://triad-vision.de/ru/salary-calculator',
      canonicalMismatch: false,
      link: INSPECTED.inspectionResult.inspectionResultLink,
      error: null,
    });
    const other = { ...INSPECTED.inspectionResult, indexStatusResult: { ...INSPECTED.inspectionResult.indexStatusResult, googleCanonical: 'https://triad-vision.de/salary-calculator' } };
    expect(parseInspection(target, { inspectionResult: other }).canonicalMismatch).toBe(true);
    // The root with and without the slash is the same URL; an unknown page has no canonical and no mismatch.
    const root = { locale: 'az' as const, path: '/', url: 'https://triad-vision.de/' };
    expect(parseInspection(root, { inspectionResult: { indexStatusResult: { googleCanonical: 'https://triad-vision.de' } } }).canonicalMismatch).toBe(false);
    expect(parseInspection(root, { inspectionResult: { indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'URL is unknown to Google' } } })).toMatchObject({
      verdict: 'NEUTRAL',
      googleCanonical: null,
      canonicalMismatch: false,
    });
    expect(parseInspection(root, {})).toMatchObject({ verdict: null, coverageState: null });
  });

  it('inspects every URL, keeps per-URL errors and caches the run for 24 hours', async () => {
    process.env.GSC_SERVICE_ACCOUNT_JSON = JSON.stringify(ACCOUNT);
    process.env.GSC_SITE_URL = 'https://triad-vision.de/';
    const seen: { url: string; siteUrl: string }[] = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'ya29.secret-token', expires_in: 3600 });
      const body = JSON.parse(String(init?.body)) as { inspectionUrl: string; siteUrl: string };
      seen.push({ url: u, siteUrl: body.siteUrl });
      if (body.inspectionUrl.endsWith('/de/jobs')) return Response.json({ error: { message: 'Quota exceeded' } }, { status: 429 });
      if (body.inspectionUrl.endsWith('/tr/guides')) throw new TypeError('fetch failed: ya29.secret-token');
      return Response.json(INSPECTED);
    });
    vi.stubGlobal('fetch', fetchMock);
    const now = new Date('2026-11-14T10:00:00Z');
    const res = await urlInspection({ now });
    if (!res.configured) throw new Error('expected configured');
    expect(res.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(43); // token + 42 URLs
    expect(new Set(seen.map((s) => s.url))).toEqual(new Set(['https://searchconsole.googleapis.com/v1/urlInspection/index:inspect']));
    expect(new Set(seen.map((s) => s.siteUrl))).toEqual(new Set(['https://triad-vision.de/']));
    const rows = res.report!.rows;
    expect(rows).toHaveLength(42);
    expect(rows.find((x) => x.url === 'https://triad-vision.de/de/jobs')).toMatchObject({ verdict: null, error: { code: 'QUOTA', message: 'Quota exceeded' } });
    expect(rows.find((x) => x.url === 'https://triad-vision.de/tr/guides')?.error).toEqual({ code: 'API_ERROR', message: 'TypeError' });
    expect(rows.filter((x) => x.verdict === 'PASS')).toHaveLength(40);
    // The fake answers every URL with the RU salary page as canonical → a mismatch everywhere else.
    expect(rows.find((x) => x.url === 'https://triad-vision.de/ru/salary-calculator')?.canonicalMismatch).toBe(false);
    expect(rows.find((x) => x.url === 'https://triad-vision.de/jobs')?.canonicalMismatch).toBe(true);
    expect(JSON.stringify(res)).not.toContain('ya29.secret-token');

    // Cached: a plain load within 24 h and a refresh within 1 h make no calls; a refresh after 1 h re-inspects.
    expect(await urlInspection({ now: new Date(now.getTime() + INSPECTION_CACHE_MS - 1000) })).toMatchObject({ cached: true });
    expect(await urlInspection({ refresh: true, now: new Date(now.getTime() + 30 * 60_000) })).toMatchObject({ cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(43);
    expect(await urlInspection({ refresh: true, now: new Date(now.getTime() + 61 * 60_000) })).toMatchObject({ cached: false });
    expect(fetchMock).toHaveBeenCalledTimes(85); // token still valid, 42 inspections
  });

  it('reports a failed sign-in without leaking the key', async () => {
    process.env.GSC_SERVICE_ACCOUNT_JSON = JSON.stringify(ACCOUNT);
    process.env.GSC_SITE_URL = 'https://triad-vision.de/';
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }, { status: 400 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await urlInspection();
    expect(res).toMatchObject({ configured: true, report: null, error: { code: 'AUTH_FAILED', message: 'Invalid JWT Signature.' } });
    expect(JSON.stringify(res) + JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE KEY');
  });
});
