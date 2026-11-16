import { describe, expect, it } from 'vitest';
import { HOLIDAY_YEARS, addDays, holidayDays, holidayRange, holidaysFor, upcomingHolidays } from './holidays';

describe('Azerbaijani public holidays', () => {
  it('has the 2026 dates of Cabinet of Ministers decision No. 362', () => {
    const y = holidaysFor(2026);
    const get = (k: string) => y.find((h) => h.key === k)!;
    expect(get('novruz')).toMatchObject({ start: '2026-03-20', end: '2026-03-24', status: 'decree' });
    expect(get('ramazan')).toMatchObject({ start: '2026-03-20', end: '2026-03-21', status: 'decree' });
    expect(get('qurban')).toMatchObject({ start: '2026-05-27', end: '2026-05-28', status: 'decree' });
    expect(holidayDays(get('novruz'))).toBe(5);
  });

  it('marks 2027 religious holidays as estimates and keeps fixed dates fixed', () => {
    const y = holidaysFor(2027);
    for (const k of ['ramazan', 'qurban', 'novruz']) expect(y.find((h) => h.key === k)?.status, k).toBe('estimated');
    expect(y.find((h) => h.key === 'independence')).toMatchObject({ start: '2027-05-28', end: '2027-05-28', status: 'fixed' });
    expect(y.find((h) => h.key === 'newYear')).toMatchObject({ start: '2027-01-01', end: '2027-01-02' });
  });

  it('returns each year sorted by date, every date inside its year', () => {
    for (const year of HOLIDAY_YEARS) {
      const list = holidaysFor(year);
      expect(list.length).toBe(13);
      for (let i = 1; i < list.length; i++) expect(list[i].start >= list[i - 1].start).toBe(true);
      for (const h of list) {
        expect(h.start.startsWith(String(year)), h.key).toBe(true);
        expect(h.end >= h.start, h.key).toBe(true);
      }
    }
  });

  it('lists upcoming holidays from a date', () => {
    const next = upcomingHolidays('2026-11-16', 3);
    expect(next.map((h) => h.key)).toEqual(['solidarity', 'newYear', 'mourning']);
    expect(next[1].start).toBe('2027-01-01');
  });

  it('formats date ranges deterministically', () => {
    expect(holidayRange({ start: '2026-03-20', end: '2026-03-24' })).toBe('20.–24.03.2026');
    expect(holidayRange({ start: '2026-11-08', end: '2026-11-08' })).toBe('08.11.2026');
    expect(holidayRange({ start: '2026-12-31', end: '2027-01-01' })).toBe('31.12.2026 – 01.01.2027');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
