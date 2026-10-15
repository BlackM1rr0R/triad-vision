import { mobileLegal } from '@/i18n/legal';

const keys = (obj: unknown, prefix = ''): string[] =>
  obj && typeof obj === 'object'
    ? Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
    : [prefix];

describe('two-factor / verification strings', () => {
  it('every language has the same keys and no empty text', () => {
    const base = keys(mobileLegal.az).sort();
    for (const lng of ['de', 'en', 'ru'] as const) expect(keys(mobileLegal[lng]).sort()).toEqual(base);
    for (const lng of ['az', 'de', 'en', 'ru'] as const) {
      for (const k of keys(mobileLegal[lng])) {
        const v = k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], mobileLegal[lng]);
        expect(typeof v === 'string' && v.trim().length > 0).toBe(true);
      }
    }
  });

  it('covers the server error codes of the 2FA / verification flows', () => {
    for (const code of ['INVALID_CODE', 'TWO_FACTOR_CHALLENGE_INVALID', 'EMAIL_NOT_VERIFIED', 'TWO_FACTOR_ENROLLMENT_REQUIRED']) {
      expect(mobileLegal.en.m.errors).toHaveProperty(code);
    }
  });
});
