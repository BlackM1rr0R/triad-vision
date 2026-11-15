import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { buildStatsTable, caseSamples, durationStat, MIN_GROUP_SAMPLE, resolveStat, type CaseRow } from '../../src/lib/whenInGermany/stats.js';
import { DEFAULTS_BY_TYPE } from '../../src/lib/journey/forecast.js';
import {
  DOC_FACTOR,
  EXAM_DAYS,
  HOURS_PER_WEEK,
  estimateWhen,
  gapHours,
  languageDays,
  monthAfter,
  recognitionNeeded,
  routeFor,
  whenQuerySchema,
} from '../../src/lib/whenInGermany/estimate.js';

/*
 * "When could I be in Germany?": duration statistics (percentiles, minimum sample, group fallbacks), the CEFR
 * language table, the documented fallbacks and the arrival-month date math.
 */

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-01-01T00:00:00Z');

/** A case that went through every stage: documents d, contract c, embassy e (two statuses), decision v (days). */
const fullCase = (o: { profession?: string; visaType?: CaseRow['visaType']; docs?: [number, number]; contract?: number; embassy?: number; decision?: number; status?: CaseStatus }): CaseRow => {
  const [pending, review] = o.docs ?? [10, 4];
  const seq: [CaseStatus, CaseStatus, number][] = [
    ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', pending],
    ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', review],
    ['CONTRACT_SENT', 'EMBASSY_DOCUMENTS', o.contract ?? 6],
    ['EMBASSY_DOCUMENTS', 'APPOINTMENT_SCHEDULED', (o.embassy ?? 40) / 2],
    ['APPOINTMENT_SCHEDULED', 'DECISION_PENDING', (o.embassy ?? 40) / 2],
    ['DECISION_PENDING', o.status === 'REJECTED' ? 'REJECTED' : 'APPROVED', o.decision ?? 30],
  ];
  let at = T0.getTime();
  const events = seq.map(([fromStatus, toStatus, d]) => {
    at += d * DAY;
    return { createdAt: new Date(at), fromStatus, toStatus };
  });
  return { createdAt: T0, status: o.status ?? 'APPROVED', visaType: o.visaType ?? 'WORK', profession: o.profession ?? 'LKW-Fahrer', events };
};

