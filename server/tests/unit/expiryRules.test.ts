import { describe, expect, it } from 'vitest';
import { daysLeft, dueWindow, EXPIRY_WINDOWS, expiryFromRecords, kindForKey, parseDay, toneOf, windowAt } from '../../src/lib/expiry/rules.js';
import { fitOnA4, A4 } from '../../src/lib/scan/pdf.js';

const DAY = 24 * 60 * 60 * 1000;
const expiry = new Date('2027-06-01T00:00:00Z');
const before = (days: number) => new Date(expiry.getTime() - days * DAY);

describe('expiry kinds and windows', () => {
  it('uses the passport windows for PASSPORT and the default ones for everything else', () => {
    expect(kindForKey('PASSPORT')).toBe('passport');
    expect(kindForKey('LANGUAGE_CERT')).toBe('default');
    expect(kindForKey(null)).toBe('default');
    expect(EXPIRY_WINDOWS.passport).toEqual([180, 90, 30]);
    expect(EXPIRY_WINDOWS.default).toEqual([60, 30, 7]);
  });

  it('counts whole days left', () => {
    expect(daysLeft(expiry, before(10))).toBe(10);
    expect(daysLeft(expiry, new Date(expiry.getTime() - 1))).toBe(1);
    expect(daysLeft(expiry, new Date(expiry.getTime() + DAY))).toBe(-1);
  });

  it('finds the narrowest window a moment falls into', () => {
    expect(windowAt('passport', expiry, before(200))).toBeNull();
    expect(windowAt('passport', expiry, before(180))).toBe(180);
    expect(windowAt('passport', expiry, before(120))).toBe(180);
    expect(windowAt('passport', expiry, before(90))).toBe(90);
    expect(windowAt('passport', expiry, before(29))).toBe(30);
    expect(windowAt('passport', expiry, expiry)).toBe(0);
    expect(windowAt('default', expiry, before(61))).toBeNull();
    expect(windowAt('default', expiry, before(45))).toBe(60);
    expect(windowAt('default', expiry, before(20))).toBe(30);
    expect(windowAt('default', expiry, before(3))).toBe(7);
  });

  it('is due once per window and only when a narrower window is reached', () => {
    expect(dueWindow('default', expiry, null, before(90))).toBeNull();
    expect(dueWindow('default', expiry, null, before(50))).toBe(60);
    expect(dueWindow('default', expiry, before(50), before(40))).toBeNull(); // still the 60-day window
    expect(dueWindow('default', expiry, before(50), before(25))).toBe(30);
    expect(dueWindow('default', expiry, before(25), before(6))).toBe(7);
    expect(dueWindow('default', expiry, before(6), before(1))).toBeNull();
    expect(dueWindow('default', expiry, before(6), new Date(expiry.getTime() + DAY))).toBe(0);
    expect(dueWindow('default', expiry, new Date(expiry.getTime() + DAY), new Date(expiry.getTime() + 5 * DAY))).toBeNull();
  });

  it('entering late only sends the narrowest window', () => {
    expect(dueWindow('passport', expiry, null, before(20))).toBe(30);
    expect(dueWindow('passport', expiry, before(20), before(10))).toBeNull();
  });

  it('a reminder sent before the widest window (old date) does not block the first window', () => {
    expect(dueWindow('passport', expiry, before(400), before(170))).toBe(180);
  });

  it('colours the chip', () => {
    expect(toneOf('default', expiry, before(100))).toBe('ok');
    expect(toneOf('default', expiry, before(40))).toBe('soon');
    expect(toneOf('default', expiry, before(5))).toBe('urgent');
    expect(toneOf('passport', expiry, before(20))).toBe('urgent');
    expect(toneOf('passport', expiry, expiry)).toBe('expired');
  });
});

describe('reading expiry dates from stored records', () => {
  it('parses only real calendar days', () => {
    expect(parseDay('2029-04-30')?.toISOString()).toBe('2029-04-30T00:00:00.000Z');
    expect(parseDay('2029-02-30')).toBeNull();
    expect(parseDay('garbage')).toBeNull();
    expect(parseDay(20290430)).toBeNull();
  });

  it('takes the MRZ expiry only when its check digit is valid', () => {
    expect(expiryFromRecords({ mrz: { expiryDate: '2030-01-15', valid: true } })?.toISOString().slice(0, 10)).toBe('2030-01-15');
    expect(expiryFromRecords({ mrz: { expiryDate: '2030-01-15', valid: false, checks: { expiryDate: true } } })?.toISOString().slice(0, 10)).toBe('2030-01-15');
    expect(expiryFromRecords({ mrz: { expiryDate: '2030-01-15', valid: false, checks: { expiryDate: false } } })).toBeNull();
    expect(expiryFromRecords({ mrz: null, error: 'MRZ_NOT_FOUND' })).toBeNull();
    expect(expiryFromRecords(null)).toBeNull();
  });

  it('reads vault-style fields and upload-check issues', () => {
    expect(expiryFromRecords({ fields: { expiryDate: '2028-03-01' }, valid: true })?.toISOString().slice(0, 10)).toBe('2028-03-01');
    expect(expiryFromRecords(null, { level: 'warn', issues: [{ code: 'PASSPORT_EXPIRES_SOON', level: 'warn', params: { expiryDate: '2027-02-02', months: 8 } }] })?.toISOString().slice(0, 10)).toBe('2027-02-02');
  });
});

describe('scan page layout', () => {
  it('fits portrait images on portrait A4 and landscape images on landscape A4, centred', () => {
    const p = fitOnA4({ width: 1200, height: 1600 });
    expect(p.pageW).toBe(A4.width);
    expect(p.pageH).toBe(A4.height);
    expect(p.width).toBeLessThanOrEqual(A4.width);
    expect(p.x).toBeCloseTo((A4.width - p.width) / 2);
    const l = fitOnA4({ width: 1600, height: 900 });
    expect(l.pageW).toBe(A4.height);
    expect(l.height).toBeLessThanOrEqual(A4.width);
  });
});
