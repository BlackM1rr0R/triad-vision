import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERMIT_SETTINGS,
  EXPIRED_NOTICE_DAYS,
  parsePermitSettings,
  permitReminderKey,
  permitTone,
  permitWindow,
  titleItem,
} from '../../src/lib/permits/rules.js';
import { PERMIT_TEXTS } from '../../src/lib/permits/texts.js';

const DAY = 24 * 60 * 60 * 1000;
const expiry = new Date('2027-06-01T00:00:00Z');
const before = (days: number) => new Date(expiry.getTime() - days * DAY);
const W = [90, 60, 30];

describe('permit reminder windows', () => {
  it('defaults: 90 / 60 / 30 days for every item, the passport keeps its 6-month lead in front', () => {
    const w = DEFAULT_PERMIT_SETTINGS.windows;
    expect(w.residence).toEqual([90, 60, 30]);
    expect(w.blueCard).toEqual([90, 60, 30]);
    expect(w.insurance).toEqual([90, 60, 30]);
    expect(w.passport).toEqual([180, 90, 60, 30]);
  });

  it('picks the narrowest window, 0 once expired (only shortly after), null before the widest', () => {
    expect(permitWindow(W, expiry, before(120))).toBeNull();
    expect(permitWindow(W, expiry, before(90))).toBe(90);
    expect(permitWindow(W, expiry, before(61))).toBe(90);
    expect(permitWindow(W, expiry, before(60))).toBe(60);
    expect(permitWindow(W, expiry, before(20))).toBe(30); // entering late: only the narrowest
    expect(permitWindow(W, expiry, before(1))).toBe(30);
    expect(permitWindow(W, expiry, expiry)).toBe(0);
    expect(permitWindow(W, expiry, new Date(expiry.getTime() + (EXPIRED_NOTICE_DAYS - 1) * DAY))).toBe(0);
    expect(permitWindow(W, expiry, new Date(expiry.getTime() + (EXPIRED_NOTICE_DAYS + 1) * DAY))).toBeNull();
    expect(permitWindow([30, 90, 60], expiry, before(45))).toBe(60); // unsorted input
  });

  it('one ReminderLog key per item / subject / date / window; both title kinds share the key', () => {
    expect(permitReminderKey('residence', 'c1', expiry, 60)).toBe('permit:title:c1:2027-06-01:60');
    expect(permitReminderKey('blueCard', 'c1', expiry, 60)).toBe('permit:title:c1:2027-06-01:60');
    expect(permitReminderKey('passport', 'u1', expiry, 0)).toBe('permit:passport:u1:2027-06-01:0');
    expect(permitReminderKey('insurance', 'c1', before(1), 30)).toBe('permit:insurance:c1:2027-05-31:30');
  });

  it('title kind → item', () => {
    expect(titleItem('EU_BLUE_CARD')).toBe('blueCard');
    expect(titleItem('RESIDENCE_PERMIT')).toBe('residence');
    expect(titleItem(null)).toBe('residence');
  });

  it('tone: ok before the widest window, soon inside it, urgent inside the narrowest, expired', () => {
    expect(permitTone(W, expiry, before(100))).toBe('ok');
    expect(permitTone(W, expiry, before(70))).toBe('soon');
    expect(permitTone(W, expiry, before(10))).toBe('urgent');
    expect(permitTone(W, expiry, expiry)).toBe('expired');
  });
});

describe('permit reminder settings', () => {
  it('fills missing parts with the defaults, dedupes and sorts the windows widest first', () => {
    const s = parsePermitSettings({ staffEmail: false, windows: { insurance: [14, 45, 45] } });
    expect(s.staffEmail).toBe(false);
    expect(s.enabled).toBe(true);
    expect(s.windows.insurance).toEqual([45, 14]);
    expect(s.windows.passport).toEqual([180, 90, 60, 30]);
  });

  it('falls back to the defaults on invalid values', () => {
    expect(parsePermitSettings({ windows: { residence: [0] } })).toEqual(DEFAULT_PERMIT_SETTINGS);
    expect(parsePermitSettings({ windows: { residence: [] } })).toEqual(DEFAULT_PERMIT_SETTINGS);
    expect(parsePermitSettings(null)).toEqual(DEFAULT_PERMIT_SETTINGS);
  });
});

describe('permit reminder texts', () => {
  it('every language names the item, the date and the days left (or that it expired)', () => {
    for (const locale of ['az', 'de', 'en', 'ru'] as const) {
      const tx = PERMIT_TEXTS[locale];
      for (const item of ['residence', 'blueCard', 'passport', 'insurance'] as const) {
        const soon = tx.client({ item, firstName: 'Kamran', date: '01.06.2027', days: 30 });
        expect(soon.title).toContain(tx.label[item]);
        expect(soon.body).toContain('01.06.2027');
        expect(soon.body).toContain('30');
        expect(tx.client({ item, firstName: 'Kamran', date: '01.06.2027', days: 0 }).body).not.toContain(' 0 ');
        expect(tx.staff({ item, client: 'Kamran Əliyev', number: 'TV-1', date: '01.06.2027', days: 60 }).body).toContain('TV-1');
      }
    }
    expect(PERMIT_TEXTS.de.label.blueCard).toBe('Blaue Karte EU');
  });
});