describe('durationStat', () => {
  it('gives the 25th percentile, median and 75th percentile (linear interpolation)', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    expect(durationStat(xs)).toEqual({ p25: 3.5, median: 6, p75: 8.5, n: 11 });
    // even count: the median is between the middle values
    expect(durationStat([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toEqual({ p25: 32.5, median: 55, p75: 77.5, n: 10 });
    // order does not matter, one decimal
    expect(durationStat([3.14159, 1, 2], 3)).toEqual({ p25: 1.5, median: 2, p75: 2.6, n: 3 });
  });

  it('needs the minimum sample size (10 by default) and ignores invalid values', () => {
    expect(MIN_GROUP_SAMPLE).toBe(10);
    expect(durationStat([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();
    expect(durationStat([1, 2, 3, 4, 5, 6, 7, 8, 9, NaN, -1])).toBeNull();
    expect(durationStat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])?.n).toBe(10);
    expect(durationStat([])).toBeNull();
  });
});

describe('caseSamples', () => {
  it('measures each stage from the status history, with the documents variants', () => {
    const s = caseSamples(fullCase({ docs: [10, 4], contract: 6, embassy: 40, decision: 30 }));
    expect(s.documents_none).toBeCloseTo(14);
    expect(s.documents_some).toBeCloseTo(9); // half the pending time + review
    expect(s.documents_complete).toBeCloseTo(4);
    expect(s.contract).toBeCloseTo(6);
    expect(s.embassy).toBeCloseTo(40);
    expect(s.decision).toBeCloseTo(30);
  });

  it('leaves out stages the case has not finished, and cancelled cases', () => {
    const c = fullCase({});
    const open: CaseRow = { ...c, status: 'APPOINTMENT_SCHEDULED', events: c.events.slice(0, 4) };
    const s = caseSamples(open);
    expect(s.documents_none).toBeDefined();
    expect(s.contract).toBeDefined();
    expect(s.embassy).toBeUndefined(); // still waiting for the appointment
    expect(s.decision).toBeUndefined();
    expect(caseSamples({ ...c, status: 'CANCELLED' })).toEqual({});
    // a rejected case has a decision time too
    expect(caseSamples(fullCase({ status: 'REJECTED', decision: 12 })).decision).toBeCloseTo(12);
  });
});

describe('stats table and fallbacks', () => {
  const drivers = (n: number, decision = 30) => Array.from({ length: n }, (_, i) => fullCase({ decision: decision + i }));
  const nurses = (n: number) => Array.from({ length: n }, (_, i) => fullCase({ profession: 'Pflegefachkraft', decision: 60 + i }));

  it('uses route × profession when it has ≥ 10 cases, else the route, else all cases, else nothing', () => {
    const table = buildStatsTable({ cases: [...drivers(12), ...nurses(4)], recognition: [], travel: [] });
    const truck = resolveStat(table, 'decision', 'WORK', 'driving');
    expect(truck?.level).toBe('route_profession');
    expect(truck?.stat.n).toBe(12);
    expect(truck?.stat.median).toBeCloseTo(35.5);
    // 4 nurses are too few → the whole WORK route (16 cases)
    const care = resolveStat(table, 'decision', 'WORK', 'care');
    expect(care?.level).toBe('route');
    expect(care?.stat.n).toBe(16);
    // Ausbildung has no cases → all cases
    expect(resolveStat(table, 'decision', 'AUSBILDUNG', null)?.level).toBe('all');
    // small groups never make it into the table at all
    expect(table['WORK|care']).toBeUndefined();
    expect(resolveStat(buildStatsTable({ cases: drivers(9), recognition: [], travel: [] }), 'decision', 'WORK', 'driving')).toBeNull();
  });

  it('marks stages without enough data as estimates and uses the documented constants', () => {
    const r = estimateWhen({ profession: 'driver', documents: 'some', german: 'A2' }, {}, new Date('2026-11-15T10:00:00Z'));
    const docs = r.stages.find((s) => s.key === 'documents')!;
    expect(docs.basis).toBe('estimate');
    expect(docs.sample).toBeNull();
    const [lo, hi] = DEFAULTS_BY_TYPE.WORK.DOCUMENTS;
    expect(docs.days).toEqual({ min: Math.round(lo * DOC_FACTOR.some), typical: Math.round(((lo + hi) / 2) * DOC_FACTOR.some), max: Math.round(hi * DOC_FACTOR.some) });
    const embassy = r.stages.find((s) => s.key === 'embassy')!;
    expect(embassy.days.min).toBe(DEFAULTS_BY_TYPE.WORK.EMBASSY[0] + DEFAULTS_BY_TYPE.WORK.APPOINTMENT[0]);
  });

  it('takes history figures (p25 / median / p75) when there are enough cases', () => {
    const table = buildStatsTable({ cases: drivers(11), recognition: [], travel: [] });
    const r = estimateWhen({ profession: 'driver', german: 'A2' }, table);
    const d = r.stages.find((s) => s.key === 'decision')!;
    expect(d.basis).toBe('history');
    expect(d.level).toBe('route_profession');
    expect(d.sample).toBe(11);
    expect(d.days).toEqual({ min: Math.round(32.5), typical: 35, max: Math.round(37.5) });
  });
});

describe('language (CEFR hours)', () => {
  it('computes the hours gap from the Goethe-Institut table', () => {
    expect(gapHours('none', 'B1')).toEqual({ min: 260, typical: 375, max: 490 });
    expect(gapHours('A2', 'B1')).toEqual({ min: 110, typical: 170, max: 230 });
    expect(gapHours('B1', 'A2')).toEqual({ min: 0, typical: 0, max: 0 });
    expect(gapHours('B1', 'B1')).toEqual({ min: 0, typical: 0, max: 0 });
  });

  it('turns hours into days at 20 / 15 / 10 hours a week plus the exam', () => {
    const d = languageDays('none', 'A2');
    expect(d.min).toBe(Math.round((150 / HOURS_PER_WEEK.min) * 7 + EXAM_DAYS.min));
    expect(d.typical).toBe(Math.round((205 / HOURS_PER_WEEK.typical) * 7 + EXAM_DAYS.typical));
    expect(d.max).toBe(Math.round((260 / HOURS_PER_WEEK.max) * 7 + EXAM_DAYS.max));
    expect(languageDays('B2', 'B1')).toEqual({ min: 0, typical: 0, max: 0 });
  });
});

describe('route and recognition', () => {
  it('takes the path finder best path unless a route is chosen', () => {
    expect(routeFor(whenQuerySchema.parse({ profession: 'driver' }))).toEqual({ route: 'drivers_19c', auto: true });
    expect(routeFor(whenQuerySchema.parse({ profession: 'driver', route: 'chancenkarte' }))).toEqual({ route: 'chancenkarte', auto: false });
    // unknown values fall back to the defaults
    expect(whenQuerySchema.parse({ profession: 'astronaut', route: 'x' })).toMatchObject({ profession: 'driver', route: 'auto' });
  });

  it('infers recognition from the route when unsure; the answer wins otherwise', () => {
    expect(recognitionNeeded('unsure', 'skilled_18b', 'care')).toEqual({ needed: true, inferred: true });
    expect(recognitionNeeded('unsure', 'skilled_18b', 'driver')).toEqual({ needed: false, inferred: true });
    expect(recognitionNeeded('unsure', 'ausbildung_16a', 'care')).toEqual({ needed: false, inferred: true });
    expect(recognitionNeeded('yes', 'ausbildung_16a', 'care')).toEqual({ needed: true, inferred: false });
    expect(recognitionNeeded('no', 'skilled_18b', 'care')).toEqual({ needed: false, inferred: false });
  });
});

describe('date math and timeline', () => {
  it('adds the days (rounded up) to today and gives the month', () => {
    const today = new Date('2026-11-15T10:00:00Z');
    expect(monthAfter(today, 0)).toBe('2026-11');
    expect(monthAfter(today, 15)).toBe('2026-11'); // 30 November
    expect(monthAfter(today, 16)).toBe('2026-12'); // 1 December
    expect(monthAfter(today, 15.2)).toBe('2026-12'); // part of a day counts as a day
    expect(monthAfter(today, 150)).toBe('2027-04'); // 14 April 2027
    expect(monthAfter(today, 365 + 47)).toBe('2028-01'); // across a year end
    expect(monthAfter(new Date('2028-01-31T23:00:00Z'), 29)).toBe('2028-02'); // leap year: 29 February
    expect(monthAfter(today, -5)).toBe('2026-11');
  });

  it('runs language, documents → recognition and documents → contract in parallel, then embassy, decision, travel', () => {
    const today = new Date('2026-11-15T10:00:00Z');
    const r = estimateWhen({ profession: 'care', education: 'vocational', german: 'A2', documents: 'none', recognition: 'yes', route: 'skilled_18b' }, {}, today);
    const st = Object.fromEntries(r.stages.map((s) => [s.key, s]));
    expect(r.targetLevel).toBe('B2'); // nurses on the skilled-worker route
    for (const k of ['min', 'typical', 'max'] as const) {
      expect(st.recognition.start[k]).toBe(st.documents.end[k]);
      expect(st.contract.start[k]).toBe(st.documents.end[k]);
      expect(st.embassy.start[k]).toBe(Math.max(st.language.end[k], st.recognition.end[k], st.contract.end[k]));
      expect(st.decision.start[k]).toBe(st.embassy.end[k]);
      expect(st.travel.start[k]).toBe(st.decision.end[k]);
      expect(r.totalDays[k]).toBe(st.travel.end[k]);
    }
    expect(r.totalDays.min).toBeLessThanOrEqual(r.totalDays.typical);
    expect(r.totalDays.typical).toBeLessThanOrEqual(r.totalDays.max);
    expect(r.arrival.typical).toBe(monthAfter(today, r.totalDays.typical));
    expect(st.language.basis).toBe('cefr');
  });

  it('skips stages that are not needed', () => {
    const r = estimateWhen({ profession: 'driver', german: 'B1', recognition: 'no', route: 'drivers_19c' }, {});
    const st = Object.fromEntries(r.stages.map((s) => [s.key, s]));
    expect(st.language.basis).toBe('skipped');
    expect(st.recognition.basis).toBe('skipped');
    expect(st.recognition.days).toEqual({ min: 0, typical: 0, max: 0 });
  });
});
