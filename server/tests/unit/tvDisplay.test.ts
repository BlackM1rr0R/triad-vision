import { describe, expect, it } from 'vitest';
import { bakuDayWindow, bakuMonthWindow, bakuWeekWindow, daysBetween, maskFullName, maskName, tvText } from '../../src/lib/tvDisplay/mask.js';

// Office TV mode (lib/tvDisplay/mask.ts): people appear only as "first name + initial"; Baku time windows.

describe('maskName', () => {
  it('keeps the first given name and the initial of the family name', () => {
    expect(maskName('Aysel', 'Məmmədova')).toBe('Aysel M.');
    expect(maskName('Elçin', 'Əliyev')).toBe('Elçin Ə.');
    expect(maskName('Şahin', 'Şükürov')).toBe('Şahin Ş.');
  });

  it('drops a second given name and extra whitespace', () => {
    expect(maskName('  Aysel   Gül ', '  Hüseynova  ')).toBe('Aysel H.');
  });

  it('uses Azerbaijani upper case for the initial and the first letter', () => {
    expect(maskName('ilkin', 'ismayılov')).toBe('İlkin İ.');
  });

  it('never leaks more than one letter of the family name', () => {
    const out = maskName('Nigar', 'Quliyeva-Rzayeva');
    expect(out).toBe('Nigar Q.');
    expect(out).not.toContain('uliyeva');
    expect(out).not.toContain('Rzayeva');
  });

  it('works with Cyrillic and Latin names', () => {
    expect(maskName('Иван', 'Петров')).toBe('Иван П.');
    expect(maskName('anna', 'schmidt')).toBe('Anna S.');
  });

  it('removes digits, e-mail fragments and punctuation', () => {
    expect(maskName('aysel@example.com', 'X')).toBe('Aysel X.');
    expect(maskName('Ali123', '(Həsənov)')).toBe('Ali H.');
    expect(maskName('Ali', '123 Babayev')).toBe('Ali B.');
  });

  it('degrades gracefully when parts are missing', () => {
    expect(maskName('Aysel', '')).toBe('Aysel');
    expect(maskName('Aysel', null)).toBe('Aysel');
    expect(maskName('', 'Məmmədova')).toBe('M.');
    expect(maskName(undefined, undefined)).toBe('');
    expect(maskName('123', '!!!')).toBe('');
  });

  it('caps very long given names', () => {
    expect(Array.from(maskName('A'.repeat(60), 'B').split(' ')[0]).length).toBe(20);
  });
});

describe('maskFullName', () => {
  it('masks a name typed as one string (inquiry contact)', () => {
    expect(maskFullName('Aysel Gül Məmmədova')).toBe('Aysel M.');
    expect(maskFullName('Rauf')).toBe('Rauf');
    expect(maskFullName('   ')).toBe('');
    expect(maskFullName(null)).toBe('');
  });
});

describe('tvText', () => {
  it('strips contact fragments and caps the length', () => {
    expect(tvText('Kaynak ustası, tel +994 50 123 45 67')).toBe('Kaynak ustası, tel');
    expect(tvText('aşpaz info@x.az https://x.az/a')).toBe('aşpaz');
    expect(tvText('x'.repeat(80), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(tvText('')).toBeNull();
    expect(tvText(null)).toBeNull();
  });
});

describe('Baku windows', () => {
  it('day: 2026-11-15 21:30Z is already 16 November in Baku', () => {
    const w = bakuDayWindow(new Date('2026-11-15T21:30:00Z'));
    expect(w.key).toBe('2026-11-16');
    expect(w.start.toISOString()).toBe('2026-11-15T20:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-11-16T20:00:00.000Z');
  });

  it('week: Monday to Monday in Baku time', () => {
    // Sunday 15 November 2026, 12:00 Baku
    const w = bakuWeekWindow(new Date('2026-11-15T08:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-11-08T20:00:00.000Z'); // Mon 9 Nov 00:00 Baku
    expect(w.end.toISOString()).toBe('2026-11-15T20:00:00.000Z');
    // Monday 16 November 00:30 Baku starts a new week
    expect(bakuWeekWindow(new Date('2026-11-15T20:30:00Z')).start.toISOString()).toBe('2026-11-15T20:00:00.000Z');
  });

  it('month: 1 December 01:00 Baku belongs to December', () => {
    const w = bakuMonthWindow(new Date('2026-11-30T21:00:00Z'));
    expect(w.key).toBe('2026-12');
    expect(w.start.toISOString()).toBe('2026-11-30T20:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-12-31T20:00:00.000Z');
    expect(bakuMonthWindow(new Date('2026-11-15T10:00:00Z')).key).toBe('2026-11');
  });

  it('daysBetween counts whole days and never goes negative', () => {
    expect(daysBetween(new Date('2026-11-10T10:00:00Z'), new Date('2026-11-15T09:00:00Z'))).toBe(4);
    expect(daysBetween(new Date('2026-11-16T00:00:00Z'), new Date('2026-11-15T00:00:00Z'))).toBe(0);
  });
});
