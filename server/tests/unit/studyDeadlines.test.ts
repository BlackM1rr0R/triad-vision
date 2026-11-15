import { describe, expect, it } from 'vitest';
import {
  addMonths,
  berlinToday,
  closesWithinMonths,
  formatDeadlines,
  intakeYear,
  isSoon,
  nextDeadline,
  occurrence,
  parseDeadlines,
  readDeadlines,
  upcomingDeadlines,
  type Deadline,
} from '../../src/lib/study/deadlines.js';

const d = (intake: 'WINTER' | 'SUMMER', to: string, from: string | null = null, note: string | null = null): Deadline => ({ intake, from, to, note });
const day = (s: string) => {
  const [y, m, dd] = s.split('-').map(Number);
  return { y, m, d: dd };
};

describe('study deadlines: next occurrence', () => {
  it('this year when still ahead (today counts), else next year', () => {
    const today = day('2026-11-15');
    expect(occurrence(d('SUMMER', '11-15'), today)).toMatchObject({ closes: '2026-11-15', daysLeft: 0 });
    expect(occurrence(d('SUMMER', '11-30'), today)).toMatchObject({ closes: '2026-11-30', daysLeft: 15, intakeYear: 2027 });
    expect(occurrence(d('WINTER', '05-31'), today)).toMatchObject({ closes: '2027-05-31', daysLeft: 197, intakeYear: 2027 });
    expect(occurrence(d('WINTER', '11-14'), today).closes).toBe('2027-11-14');
  });

  it('window start: same year, or the year before when the window crosses new year', () => {
    const today = day('2026-11-15');
    // RWTH-style 1 Dec – 1 Mar: closes 2027-03-01, opened 2026-12-01 (not yet open today)
    expect(occurrence(d('WINTER', '03-01', '12-01'), today)).toMatchObject({ closes: '2027-03-01', opens: '2026-12-01', open: false, intakeYear: 2027 });
    // Stuttgart-style 15 Nov – 15 Jan: open from today
    expect(occurrence(d('WINTER', '01-15', '11-15'), today)).toMatchObject({ closes: '2027-01-15', opens: '2026-11-15', open: true, daysLeft: 61 });
    // Freiburg summer 1 Nov – 15 Dec: open
    expect(occurrence(d('SUMMER', '12-15', '11-01'), today)).toMatchObject({ closes: '2026-12-15', opens: '2026-11-01', open: true, intakeYear: 2027 });
    // no start known
    expect(occurrence(d('WINTER', '07-15'), today).open).toBeNull();
  });

  it('29 February: clamped to 28 Feb outside leap years', () => {
    expect(occurrence(d('SUMMER', '02-29'), day('2026-03-10')).closes).toBe('2027-02-28');
    expect(occurrence(d('SUMMER', '02-29'), day('2027-03-10')).closes).toBe('2028-02-29');
    expect(occurrence(d('SUMMER', '02-29'), day('2028-02-29')).daysLeft).toBe(0);
  });

  it('intake year: winter starts in October, summer in April', () => {
    expect(intakeYear('WINTER', day('2027-07-15'))).toBe(2027);
    expect(intakeYear('WINTER', day('2027-01-15'))).toBe(2027);
    expect(intakeYear('WINTER', day('2026-10-15'))).toBe(2027);
    expect(intakeYear('SUMMER', day('2027-01-15'))).toBe(2027);
    expect(intakeYear('SUMMER', day('2026-11-30'))).toBe(2027);
    expect(intakeYear('SUMMER', day('2027-03-31'))).toBe(2027);
  });

  it('sorted soonest first; next deadline; "soon" within 30 days; invalid stored entries dropped', () => {
    const raw = [d('WINTER', '05-31', '02-01'), d('SUMMER', '11-30', '10-01'), { intake: 'SPRING', to: '13-40' }, 'junk'];
    const today = day('2026-11-15');
    expect(readDeadlines(raw)).toHaveLength(2);
    expect(upcomingDeadlines(raw, today).map((o) => o.intake)).toEqual(['SUMMER', 'WINTER']);
    const next = nextDeadline(raw, today)!;
    expect(next.closes).toBe('2026-11-30');
    expect(isSoon(next)).toBe(true);
    expect(isSoon(occurrence(d('WINTER', '05-31'), today))).toBe(false);
    expect(nextDeadline([], today)).toBeNull();
    expect(nextDeadline(null, today)).toBeNull();
  });

  it('"deadline within N months"', () => {
    const today = day('2026-11-15');
    const dec = occurrence(d('SUMMER', '12-15'), today);
    const may = occurrence(d('WINTER', '05-31'), today);
    expect(closesWithinMonths(dec, today, 1)).toBe(true);
    expect(closesWithinMonths(may, today, 3)).toBe(false);
    expect(closesWithinMonths(may, today, 6)).toBe(false); // 31 May > 15 May
    expect(closesWithinMonths(may, today, 12)).toBe(true);
    expect(closesWithinMonths(null, today, 12)).toBe(false);
    expect(addMonths(day('2026-08-31'), 6)).toEqual({ y: 2027, m: 2, d: 28 });
    expect(addMonths(day('2026-11-15'), 2)).toEqual({ y: 2027, m: 1, d: 15 });
  });

  it("today's date is the German calendar date", () => {
    expect(berlinToday(new Date('2026-12-31T22:30:00Z'))).toEqual({ y: 2026, m: 12, d: 31 }); // 23:30 in Berlin (CET)
    expect(berlinToday(new Date('2026-12-31T23:30:00Z'))).toEqual({ y: 2027, m: 1, d: 1 }); // 00:30 in Berlin, still 31 Dec in UTC
    expect(berlinToday(new Date('2026-07-01T21:59:00Z'))).toEqual({ y: 2026, m: 7, d: 1 }); // 23:59 CEST
    expect(berlinToday(new Date('2026-07-01T22:00:00Z'))).toEqual({ y: 2026, m: 7, d: 2 });
  });
});

describe('study deadlines: CSV notation', () => {
  it('round-trips', () => {
    const list = [d('WINTER', '05-31', '04-01', 'non-EU'), d('SUMMER', '11-30')];
    const cell = formatDeadlines(list);
    expect(cell).toBe('winter:04-01..05-31 non-EU | summer:11-30');
    expect(parseDeadlines(cell)).toEqual({ ok: true, value: list });
  });

  it('accepts ws / ss, "..to" and spaces; empty cell = no deadlines', () => {
    expect(parseDeadlines('WS: 07-15 | SS:..01-15')).toEqual({ ok: true, value: [d('WINTER', '07-15'), d('SUMMER', '01-15')] });
    expect(parseDeadlines('')).toEqual({ ok: true, value: [] });
  });

  it('rejects bad formats and impossible dates', () => {
    expect(parseDeadlines('autumn:07-15').ok).toBe(false);
    expect(parseDeadlines('winter:15.07.').ok).toBe(false);
    expect(parseDeadlines('winter:02-30').ok).toBe(false);
    expect(parseDeadlines('winter:13-01').ok).toBe(false);
    expect(parseDeadlines('winter:02-29').ok).toBe(true);
  });
});
