import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gscConfig, signAssertion } from '../../src/lib/searchConsole.js';
import { filterGroups, keywordTrend, mapSitemaps, normalizeExplore, normalizeKeyword, previousRange, sitemapUrl, summarizeDays } from '../../src/lib/searchConsoleTracker.js';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ACCOUNT = { client_email: 'gsc@proj.iam.gserviceaccount.com', private_key: PEM };
const NOW = new Date('2026-11-25T10:00:00Z');

describe('credentials from a file and the write scope', () => {
  it('reads GSC_SERVICE_ACCOUNT_FILE when the JSON variable is empty, and reports an unreadable file', () => {
    const file = path.join(os.tmpdir(), `gsc-${crypto.randomUUID()}.json`);
    fs.writeFileSync(file, JSON.stringify(ACCOUNT));
    try {
      const cfg = gscConfig({ GSC_SERVICE_ACCOUNT_FILE: file, GSC_SITE_URL: 'sc-domain:triad-vision.de' } as NodeJS.ProcessEnv);
      expect(cfg).toMatchObject({ configured: true, siteUrl: 'sc-domain:triad-vision.de' });
    } finally {
      fs.rmSync(file);
    }
    expect(gscConfig({ GSC_SERVICE_ACCOUNT_FILE: '/nonexistent/key.json', GSC_SITE_URL: 'sc-domain:x.de' } as NodeJS.ProcessEnv)).toMatchObject({ configured: false, reason: 'INVALID_CREDENTIALS' });
  });

  it('signs the assertion with the requested scope', () => {
    const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString()) as { scope: string; iss: string; exp: number; iat: number };
    expect(claims(signAssertion(ACCOUNT, NOW.getTime())).scope).toBe('https://www.googleapis.com/auth/webmasters.readonly');
    const write = claims(signAssertion(ACCOUNT, NOW.getTime(), 'https://www.googleapis.com/auth/webmasters'));
    expect(write).toMatchObject({ scope: 'https://www.googleapis.com/auth/webmasters', iss: ACCOUNT.client_email });
    expect(write.exp - write.iat).toBe(3600);
  });
});

describe('explore filters', () => {
  it('ends yesterday, defaults to 28 days and validates the options', () => {
    expect(normalizeExplore({}, NOW)).toEqual({ startDate: '2026-10-28', endDate: '2026-11-24', country: null, device: null });
    expect(normalizeExplore({ days: 7, country: 'az', device: 'mobile' }, NOW)).toEqual({ startDate: '2026-11-18', endDate: '2026-11-24', country: 'aze', device: 'MOBILE' });
    expect(normalizeExplore({ days: 5 }, NOW)).toBeNull();
    expect(normalizeExplore({ country: 'XX' }, NOW)).toBeNull();
    expect(normalizeExplore({ device: 'WATCH' }, NOW)).toBeNull();
  });

  it('accepts a custom range, caps the end at yesterday and refuses reversed or too long ranges', () => {
    expect(normalizeExplore({ from: '2026-11-01', to: '2026-12-31' }, NOW)).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-24' });
    expect(normalizeExplore({ from: '2026-11-10', to: '2026-11-01' }, NOW)).toBeNull();
    expect(normalizeExplore({ from: '2024-01-01', to: '2026-11-01' }, NOW)).toBeNull();
    expect(normalizeExplore({ from: 'garbage' }, NOW)).toBeNull();
  });

  it('computes the previous period of the same length', () => {
    expect(previousRange({ startDate: '2026-11-18', endDate: '2026-11-24' })).toEqual({ startDate: '2026-11-11', endDate: '2026-11-17' });
  });

  it('builds the dimension filter groups', () => {
    expect(filterGroups({})).toEqual({});
    expect(filterGroups({ country: 'aze', device: 'MOBILE', query: 'almaniyada iş' })).toEqual({
      dimensionFilterGroups: [
        {
          groupType: 'and',
          filters: [
            { dimension: 'country', operator: 'equals', expression: 'aze' },
            { dimension: 'device', operator: 'equals', expression: 'MOBILE' },
            { dimension: 'query', operator: 'equals', expression: 'almaniyada iş' },
          ],
        },
      ],
    });
  });
});

describe('keyword tracker maths', () => {
  it('normalises keywords', () => {
    expect(normalizeKeyword('  Almaniyada   IŞ ')).toBe('almaniyada iş');
    expect(normalizeKeyword('Работа в Германии')).toBe('работа в германии');
    expect(normalizeKeyword('a')).toBeNull();
    expect(normalizeKeyword('x'.repeat(201))).toBeNull();
  });

  it('weights the position by impressions', () => {
    expect(summarizeDays([])).toEqual({ clicks: 0, impressions: 0, position: 0 });
    expect(
      summarizeDays([
        { day: '2026-11-01', clicks: 1, impressions: 10, position: 10 },
        { day: '2026-11-02', clicks: 3, impressions: 30, position: 6 },
      ]),
    ).toEqual({ clicks: 4, impressions: 40, position: 7 });
  });

  it('compares the last 28 days with the 28 before; a smaller position is an improvement', () => {
    const days = [
      { day: '2026-11-24', clicks: 2, impressions: 20, position: 8 },
      { day: '2026-10-28', clicks: 1, impressions: 20, position: 8 },
      { day: '2026-10-27', clicks: 0, impressions: 20, position: 12 },
      { day: '2026-09-29', clicks: 0, impressions: 20, position: 12 },
      { day: '2026-09-28', clicks: 9, impressions: 99, position: 1 },
    ];
    const t = keywordTrend(days, '2026-11-24');
    expect(t.current).toEqual({ clicks: 3, impressions: 40, position: 8 });
    expect(t.previous).toEqual({ clicks: 0, impressions: 20, position: 12 });
    expect(t.positionChange).toBe(4);
    expect(keywordTrend([{ day: '2026-11-24', clicks: 0, impressions: 5, position: 3 }], '2026-11-24').positionChange).toBeNull();
  });
});

describe('sitemaps', () => {
  it('maps the Google response and numbers sent as strings', () => {
    expect(mapSitemaps({})).toEqual([]);
    const [s] = mapSitemaps({
      sitemap: [{ path: 'https://triad-vision.de/sitemap.xml', lastSubmitted: '2026-11-20T10:00:00Z', isPending: false, isSitemapsIndex: true, errors: '2', warnings: '0', contents: [{ type: 'web', submitted: '120', indexed: '90' }] }],
    });
    expect(s).toMatchObject({ path: 'https://triad-vision.de/sitemap.xml', lastDownloaded: null, errors: 2, warnings: 0, isSitemapsIndex: true });
    expect(s!.contents).toEqual([{ type: 'web', submitted: 120, indexed: 90 }]);
  });

  it('submits the sitemap of the property', () => {
    expect(sitemapUrl('sc-domain:triad-vision.de')).toMatch(/\/sitemap\.xml$/);
    expect(sitemapUrl('https://triad-vision.de/')).toBe('https://triad-vision.de/sitemap.xml');
  });
});
