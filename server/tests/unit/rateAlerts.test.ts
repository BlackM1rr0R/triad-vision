import { describe, expect, it } from 'vitest';
import { alertInputSchema, alertToken, bakuIso, conditionMet, expiryFrom, fmtRate, shouldFire, verifyAlertToken } from '../../src/lib/rateAlerts/logic.js';
import { RATE_ALERT_MAIL, mailLocale } from '../../src/lib/rateAlerts/texts.js';

/** EUR → AZN rate alerts: the pure rules (lib/rateAlerts/logic.ts) and the e-mail texts. */

const base = {
  confirmedAt: new Date('2026-11-01T00:00:00Z'),
  unsubscribedAt: null,
  expiredAt: null,
  pausedAt: null,
  expiresAt: new Date('2027-05-01T00:00:00Z'),
  lastSentAt: null,
  direction: 'gte',
  target: 2,
};
const NOW = new Date('2026-11-22T08:00:00Z');

describe('rate alert rules', () => {
  it('condition ≥ / ≤', () => {
    expect(conditionMet('gte', 2, 2)).toBe(true);
    expect(conditionMet('gte', 2, 1.9999)).toBe(false);
    expect(conditionMet('lte', 1.9, 1.85)).toBe(true);
    expect(conditionMet('lte', 1.9, 1.95)).toBe(false);
  });

  it('fires only when confirmed, active, not paused and not yet e-mailed on the same Baku day', () => {
    expect(shouldFire(base, 2.01, NOW)).toBe(true);
    expect(shouldFire({ ...base, confirmedAt: null }, 2.01, NOW)).toBe(false);
    expect(shouldFire({ ...base, pausedAt: NOW }, 2.01, NOW)).toBe(false);
    expect(shouldFire({ ...base, unsubscribedAt: NOW }, 2.01, NOW)).toBe(false);
    expect(shouldFire({ ...base, expiredAt: NOW }, 2.01, NOW)).toBe(false);
    expect(shouldFire({ ...base, expiresAt: new Date('2026-11-21T00:00:00Z') }, 2.01, NOW)).toBe(false);
    expect(shouldFire(base, 1.99, NOW)).toBe(false);
    // re-armed after an e-mail earlier the same Baku day: not again today
    expect(shouldFire({ ...base, lastSentAt: new Date('2026-11-22T01:00:00Z') }, 2.01, NOW)).toBe(false);
    // 21.11 21:00 UTC is already 22.11 in Baku (UTC+4)
    expect(shouldFire({ ...base, lastSentAt: new Date('2026-11-21T21:00:00Z') }, 2.01, NOW)).toBe(false);
    expect(shouldFire({ ...base, lastSentAt: new Date('2026-11-21T19:00:00Z') }, 2.01, NOW)).toBe(true);
    expect(bakuIso(new Date('2026-11-21T20:30:00Z'))).toBe('2026-11-22');
  });

  it('expires six calendar months later (month-end safe)', () => {
    expect(expiryFrom(new Date('2026-11-22T10:00:00Z')).toISOString()).toBe('2027-05-22T10:00:00.000Z');
    expect(expiryFrom(new Date('2026-08-31T10:00:00Z')).toISOString()).toBe('2027-02-28T10:00:00.000Z');
  });

  it('validates the input (direction, plausible target, 4 decimals)', () => {
    expect(alertInputSchema.parse({ direction: 'gte', target: '2.123456' }).target).toBe(2.1235);
    expect(alertInputSchema.safeParse({ direction: 'gte', target: 0.1 }).success).toBe(false);
    expect(alertInputSchema.safeParse({ direction: 'gte', target: 11 }).success).toBe(false);
    expect(alertInputSchema.safeParse({ direction: 'eq', target: 2 }).success).toBe(false);
  });

  it('signed tokens: valid, tampered, foreign', () => {
    const t = alertToken('cm3abcdefghijkl');
    expect(verifyAlertToken(t)).toBe('cm3abcdefghijkl');
    expect(verifyAlertToken(`${t}x`)).toBeNull();
    expect(verifyAlertToken(t.replace('cm3abcdefghijkl', 'cm3abcdefghijkm'))).toBeNull();
    expect(verifyAlertToken('nope')).toBeNull();
    expect(verifyAlertToken(42)).toBeNull();
  });

  it('formats like the CBAR bulletin', () => {
    expect(fmtRate(1.98766, 'en')).toBe('1.9877');
    expect(fmtRate(1.98766, 'az')).toBe('1,9877');
  });
});

describe('rate alert e-mails', () => {
  it('az / de / en / ru, with tr → az and uk → ru', () => {
    expect(mailLocale('tr')).toBe('az');
    expect(mailLocale('uk')).toBe('ru');
    expect(mailLocale('xx')).toBe('az');
    for (const lng of ['az', 'de', 'en', 'ru'] as const) {
      const m = RATE_ALERT_MAIL[lng];
      expect(m.condition('gte', '2,0000')).toBe('1 EUR ≥ 2,0000 AZN');
      expect(m.firedBody({ rate: '2,01', date: '22.11.2026', condition: 'x' })).toContain('22.11.2026');
      for (const v of Object.values(m)) if (typeof v === 'string') expect(v.trim(), lng).toBeTruthy();
    }
  });
});
