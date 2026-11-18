import { describe, expect, it } from 'vitest';
import { commaBeforeWeekday, formatAzDayUtc } from './azIntl';

// QA PUB-4: Azerbaijani dates with a weekday must be the same text on the server (Node, full ICU) and in Chrome
// (no az data → lib/azIntl polyfill), or React throws the server markup away.
const icu = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('az', { ...o, timeZone: 'UTC' }).format(d);

describe('formatAzDayUtc', () => {
  const days = Array.from({ length: 366 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i, 12)));
  it.each([
    [{ weekday: 'long', month: 'long', year: true }, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }],
    [{ weekday: 'short', month: 'long' }, { weekday: 'short', day: 'numeric', month: 'long' }],
    [{ month: 'long', year: true }, { day: 'numeric', month: 'long', year: 'numeric' }],
  ] as const)('matches Node ICU for %o', (mine, intl) => {
    for (const d of days) expect(formatAzDayUtc(d, mine)).toBe(icu(d, intl));
  });

  it('writes the phrase-of-the-day dates', () => {
    expect(formatAzDayUtc(new Date('2026-11-18T12:00:00Z'), { weekday: 'long', month: 'long', year: true })).toBe('18 noyabr 2026, çərşənbə');
    expect(formatAzDayUtc(new Date('2026-11-17T12:00:00Z'), { weekday: 'short', month: 'long' })).toBe('17 noyabr, Ç.a.');
  });
});

describe('commaBeforeWeekday (polyfill)', () => {
  const tr = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('tr', { ...o, timeZone: 'UTC' }).formatToParts(new Date('2026-11-18T12:00:00Z'));
  const join = (p: Intl.DateTimeFormatPart[]) => p.map((x) => x.value).join('');

  it('adds the comma ICU az puts between the date and the weekday', () => {
    expect(join(commaBeforeWeekday(tr({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })))).toBe('18 Kasım 2026, Çarşamba');
  });

  it('leaves a weekday alone and other patterns untouched', () => {
    expect(join(commaBeforeWeekday(tr({ weekday: 'long' })))).toBe('Çarşamba');
    expect(join(commaBeforeWeekday(tr({ day: 'numeric', month: 'long' })))).toBe('18 Kasım');
  });
});
