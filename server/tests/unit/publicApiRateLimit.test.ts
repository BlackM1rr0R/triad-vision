import { describe, expect, it } from 'vitest';
import { FixedWindowLimiter, KEY_PREFIX_RE, parsePublicApiKey, rateLimitHeaders } from '../../src/lib/publicApi/rateLimit.js';
import { applyUrl, matchesFilter } from '../../src/lib/publicApi/vacancies.js';

const KEY = `tvp_${'a'.repeat(43)}`;

describe('public API: fixed-window rate limit', () => {
  it('allows `limit` hits per window, then refuses until the window ends', () => {
    const l = new FixedWindowLimiter(60_000);
    const t0 = 1_000_000;
    expect(l.hit('k', 2, t0)).toMatchObject({ allowed: true, remaining: 1, limit: 2 });
    expect(l.hit('k', 2, t0 + 10)).toMatchObject({ allowed: true, remaining: 0 });
    const third = l.hit('k', 2, t0 + 20_000);
    expect(third).toMatchObject({ allowed: false, remaining: 0 });
    expect(third.resetMs).toBe(40_000);
    // Other keys have their own window.
    expect(l.hit('other', 2, t0 + 20_000).allowed).toBe(true);
    // A new window starts after 60 s.
    expect(l.hit('k', 2, t0 + 60_000)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it('treats a limit below 1 as 1 and resets one key', () => {
    const l = new FixedWindowLimiter();
    expect(l.hit('k', 0, 0)).toMatchObject({ allowed: true, limit: 1 });
    expect(l.hit('k', 0, 1).allowed).toBe(false);
    l.reset('k');
    expect(l.hit('k', 0, 2).allowed).toBe(true);
  });

  it('keeps memory bounded by sweeping finished windows', () => {
    const l = new FixedWindowLimiter(1000, 2);
    l.hit('a', 5, 0);
    l.hit('b', 5, 0);
    expect(l.hit('c', 5, 5000).allowed).toBe(true);
    expect((l as unknown as { windows: Map<string, unknown> }).windows.size).toBe(1);
  });

  it('builds RateLimit headers and Retry-After only when refused', () => {
    expect(rateLimitHeaders({ allowed: true, limit: 60, remaining: 59, resetMs: 59_001 })).toEqual({ 'RateLimit-Limit': '60', 'RateLimit-Remaining': '59', 'RateLimit-Reset': '60' });
    expect(rateLimitHeaders({ allowed: false, limit: 2, remaining: 0, resetMs: 100 })).toEqual({ 'RateLimit-Limit': '2', 'RateLimit-Remaining': '0', 'RateLimit-Reset': '1', 'Retry-After': '1' });
  });
});

describe('public API: key parsing', () => {
  it('accepts tvp_ keys from Authorization: Bearer or X-API-Key only', () => {
    expect(parsePublicApiKey(`Bearer ${KEY}`, undefined)).toBe(KEY);
    expect(parsePublicApiKey(undefined, ` ${KEY} `)).toBe(KEY);
    expect(parsePublicApiKey(undefined, undefined)).toBeUndefined();
    // Employer API keys (tv_…) and anything else are not public API keys.
    expect(parsePublicApiKey(`Bearer tv_${'a'.repeat(43)}`, undefined)).toBeUndefined();
    expect(parsePublicApiKey(`Basic ${KEY}`, undefined)).toBeUndefined();
    expect(parsePublicApiKey(`Bearer tvp_short`, undefined)).toBeUndefined();
    expect(parsePublicApiKey(`Bearer ${KEY}"; drop`, undefined)).toBeUndefined();
  });

  it('validates the stored prefix used as attribution source', () => {
    expect(KEY_PREFIX_RE.test('tvp_Ab3-_xYz')).toBe(true);
    expect(KEY_PREFIX_RE.test('tv_Ab3-_xYz1')).toBe(false);
    expect(KEY_PREFIX_RE.test('tvp_Ab3')).toBe(false);
  });
});

describe('public API: vacancy view helpers', () => {
  it('builds the apply link with partner code and key prefix', () => {
    expect(applyUrl('https://triad-vision.de/', 'lkw-fahrer-bonn', 'ILQAR-M', 'tvp_Ab3-_xYz')).toBe('https://triad-vision.de/jobs/lkw-fahrer-bonn?ref=ILQAR-M&src=tvp_Ab3-_xYz');
    expect(applyUrl('https://triad-vision.de', 'x', '', 'tvp_Ab3-_xYz')).toBe('https://triad-vision.de/jobs/x?src=tvp_Ab3-_xYz');
  });

  it('filters by profession (synonyms), city and maximum German level', () => {
    const v = { profession: 'Berufskraftfahrer', city: 'Bonn', germanLevel: 'A2', title: { de: 'LKW-Fahrer CE', en: 'Truck driver' } };
    expect(matchesFilter(v, {})).toBe(true);
    expect(matchesFilter(v, { profession: 'LKW-Fahrer' })).toBe(true);
    expect(matchesFilter(v, { profession: 'nurse' })).toBe(false);
    expect(matchesFilter(v, { city: 'bonn' })).toBe(true);
    expect(matchesFilter(v, { city: 'Berlin' })).toBe(false);
    expect(matchesFilter(v, { germanLevel: 'B1' })).toBe(true);
    expect(matchesFilter(v, { germanLevel: 'A1' })).toBe(false);
  });
});
