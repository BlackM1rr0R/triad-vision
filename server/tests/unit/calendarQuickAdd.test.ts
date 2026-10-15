import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '../../src/lib/calendar/quickAdd.js';

// Thursday 15 Oct 2026, 10:17 Baku time (06:17 UTC). Baku is UTC+4 all year.
const NOW = new Date('2026-10-15T06:17:00Z');
const opts = { now: NOW, tzOffsetMinutes: 240 };
const at = (local: string) => new Date(`${local}+04:00`).toISOString();

describe('quick add: dates and times in four languages', () => {
  it('az: "Görüş sabah 15:00 1 saat"', () => {
    const r = parseQuickAdd('Görüş sabah 15:00 1 saat', opts);
    expect(r.title).toBe('Görüş');
    expect(r.startsAt.toISOString()).toBe(at('2026-10-16T15:00:00'));
    expect(r.endsAt.toISOString()).toBe(at('2026-10-16T16:00:00'));
    expect(r.matched).toEqual({ date: true, time: true, duration: true });
  });

  it('en: "Meeting tomorrow 15:00 1h" and "Call with Hans at 3pm for 30 min"', () => {
    const r = parseQuickAdd('Meeting tomorrow 15:00 1h', opts);
    expect(r.title).toBe('Meeting');
    expect(r.startsAt.toISOString()).toBe(at('2026-10-16T15:00:00'));
    expect(r.endsAt.toISOString()).toBe(at('2026-10-16T16:00:00'));
    const c = parseQuickAdd('Call with Hans at 3pm for 30 min', opts);
    expect(c.title).toBe('Call with Hans');
    expect(c.startsAt.toISOString()).toBe(at('2026-10-15T15:00:00'));
    expect(c.endsAt.toISOString()).toBe(at('2026-10-15T15:30:00'));
  });

  it('de: "Treffen morgen 15:00" defaults to one hour; "Teamrunde Montag um 9 Uhr 2 Std"', () => {
    const r = parseQuickAdd('Treffen morgen 15:00', opts);
    expect(r.title).toBe('Treffen');
    expect(r.startsAt.toISOString()).toBe(at('2026-10-16T15:00:00'));
    expect(r.endsAt.toISOString()).toBe(at('2026-10-16T16:00:00'));
    const m = parseQuickAdd('Teamrunde Montag um 9 Uhr 2 Std', opts);
    expect(m.title).toBe('Teamrunde');
    expect(m.startsAt.toISOString()).toBe(at('2026-10-19T09:00:00'));
    expect(m.endsAt.toISOString()).toBe(at('2026-10-19T11:00:00'));
  });

  it('ru: "Встреча завтра в 15:00" and "Созвон в пятницу 11:30 45 мин"', () => {
    const r = parseQuickAdd('Встреча завтра в 15:00', opts);
    expect(r.title).toBe('Встреча');
    expect(r.startsAt.toISOString()).toBe(at('2026-10-16T15:00:00'));
    const f = parseQuickAdd('Созвон в пятницу 11:30 45 мин', opts);
    expect(f.title).toBe('Созвон');
    expect(f.startsAt.toISOString()).toBe(at('2026-10-16T11:30:00'));
    expect(f.endsAt.toISOString()).toBe(at('2026-10-16T12:15:00'));
  });

  it('weekday names: the same weekday means next week; multi-word Azerbaijani names win over prefixes', () => {
    expect(parseQuickAdd('Plan thursday 10:00', opts).startsAt.toISOString()).toBe(at('2026-10-22T10:00:00'));
    const az = parseQuickAdd('Hesabat bazar ertəsi 14:00', opts);
    expect(az.title).toBe('Hesabat');
    expect(az.startsAt.toISOString()).toBe(at('2026-10-19T14:00:00'));
    expect(parseQuickAdd('Yığıncaq çərşənbə axşamı 09:00', opts).startsAt.toISOString()).toBe(at('2026-10-20T09:00:00'));
    expect(parseQuickAdd('Yığıncaq çərşənbə 09:00', opts).startsAt.toISOString()).toBe(at('2026-10-21T09:00:00'));
  });

  it('explicit dates: 16.10, 16.10.2026, 2026-11-02; dotted times like 15.30 stay times', () => {
    expect(parseQuickAdd('Dentist 16.10 15:00', opts).startsAt.toISOString()).toBe(at('2026-10-16T15:00:00'));
    expect(parseQuickAdd('Dentist 20.10.2026 15.30', opts).startsAt.toISOString()).toBe(at('2026-10-20T15:30:00'));
    const iso = parseQuickAdd('Audit 2026-11-02', opts);
    expect(iso.startsAt.toISOString()).toBe(at('2026-11-02T09:00:00'));
    expect(iso.title).toBe('Audit');
  });

  it('time ranges and all-day events', () => {
    const r = parseQuickAdd('Workshop tomorrow 10:00-12:30', opts);
    expect(r.startsAt.toISOString()).toBe(at('2026-10-16T10:00:00'));
    expect(r.endsAt.toISOString()).toBe(at('2026-10-16T12:30:00'));
    const a = parseQuickAdd('Konfrans sabah bütün gün', opts);
    expect(a.allDay).toBe(true);
    expect(a.title).toBe('Konfrans');
    expect(a.startsAt.toISOString()).toBe(at('2026-10-16T00:00:00'));
    expect(a.endsAt.toISOString()).toBe(at('2026-10-17T00:00:00'));
  });

  it('falls back to the next full hour for an hour when nothing is understood', () => {
    const r = parseQuickAdd('Just a note', opts);
    expect(r.title).toBe('Just a note');
    expect(r.startsAt.toISOString()).toBe(at('2026-10-15T11:00:00'));
    expect(r.endsAt.toISOString()).toBe(at('2026-10-15T12:00:00'));
    expect(r.matched).toEqual({ date: false, time: false, duration: false });
  });

  it('a time already past today rolls over to tomorrow; a time only keeps the title clean', () => {
    const r = parseQuickAdd('Standup 09:00', opts);
    expect(r.startsAt.toISOString()).toBe(at('2026-10-16T09:00:00'));
    expect(r.title).toBe('Standup');
  });

  it('respects the caller time zone offset', () => {
    const berlin = parseQuickAdd('Call tomorrow 15:00', { now: NOW, tzOffsetMinutes: 120 });
    expect(berlin.startsAt.toISOString()).toBe('2026-10-16T13:00:00.000Z');
  });
});
