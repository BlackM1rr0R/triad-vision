import { describe, expect, it } from 'vitest';
import {
  buildQuarterStats,
  kBreakdown,
  lastCompletedQuarter,
  previousQuarter,
  quarterRange,
  safeCount,
  satisfiesK,
  stageStat,
  trendOf,
  type ReportCase,
} from '../../src/lib/quarterlyReport/aggregate.js';
import { buildQuarterlyReportPdf } from '../../src/lib/quarterlyReport/pdf.js';
import { bucketLabel } from '../../src/lib/quarterlyReport/texts.js';

let seq = 0;
const row = (over: Partial<ReportCase> = {}): ReportCase => ({
  id: `c${seq++}`,
  visaType: 'WORK',
  profession: 'truck_driver',
  state: 'BY',
  germanLevel: 'A2',
  samples: { documents: 10, contract: 20, embassy: 30, decision: 15, total: 75 },
  ...over,
});
const rows = (n: number, over: Partial<ReportCase> = {}) => Array.from({ length: n }, () => row(over));

describe('quarterly report: k-anonymity', () => {
  it('shows counts only from 3', () => {
    expect(safeCount(0)).toBeNull();
    expect(safeCount(2)).toBeNull();
    expect(safeCount(3)).toBe(3);
  });

  it('merges small buckets into "other" and suppresses a merged bucket below 3', () => {
    const b = kBreakdown(['a', 'a', 'a', 'b', 'c', 'd', null]);
    // b, c, d and the unknown value: 4 cases in buckets of 1 → merged "other" (4)
    expect(b.buckets).toEqual([
      { key: 'a', count: 3 },
      { key: 'other', count: 4 },
    ]);
    expect(b.suppressed).toBe(false);

    const s = kBreakdown(['a', 'a', 'a', 'b', 'c']);
    expect(s.buckets).toEqual([{ key: 'a', count: 3 }]);
    expect(s.suppressed).toBe(true);

    const u = kBreakdown([null, null, null, 'x']);
    expect(u.buckets).toEqual([{ key: 'unspecified', count: 3 }]);
    expect(u.suppressed).toBe(true);
  });

  it('a value literally called "other" cannot hide inside the merged bucket count', () => {
    const b = kBreakdown(['other', 'x', 'y']);
    expect(b.buckets).toEqual([{ key: 'other', count: 3 }]);
  });

  it('stage statistics need 3 samples', () => {
    expect(stageStat([1, 2])).toBeNull();
    expect(stageStat([1, 2, 6])).toEqual({ mean: 3, median: 2, n: 3 });
    expect(stageStat([1, 2, 3, 10])).toEqual({ mean: 4, median: 2.5, n: 4 });
  });

  it('trend only when both quarters have ≥ 3', () => {
    expect(trendOf(null, 5)).toBeNull();
    expect(trendOf(5, null)).toBeNull();
    expect(trendOf(6, 4)).toEqual({ delta: 2, percent: 50 });
  });

  it('a quarter with fewer than 3 cases shows nothing but "fewer than 3"', () => {
    const s = buildQuarterStats({ year: 2026, quarter: 3, current: rows(2), previous: rows(5) });
    expect(s.approved).toBeNull();
    expect(s.trend).toBeNull();
    expect(s.breakdowns.profession.buckets).toEqual([]);
    expect(s.breakdowns.profession.suppressed).toBe(true);
    expect(s.stages).toEqual({});
    expect(s.previous.approved).toBe(5);
    expect(satisfiesK(s)).toBe(true);
  });

  it('builds breakdowns, stages and trends that all satisfy k ≥ 3', () => {
    const current = [
      ...rows(4, { profession: 'truck_driver', state: 'BY', visaType: 'WORK' }),
      ...rows(3, { profession: 'nurse', state: 'NW', visaType: 'WORK', germanLevel: 'B1' }),
      row({ profession: 'cook', state: 'HH', visaType: 'AUSBILDUNG', samples: { total: 50 } }),
      row({ profession: 'welder', state: null, visaType: 'STUDY', samples: {} }),
    ];
    const s = buildQuarterStats({ year: 2026, quarter: 3, current, previous: rows(6), now: new Date('2026-10-05T10:00:00Z') });
    expect(s.approved).toBe(9);
    expect(s.trend).toEqual({ delta: 3, percent: 50 });
    expect(s.breakdowns.profession.buckets).toEqual([
      { key: 'truck_driver', count: 4 },
      { key: 'nurse', count: 3 },
    ]);
    expect(s.breakdowns.profession.suppressed).toBe(true);
    expect(s.breakdowns.visaType.buckets).toEqual([{ key: 'WORK', count: 7 }]);
    expect(s.breakdowns.visaType.suppressed).toBe(true);
    expect(s.stages.total).toEqual({ mean: 71.9, median: 75, n: 8 });
    expect(s.stages.decision?.n).toBe(7);
    expect(satisfiesK(s)).toBe(true);
  });

  it('counts each case once', () => {
    const one = row();
    const s = buildQuarterStats({ year: 2026, quarter: 3, current: [one, one, one], previous: [] });
    expect(s.approved).toBeNull();
  });
});

describe('quarterly report: quarters', () => {
  it('uses Baku-time boundaries', () => {
    const { from, to } = quarterRange(2026, 3);
    expect(from.toISOString()).toBe('2026-06-30T20:00:00.000Z');
    expect(to.toISOString()).toBe('2026-09-30T20:00:00.000Z');
    expect(previousQuarter(2026, 1)).toEqual({ year: 2025, quarter: 4 });
    expect(lastCompletedQuarter(new Date('2026-11-16T12:00:00Z'))).toEqual({ year: 2026, quarter: 3 });
    expect(lastCompletedQuarter(new Date('2026-12-31T21:00:00Z'))).toEqual({ year: 2026, quarter: 4 });
  });
});

describe('quarterly report: PDF', () => {
  it('renders in every report language', async () => {
    const s = buildQuarterStats({ year: 2026, quarter: 3, current: [...rows(4), ...rows(3, { profession: 'nurse' })], previous: rows(3) });
    for (const lang of ['az', 'en', 'de'] as const) {
      const buf = await buildQuarterlyReportPdf(s, lang, 'Ölkələr arası əmək miqrasiyası — Überblick.', { name: 'Triad Vision', domain: 'triad-vision.de', phone: '+994 51 414 14 01' });
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    }
    expect(bucketLabel('de', 'state', 'BY')).toBe('Bayern');
    expect(bucketLabel('en', 'profession', 'other')).toMatch(/Other/);
  });
});
