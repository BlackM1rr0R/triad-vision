import { describe, expect, it } from 'vitest';
import { freeWindows, generateSlots, isBookable, slotView, validRule, type AvailabilityRule } from '../../src/lib/ops/interviewSlots.js';

const at = (iso: string) => new Date(iso);
const iso = (slots: { start: Date }[]) => slots.map((s) => s.start.toISOString());
const opts = (from: string, to: string, extra: Partial<Parameters<typeof generateSlots>[2]> = {}) => ({
  slotMinutes: 60,
  bufferMinutes: 0,
  minNoticeMinutes: 0,
  from: at(from),
  to: at(to),
  now: at('2026-01-01T00:00:00Z'),
  ...extra,
});

// Monday 09:00–12:00 German time, every week.
const mondayMorning: AvailabilityRule[] = [{ kind: 'WEEKLY', weekday: 1, startTime: '09:00', endTime: '12:00' }];

describe('interview slots across the October DST change (Europe/Berlin vs Asia/Baku)', () => {
  it('keeps the German wall-clock time and shifts the Baku time by an hour', () => {
    // 2026-10-19 is a Monday in summer time (UTC+2), 2026-10-26 the Monday after the change (UTC+1).
    const slots = generateSlots(mondayMorning, [], opts('2026-10-19T00:00:00Z', '2026-10-27T00:00:00Z'));
    expect(iso(slots)).toEqual([
      '2026-10-19T07:00:00.000Z',
      '2026-10-19T08:00:00.000Z',
      '2026-10-19T09:00:00.000Z',
      '2026-10-26T08:00:00.000Z',
      '2026-10-26T09:00:00.000Z',
      '2026-10-26T10:00:00.000Z',
    ]);
    expect(slotView(slots[0])).toMatchObject({ berlin: { day: '2026-10-19', time: '09:00', until: '10:00' }, baku: { day: '2026-10-19', time: '11:00', until: '12:00' } });
    expect(slotView(slots[3])).toMatchObject({ berlin: { day: '2026-10-26', time: '09:00' }, baku: { day: '2026-10-26', time: '12:00' } });
  });

  it('handles the March change too (UTC+1 → UTC+2)', () => {
    // 2026-03-23 and 2026-03-30 are Mondays; the clocks go forward on Sunday 2026-03-29.
    const slots = generateSlots(mondayMorning, [], opts('2026-03-23T00:00:00Z', '2026-03-31T00:00:00Z', { slotMinutes: 180 }));
    expect(iso(slots)).toEqual(['2026-03-23T08:00:00.000Z', '2026-03-30T07:00:00.000Z']);
    expect(slotView(slots[0]).baku.time).toBe('12:00');
    expect(slotView(slots[1]).baku.time).toBe('11:00');
  });

  it('a window across the night of the change is one real hour longer', () => {
    // Sunday 2026-10-25 01:00–04:00 German time: 01:00 CEST = 23:00 UTC, 04:00 CET = 03:00 UTC → 4 hours.
    const night: AvailabilityRule[] = [{ kind: 'DATE', day: '2026-10-25', startTime: '01:00', endTime: '04:00' }];
    const w = freeWindows(night, at('2026-10-24T00:00:00Z'), at('2026-10-26T00:00:00Z'));
    expect(w).toHaveLength(1);
    expect(w[0].start.toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(w[0].end.toISOString()).toBe('2026-10-25T03:00:00.000Z');
    expect(generateSlots(night, [], opts('2026-10-24T00:00:00Z', '2026-10-26T00:00:00Z'))).toHaveLength(4);
  });

  it('a German evening slot falls on the next day in Baku', () => {
    const late: AvailabilityRule[] = [{ kind: 'DATE', day: '2026-12-01', startTime: '21:00', endTime: '24:00' }];
    const slots = generateSlots(late, [], opts('2026-12-01T00:00:00Z', '2026-12-03T00:00:00Z'));
    expect(slots).toHaveLength(3);
    expect(slotView(slots[0])).toMatchObject({ berlin: { day: '2026-12-01', time: '21:00' }, baku: { day: '2026-12-02', time: '00:00' } });
    expect(slots[2].end.toISOString()).toBe('2026-12-01T23:00:00.000Z');
  });
});

describe('interview slot rules', () => {
  const from = '2026-11-02T00:00:00Z'; // Monday (winter time)
  const to = '2026-11-03T00:00:00Z';

  it('steps by slot length plus buffer and drops slots touching busy time (with the buffer)', () => {
    const base = generateSlots(mondayMorning, [], opts(from, to, { slotMinutes: 45, bufferMinutes: 15 }));
    // 09:00, 10:00, 11:00 German = 08:00, 09:00, 10:00 UTC (11:00–11:45 still fits before 12:00).
    expect(iso(base)).toEqual(['2026-11-02T08:00:00.000Z', '2026-11-02T09:00:00.000Z', '2026-11-02T10:00:00.000Z']);
    // An existing interview 09:50–10:20 UTC: the 09:00 slot (ends 09:45, + 15 min buffer) and the 10:00 slot both clash.
    const busy = [{ start: at('2026-11-02T09:50:00Z'), end: at('2026-11-02T10:20:00Z') }];
    expect(iso(generateSlots(mondayMorning, busy, opts(from, to, { slotMinutes: 45, bufferMinutes: 15 })))).toEqual(['2026-11-02T08:00:00.000Z']);
    // Without a buffer only true overlaps count; touching ends are fine.
    const touching = [{ start: at('2026-11-02T09:00:00Z'), end: at('2026-11-02T10:00:00Z') }];
    expect(iso(generateSlots(mondayMorning, touching, opts(from, to)))).toEqual(['2026-11-02T08:00:00.000Z', '2026-11-02T10:00:00.000Z']);
  });

  it('honours the minimum notice and the window end', () => {
    const now = at('2026-11-01T08:30:00Z');
    expect(iso(generateSlots(mondayMorning, [], opts(from, to, { now, minNoticeMinutes: 24 * 60 })))).toEqual(['2026-11-02T09:00:00.000Z', '2026-11-02T10:00:00.000Z']);
    expect(iso(generateSlots(mondayMorning, [], opts(from, '2026-11-02T10:00:00Z')))).toEqual(['2026-11-02T08:00:00.000Z', '2026-11-02T09:00:00.000Z']);
  });

  it('adds one-off hours, merges overlapping rules and subtracts blocks', () => {
    const rules: AvailabilityRule[] = [
      ...mondayMorning,
      { kind: 'WEEKLY', weekday: 1, startTime: '11:00', endTime: '13:00' }, // overlaps → one 09–13 window
      { kind: 'DATE', day: '2026-11-03', startTime: '14:00', endTime: '15:00' }, // Tuesday one-off
      { kind: 'BLOCK', day: '2026-11-02', startTime: '10:00', endTime: '11:00' },
    ];
    expect(iso(generateSlots(rules, [], opts(from, '2026-11-04T00:00:00Z')))).toEqual([
      '2026-11-02T08:00:00.000Z',
      '2026-11-02T10:00:00.000Z',
      '2026-11-02T11:00:00.000Z',
      '2026-11-03T13:00:00.000Z',
    ]);
    // A whole-day block removes everything that day.
    expect(generateSlots([...rules, { kind: 'BLOCK', day: '2026-11-02' }], [], opts(from, to))).toEqual([]);
  });

  it('isBookable accepts only exact free slot starts', () => {
    const o = { slotMinutes: 60, bufferMinutes: 0, minNoticeMinutes: 0, now: at('2026-01-01T00:00:00Z'), to: at(to) };
    expect(isBookable(at('2026-11-02T09:00:00Z'), mondayMorning, [], o)).toBe(true);
    expect(isBookable(at('2026-11-02T09:30:00Z'), mondayMorning, [], o)).toBe(false);
    expect(isBookable(at('2026-11-02T09:00:00Z'), mondayMorning, [{ start: at('2026-11-02T09:15:00Z'), end: at('2026-11-02T09:30:00Z') }], o)).toBe(false);
  });

  it('validates rules', () => {
    expect(validRule({ kind: 'WEEKLY', weekday: 1, startTime: '09:00', endTime: '12:00' })).toBe(true);
    expect(validRule({ kind: 'WEEKLY', weekday: 0, startTime: '09:00', endTime: '12:00' })).toBe(false);
    expect(validRule({ kind: 'WEEKLY', weekday: 1 })).toBe(false);
    expect(validRule({ kind: 'DATE', day: '2026-11-02', startTime: '12:00', endTime: '09:00' })).toBe(false);
    expect(validRule({ kind: 'DATE', day: '2026-13-02', startTime: '09:00', endTime: '10:00' })).toBe(false);
    expect(validRule({ kind: 'BLOCK', day: '2026-11-02' })).toBe(true);
    expect(validRule({ kind: 'BLOCK', day: '2026-11-02', startTime: '09:00' })).toBe(false);
    expect(validRule({ kind: 'DATE', day: '2026-11-02', startTime: '23:00', endTime: '24:00' })).toBe(true);
  });
});
