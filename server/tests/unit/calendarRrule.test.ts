import { describe, expect, it } from 'vitest';
import { expandOccurrences, expandRRule, formatRRule, parseRRule } from '../../src/lib/calendar/rrule.js';

const d = (s: string) => new Date(s);
const iso = (x: Date) => x.toISOString();

describe('rrule: parsing', () => {
  it('parses FREQ, INTERVAL, BYDAY, COUNT and UNTIL', () => {
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5')).toEqual({ freq: 'WEEKLY', interval: 2, byDay: ['MO', 'WE'], count: 5 });
    expect(parseRRule('RRULE:freq=daily;until=20261231T235959Z')).toEqual({ freq: 'DAILY', interval: 1, until: d('2026-12-31T23:59:59.000Z') });
    expect(parseRRule('FREQ=MONTHLY')).toEqual({ freq: 'MONTHLY', interval: 1 });
    expect(parseRRule('FREQ=YEARLY;UNTIL=20270101')).toEqual({ freq: 'YEARLY', interval: 1, until: d('2027-01-01T23:59:59.000Z') });
  });

  it('rejects unsupported or malformed rules', () => {
    expect(parseRRule('')).toBeNull();
    expect(parseRRule(null)).toBeNull();
    expect(parseRRule('FREQ=HOURLY')).toBeNull();
    expect(parseRRule('FREQ=MONTHLY;BYDAY=MO')).toBeNull();
    expect(parseRRule('FREQ=WEEKLY;BYDAY=XX')).toBeNull();
    expect(parseRRule('FREQ=DAILY;INTERVAL=0')).toBeNull();
    expect(parseRRule('FREQ=DAILY;COUNT=abc')).toBeNull();
    expect(parseRRule('FREQ=DAILY;BYMONTH=1')).toBeNull();
    expect(parseRRule('nonsense')).toBeNull();
  });

  it('formats rules back to text', () => {
    expect(formatRRule({ freq: 'WEEKLY', interval: 2, byDay: ['MO', 'FR'], count: 3 })).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=3');
    expect(formatRRule({ freq: 'DAILY', interval: 1, until: d('2026-12-31T20:00:00Z') })).toBe('FREQ=DAILY;UNTIL=20261231T200000Z');
  });
});

describe('rrule: expansion', () => {
  const start = d('2026-10-01T09:00:00Z'); // a Thursday

  it('daily with COUNT', () => {
    const out = expandRRule(start, parseRRule('FREQ=DAILY;COUNT=3')!);
    expect(out.map(iso)).toEqual(['2026-10-01T09:00:00.000Z', '2026-10-02T09:00:00.000Z', '2026-10-03T09:00:00.000Z']);
  });

  it('daily with INTERVAL and UNTIL', () => {
    const out = expandRRule(start, parseRRule('FREQ=DAILY;INTERVAL=3;UNTIL=20261010T090000Z')!);
    expect(out.map(iso)).toEqual(['2026-10-01T09:00:00.000Z', '2026-10-04T09:00:00.000Z', '2026-10-07T09:00:00.000Z', '2026-10-10T09:00:00.000Z']);
  });

  it('weekly without BYDAY repeats the start weekday', () => {
    const out = expandRRule(start, parseRRule('FREQ=WEEKLY;INTERVAL=2;COUNT=3')!);
    expect(out.map(iso)).toEqual(['2026-10-01T09:00:00.000Z', '2026-10-15T09:00:00.000Z', '2026-10-29T09:00:00.000Z']);
  });

  it('weekly BYDAY: the start is the first occurrence, then the listed weekdays', () => {
    const out = expandRRule(start, parseRRule('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4')!);
    // Thu 1 Oct (DTSTART), Mon 5, Wed 7, Mon 12
    expect(out.map(iso)).toEqual(['2026-10-01T09:00:00.000Z', '2026-10-05T09:00:00.000Z', '2026-10-07T09:00:00.000Z', '2026-10-12T09:00:00.000Z']);
  });

  it('weekly BYDAY with INTERVAL=2 skips every other week', () => {
    const out = expandRRule(d('2026-10-05T09:00:00Z'), parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=4')!);
    // Mon 5 (start), Fri 9, Mon 19, Fri 23
    expect(out.map(iso)).toEqual(['2026-10-05T09:00:00.000Z', '2026-10-09T09:00:00.000Z', '2026-10-19T09:00:00.000Z', '2026-10-23T09:00:00.000Z']);
  });

  it('monthly keeps the day of month and skips months without it', () => {
    const out = expandRRule(d('2026-01-31T10:00:00Z'), parseRRule('FREQ=MONTHLY;COUNT=3')!);
    expect(out.map(iso)).toEqual(['2026-01-31T10:00:00.000Z', '2026-03-31T10:00:00.000Z', '2026-05-31T10:00:00.000Z']);
  });

  it('yearly', () => {
    const out = expandRRule(d('2026-02-14T08:00:00Z'), parseRRule('FREQ=YEARLY;COUNT=2')!);
    expect(out.map(iso)).toEqual(['2026-02-14T08:00:00.000Z', '2027-02-14T08:00:00.000Z']);
  });

  it('only returns occurrences inside the window (and stops at COUNT)', () => {
    const out = expandRRule(start, parseRRule('FREQ=DAILY;COUNT=10')!, { from: d('2026-10-04T00:00:00Z'), to: d('2026-10-06T00:00:00Z') });
    expect(out.map(iso)).toEqual(['2026-10-04T09:00:00.000Z', '2026-10-05T09:00:00.000Z']);
    const late = expandRRule(start, parseRRule('FREQ=DAILY;COUNT=3')!, { from: d('2026-10-20T00:00:00Z'), to: d('2026-10-30T00:00:00Z') });
    expect(late).toEqual([]);
  });

  it('caps unbounded rules', () => {
    expect(expandRRule(start, parseRRule('FREQ=DAILY')!).length).toBe(2000);
  });
});

describe('rrule: occurrences with duration', () => {
  it('non-recurring events are returned when they overlap the window', () => {
    const s = d('2026-10-01T09:00:00Z');
    const e = d('2026-10-01T10:00:00Z');
    expect(expandOccurrences(s, e, null, d('2026-10-01T09:30:00Z'), d('2026-10-02T00:00:00Z'))).toEqual([{ start: s, end: e }]);
    expect(expandOccurrences(s, e, null, d('2026-10-01T10:00:00Z'), d('2026-10-02T00:00:00Z'))).toEqual([]);
  });

  it('recurring occurrences carry the duration and include one that started just before the window', () => {
    const out = expandOccurrences(d('2026-10-01T23:30:00Z'), d('2026-10-02T00:30:00Z'), 'FREQ=DAILY;COUNT=3', d('2026-10-03T00:00:00Z'), d('2026-10-04T00:00:00Z'));
    expect(out.map((o) => [iso(o.start), iso(o.end)])).toEqual([
      ['2026-10-02T23:30:00.000Z', '2026-10-03T00:30:00.000Z'],
      ['2026-10-03T23:30:00.000Z', '2026-10-04T00:30:00.000Z'],
    ]);
  });
});
