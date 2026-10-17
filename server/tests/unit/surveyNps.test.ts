import { describe, expect, it } from 'vitest';
import { averageRatings, monthRange, monthlyTrend, npsCategory, npsOf, parseRatings, responseRate, summarize } from '../../src/lib/surveys/nps.js';

describe('NPS maths', () => {
  it('classifies scores into promoters, passives and detractors', () => {
    expect([0, 6, 7, 8, 9, 10].map(npsCategory)).toEqual(['detractor', 'detractor', 'passive', 'passive', 'promoter', 'promoter']);
  });

  it('computes NPS as % promoters minus % detractors', () => {
    // 5 promoters, 3 passives, 2 detractors → 50 % − 20 % = 30
    expect(npsOf([10, 9, 9, 10, 9, 7, 8, 7, 3, 6])).toEqual({ total: 10, promoters: 5, passives: 3, detractors: 2, score: 30 });
    expect(npsOf([0, 1, 2]).score).toBe(-100);
    expect(npsOf([9, 10]).score).toBe(100);
    expect(npsOf([7, 8]).score).toBe(0);
  });

  it('rounds and ignores invalid values', () => {
    expect(npsOf([10, 10, 0]).score).toBe(33);
    expect(npsOf([null, undefined, 11, -1, Number.NaN, 9])).toMatchObject({ total: 1, score: 100 });
    expect(npsOf([])).toEqual({ total: 0, promoters: 0, passives: 0, detractors: 0, score: null });
  });

  it('averages ratings per key with one decimal and ignores junk', () => {
    expect(parseRatings({ communication: 5, speed: 0, clarity: 3.5, support: '4', extra: 5 })).toEqual({ communication: 5 });
    expect(averageRatings([{ communication: 5, speed: 4 }, { communication: 4 }, null, { communication: 4, support: 1 }])).toEqual({
      communication: 4.3,
      speed: 4,
      clarity: null,
      support: 1,
    });
  });

  it('response rate and summary', () => {
    expect(responseRate(0, 0)).toBeNull();
    expect(responseRate(3, 1)).toBe(0.333);
    const d = new Date('2026-05-10T00:00:00Z');
    const s = summarize([
      { sentAt: d, answeredAt: d, score: 10, ratings: { speed: 5 } },
      { sentAt: d, answeredAt: null, score: null, ratings: null },
      { sentAt: d, answeredAt: d, score: 4, ratings: { speed: 3 } },
      { sentAt: d, answeredAt: d, score: 8, ratings: null },
    ]);
    expect(s).toMatchObject({ sent: 4, answered: 3, responseRate: 0.75, nps: { score: 0, promoters: 1, detractors: 1, passives: 1 } });
    expect(s.ratings.speed).toBe(4);
  });

  it('monthly trend covers every month in range', () => {
    expect(monthRange(new Date('2025-11-15T00:00:00Z'), new Date('2026-02-01T00:00:00Z'))).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    const trend = monthlyTrend(
      [
        { sentAt: new Date('2026-01-03T00:00:00Z'), answeredAt: new Date('2026-01-04T00:00:00Z'), score: 10, ratings: null },
        { sentAt: new Date('2026-01-20T00:00:00Z'), answeredAt: null, score: null, ratings: null },
        { sentAt: new Date('2026-03-02T00:00:00Z'), answeredAt: new Date('2026-03-03T00:00:00Z'), score: 2, ratings: null },
      ],
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-03-31T00:00:00Z'),
    );
    expect(trend).toEqual([
      { month: '2026-01', sent: 2, answered: 1, nps: 100 },
      { month: '2026-02', sent: 0, answered: 0, nps: null },
      { month: '2026-03', sent: 1, answered: 1, nps: -100 },
    ]);
  });
});
