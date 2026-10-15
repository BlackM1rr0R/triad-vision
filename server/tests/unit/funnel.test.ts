import { describe, expect, it } from 'vitest';
import { bucketKey, bucketRange, median, normaliseSource, rate } from '../../src/lib/funnel.js';
import { growthTexts } from '../../src/lib/growthTexts.js';

describe('funnel helpers', () => {
  it('normalises traffic sources', () => {
    expect(normaliseSource('  WWW.Google.COM ')).toBe('google.com');
    expect(normaliseSource('t.me/<x>')).toBe('t.mex');
    expect(normaliseSource(undefined)).toBe('');
    expect(normaliseSource('a'.repeat(80))).toHaveLength(60);
  });

  it('buckets by day, ISO week (Monday) and month', () => {
    const d = new Date('2026-10-15T23:30:00Z'); // Thursday
    expect(bucketKey(d, 'day')).toBe('2026-10-15');
    expect(bucketKey(d, 'week')).toBe('2026-10-12');
    expect(bucketKey(new Date('2026-10-18T10:00:00Z'), 'week')).toBe('2026-10-12'); // Sunday
    expect(bucketKey(new Date('2026-10-19T00:00:00Z'), 'week')).toBe('2026-10-19'); // Monday
    expect(bucketKey(d, 'month')).toBe('2026-10-01');
  });

  it('lists every bucket in a range', () => {
    expect(bucketRange(new Date('2026-10-01T00:00:00Z'), new Date('2026-10-03T00:00:00Z'), 'day')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(bucketRange(new Date('2026-11-15T00:00:00Z'), new Date('2027-01-02T00:00:00Z'), 'month')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
  });

  it('computes medians and rates', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(1, 0)).toBeNull();
  });
});

describe('growth texts', () => {
  it('has every message in all four languages', () => {
    const keys = Object.keys(growthTexts.az).sort();
    for (const l of ['de', 'en', 'ru'] as const) expect(Object.keys(growthTexts[l]).sort()).toEqual(keys);
    for (const l of ['az', 'de', 'en', 'ru'] as const) {
      const tx = growthTexts[l];
      expect(tx.passport({ level: 'expired', date: 'X' }).body).toContain('X');
      expect(tx.slaDigest({ rows: [{ number: 'TV-1', status: 'EMBASSY_REVIEW', days: 4 }] }).body).toContain('TV-1');
      expect(tx.slaDigest({ rows: [{ number: 'TV-1', status: 'EMBASSY_REVIEW', days: 4 }] }).body).not.toContain('EMBASSY_REVIEW');
      expect(tx.missingDocs({ number: 'TV-2', stage: 'INITIAL', missing: ['A', 'B'] }).body).toContain('• B');
    }
  });
});
