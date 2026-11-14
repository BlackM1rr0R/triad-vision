import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GSC_CACHE_MS, gscConfig, reportRange, resetSearchConsoleCache, searchPerformance, signAssertion } from '../../src/lib/searchConsole.js';

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
    const dim = body.dimensions?.[0];
    if (!dim) return Response.json({ rows: [row(null, 120)] });
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
    expect(fetchMock).toHaveBeenCalledTimes(5); // token + 4 queries
    const apiCall = fetchMock.mock.calls[1];
    expect(String(apiCall[0])).toBe('https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Atriad-vision.de/searchAnalytics/query');
    expect((apiCall[1]?.headers as Record<string, string>).Authorization).toBe('Bearer ya29.secret-token');

    expect((await searchPerformance({ now: new Date(now.getTime() + GSC_CACHE_MS - 1000) })) as { cached: boolean }).toMatchObject({ cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    // An explicit refresh within 10 minutes still uses the cache (API quota).
    expect(await searchPerformance({ refresh: true, now: new Date(now.getTime() + 60_000) })).toMatchObject({ cached: true });
    await searchPerformance({ now: new Date(now.getTime() + GSC_CACHE_MS + 1000) });
    expect(fetchMock).toHaveBeenCalledTimes(9); // token cached, 4 new queries
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
