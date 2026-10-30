import { describe, expect, it } from 'vitest';
import { fillTemplate, normaliseSlug, TEMPLATE_DEFAULTS, templatesSchema, TERMS_DEFAULTS } from '../../src/lib/growth/referralExtras.js';
import { receiptNumber, referralCardPdf, rewardReceiptPdf } from '../../src/lib/growth/referralPdf.js';

describe('referral landing slug', () => {
  it('normalises Azerbaijani names to a URL slug', () => {
    expect(normaliseSlug('Əli Şükürov')).toBe('eli-sukurov');
    expect(normaliseSlug('  Gənc_Ağa.2026 ')).toBe('genc-aga-2026');
    expect(normaliseSlug('--a--b--')).toBe('a-b');
  });
  it('rejects too short, reserved and code-like slugs', () => {
    expect(normaliseSlug('ab')).toBeNull();
    expect(normaliseSlug('Admin')).toBeNull();
    expect(normaliseSlug('review')).toBeNull();
    expect(normaliseSlug('TVABC234')).toBeNull(); // looks like a referral code
    expect(normaliseSlug('x'.repeat(41))).toBeNull();
    expect(normaliseSlug('!!!')).toBeNull();
  });
});

describe('share templates', () => {
  it('defaults are valid, cover the main professions and all four languages contain {link}', () => {
    expect(templatesSchema.safeParse(TEMPLATE_DEFAULTS).success).toBe(true);
    const keys = TEMPLATE_DEFAULTS.items.map((x) => x.key);
    for (const k of ['nurse', 'driver', 'cook', 'construction']) expect(keys).toContain(k);
    for (const x of TEMPLATE_DEFAULTS.items) for (const l of ['az', 'de', 'en', 'ru'] as const) expect(x.text[l]).toContain('{link}');
    for (const l of ['az', 'de', 'en', 'ru'] as const) expect(TERMS_DEFAULTS.body[l].length).toBeGreaterThan(200);
  });
  it('fills the link in, or appends it', () => {
    expect(fillTemplate('Go {link} now {link}', 'https://x/r')).toBe('Go https://x/r now https://x/r');
    expect(fillTemplate('No placeholder ', 'https://x/r')).toBe('No placeholder https://x/r');
  });
  it('rejects duplicate keys', () => {
    const one = TEMPLATE_DEFAULTS.items[0];
    expect(templatesSchema.safeParse({ items: [one, one] }).success).toBe(false);
  });
});

describe('referral PDFs', () => {
  it('render the QR card (single and sheet) and a payout receipt', async () => {
    for (const layout of ['single', 'sheet'] as const) {
      const pdf = await referralCardPdf({ name: 'Əli Şükürov', link: 'https://triadvision.az/r/eli', code: 'TVABC234', locale: 'az', layout });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    }
    const settledAt = new Date('2026-10-30T10:00:00Z');
    expect(receiptNumber({ id: 'cmabcdefgh12345678', settledAt })).toBe('RR-2026-12345678');
    const receipt = await rewardReceiptPdf({
      id: 'cmabcdefgh12345678',
      amount: 100,
      currency: 'AZN',
      settledAt,
      reason: 'Empfehlung / Referral: Aynur M.',
      note: 'Bank transfer',
      recipient: { name: 'Əli Şükürov', email: 'eli@test.local', locale: 'ru' },
    });
    expect(receipt.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
