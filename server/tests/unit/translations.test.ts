import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING, estimatePrice, needsDistinctLanguages, normalizePricing } from '../../src/lib/translations/pricing.js';
import { canTransition, isOverdue, orderKey, parseOrderKey } from '../../src/lib/translations/core.js';
import { formatMoney, translationNotice } from '../../src/lib/translations/texts.js';

describe('translation pricing', () => {
  it('estimates price per page and the express surcharge', () => {
    const p = { perPage: { TRANSLATION: 3500, APOSTILLE: 4500, TRANSLATION_APOSTILLE: 7500, NOTARY: 2500 }, expressSurchargePct: 50 };
    expect(estimatePrice(p, { service: 'TRANSLATION', pages: 3, urgency: 'STANDARD' })).toEqual({ baseCents: 10500, surchargeCents: 0, totalCents: 10500 });
    expect(estimatePrice(p, { service: 'TRANSLATION', pages: 3, urgency: 'EXPRESS' })).toEqual({ baseCents: 10500, surchargeCents: 5250, totalCents: 15750 });
    expect(estimatePrice({ ...p, expressSurchargePct: 33 }, { service: 'NOTARY', pages: 1, urgency: 'EXPRESS' }).surchargeCents).toBe(825);
    expect(estimatePrice(p, { service: 'APOSTILLE', pages: 0, urgency: 'STANDARD' }).totalCents).toBe(4500); // at least one page
  });

  it('falls back to defaults field by field for a broken setting', () => {
    expect(normalizePricing(null)).toEqual(DEFAULT_PRICING);
    expect(normalizePricing('nonsense')).toEqual(DEFAULT_PRICING);
    const p = normalizePricing({ currency: 'usd', perPage: { TRANSLATION: 4000, NOTARY: -5 }, expressSurchargePct: 'x', languages: ['AZ', 'de', 'de'], documentTypes: [] });
    expect(p.currency).toBe('USD');
    expect(p.perPage).toEqual(DEFAULT_PRICING.perPage); // one invalid value rejects the object → defaults
    expect(p.expressSurchargePct).toBe(DEFAULT_PRICING.expressSurchargePct);
    expect(p.languages).toEqual(['az', 'de']);
    expect(p.documentTypes).toEqual(DEFAULT_PRICING.documentTypes);
    expect(normalizePricing({ perPage: { APOSTILLE: 9900 } }).perPage).toEqual({ ...DEFAULT_PRICING.perPage, APOSTILLE: 9900 });
  });

  it('knows which services need two languages', () => {
    expect(needsDistinctLanguages('TRANSLATION')).toBe(true);
    expect(needsDistinctLanguages('TRANSLATION_APOSTILLE')).toBe(true);
    expect(needsDistinctLanguages('APOSTILLE')).toBe(false);
    expect(needsDistinctLanguages('NOTARY')).toBe(false);
  });
});

describe('translation order helpers', () => {
  it('formats and parses order numbers', () => {
    expect(orderKey(7)).toBe('TR-0007');
    expect(orderKey(12345)).toBe('TR-12345');
    expect(parseOrderKey('TR-0007')).toBe(7);
    expect(parseOrderKey('tr12')).toBe(12);
    expect(parseOrderKey('42')).toBe(42);
    expect(parseOrderKey('Aliyev')).toBeNull();
  });

  it('allows only the defined status transitions', () => {
    expect(canTransition('ACCEPTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'READY')).toBe(true);
    expect(canTransition('READY', 'DELIVERED')).toBe(true);
    expect(canTransition('NEW', 'CANCELLED')).toBe(true);
    expect(canTransition('NEW', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('QUOTED', 'ACCEPTED')).toBe(false); // only the client accepts
    expect(canTransition('ACCEPTED', 'READY')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'NEW')).toBe(false);
  });

  it('is overdue only while being worked on', () => {
    const now = new Date('2030-01-10T10:00:00Z');
    const past = new Date('2030-01-09T10:00:00Z');
    expect(isOverdue({ status: 'IN_PROGRESS', dueAt: past }, now)).toBe(true);
    expect(isOverdue({ status: 'ACCEPTED', dueAt: past }, now)).toBe(true);
    expect(isOverdue({ status: 'READY', dueAt: past }, now)).toBe(false);
    expect(isOverdue({ status: 'IN_PROGRESS', dueAt: null }, now)).toBe(false);
  });

  it('has notification texts in all four languages', () => {
    for (const l of ['az', 'de', 'en', 'ru'] as const) {
      const t = translationNotice('QUOTED', l, { number: 'TR-0001', price: formatMoney(12000, 'EUR', l), note: 'x' });
      expect(t.title).toContain('TR-0001');
      expect(t.body).toContain('120');
    }
    expect(translationNotice('READY', 'de', { number: 'TR-0002', delivery: 'PICKUP' }).body).toContain('abholen');
  });
});
