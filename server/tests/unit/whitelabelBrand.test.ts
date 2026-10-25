import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import i18next, { type i18n as I18n } from 'i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_BRAND, brandSettingSchema, brandify, replacementPairs, resetBrandForTests, resolveBrand } from '../../src/lib/brand/index.js';

/**
 * White-label brand: resolution (setting → BRAND_* env → Triad Vision), the output-sink token swap (brandify)
 * and the client copy interpolation ({{brand}} via i18next default variables, incl. the tr / uk site bundles
 * and getFixedT).
 */

const OPTS = { smtpFrom: 'Triad Vision <no-reply@triad-vision.de>', clientUrl: 'https://triad-vision.de' };

describe('resolveBrand', () => {
  it('without setting and env it is exactly Triad Vision (owner instance unchanged)', () => {
    const b = resolveBrand(null, { ...OPTS, env: {} });
    expect(b).toMatchObject({
      name: 'Triad Vision',
      shortName: 'Triad Vision',
      tagline: 'People · Work · Opportunities',
      domain: 'triad-vision.de',
      phone: '+994 50 748 70 48',
      emailFrom: 'Triad Vision <no-reply@triad-vision.de>',
      primaryColor: '#0b1f44',
      isDefault: true,
    });
    expect(b.icons.favicon).toBe('/favicon.svg');
    expect(replacementPairs(b)).toEqual([]);
  });

  it('BRAND_* env vars set an instance brand; the setting wins over env', () => {
    const env = { BRAND_NAME: 'Acme Visa', BRAND_DOMAIN: 'Acme-Visa.example', BRAND_PHONE: '+49 30 123', BRAND_LANGUAGES: 'de,en,xx' };
    const b = resolveBrand(null, { ...OPTS, env });
    expect(b).toMatchObject({ name: 'Acme Visa', shortName: 'Acme Visa', domain: 'acme-visa.example', phone: '+49 30 123', languages: ['de', 'en'], defaultLanguage: 'de', isDefault: false });
    expect(b.description).toBe(''); // the Azerbaijani Triad Vision description is not inherited
    const s = resolveBrand({ name: 'Acme Migration', shortName: 'Acme', emailFromName: 'Acme Team', emailFromAddress: 'hello@acme.example', iconSet: 'icons-0123456789abcdef' }, { ...OPTS, env });
    expect(s).toMatchObject({ name: 'Acme Migration', shortName: 'Acme', emailFrom: 'Acme Team <hello@acme.example>' });
    expect(s.icons.icon192).toBe('/uploads/brand/icons-0123456789abcdef/icon-192.png');
  });

  it('a renamed brand never keeps the Triad Vision phone', () => {
    expect(resolveBrand({ name: 'Acme Visa' }, { ...OPTS, env: {} }).phone).toBe('');
  });

  it('unsafe characters are refused (brandify writes into HTML / JSON / XML / PDF text)', () => {
    for (const name of ['<b>x</b>', 'A & B', 'Say "hi"', 'a\\b', '{{x}}']) expect(brandSettingSchema.safeParse({ name }).success, name).toBe(false);
    expect(brandSettingSchema.safeParse({ name: 'Acme Visa (Berlin) – Ö’s' }).success).toBe(true);
    expect(brandSettingSchema.safeParse({ logoLight: '/uploads/../../etc/passwd.png' }).success).toBe(false);
    expect(brandSettingSchema.safeParse({ logoLight: 'https://evil.example/x.png' }).success).toBe(false);
  });
});

describe('brandify (output sinks)', () => {
  afterEach(() => resetBrandForTests());

  it('is a no-op for the default brand', () => {
    resetBrandForTests();
    const text = 'Triad Vision · triad-vision.de · +994 50 748 70 48 — TRIAD VISION, Triad-Vision-Team';
    expect(brandify(text)).toBe(text);
  });

  it('swaps name, upper-case name, hyphenated name, tagline, domain and phone; idempotent', () => {
    const b = resolveBrand({ name: 'Acme Visa', tagline: 'Visas made simple', phone: '+49 30 1' }, { ...OPTS, env: { BRAND_DOMAIN: 'acme.example' } });
    const pairs = replacementPairs(b);
    const swap = (s: string) => pairs.reduce((acc, [from, to]) => acc.split(from).join(to), s);
    const out = swap('TRIAD VISION | PEOPLE · WORK · OPPORTUNITIES | Triad Vision · triad-vision.de · +994 50 748 70 48 | Triad-Vision-Team');
    expect(out).toBe('ACME VISA | VISAS MADE SIMPLE | Acme Visa · acme.example · +49 30 1 | Acme-Visa-Team');
    expect(swap(out)).toBe(out);
  });

  it('a brand containing the default token is not swapped twice', () => {
    const b = resolveBrand({ name: 'Triad Vision Pro' }, { ...OPTS, env: {} });
    expect(replacementPairs(b).find(([from]) => from === 'Triad Vision')).toBeUndefined();
  });
});

// ─── Client copy: {{brand}} interpolation ─────────────────────────────

type ClientBrand = {
  DEFAULT_BRAND: Record<string, unknown> & { name: string };
  brandVars: (b?: Record<string, unknown>) => Record<string, string>;
  sanitizeBrand: (raw: unknown) => (Record<string, unknown> & { name: string }) | null;
};
type Bundle = Record<'az' | 'de' | 'en' | 'ru', Record<string, unknown>>;

const clientSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ pathToFileURL(path.join(clientSrc, rel)).href)) as T;

let clientBrand: ClientBrand;
let company: Bundle;
let tr: Record<string, unknown>;
let uk: Record<string, unknown>;

beforeAll(async () => {
  clientBrand = await load<ClientBrand>('lib/brand.ts');
  company = (await load<{ pagesCompany: Bundle }>('i18n/pagesCompany.ts')).pagesCompany;
  tr = (await load<{ default: Record<string, unknown> }>('i18n/site/tr/index.ts')).default;
  uk = (await load<{ default: Record<string, unknown> }>('i18n/site/uk/index.ts')).default;
});

const makeI18n = async (vars: Record<string, string>): Promise<I18n> => {
  const inst = i18next.createInstance();
  await inst.init({
    lng: 'az',
    fallbackLng: { tr: ['en', 'az'], uk: ['en', 'az'], default: ['az'] },
    returnObjects: true,
    interpolation: { escapeValue: false, defaultVariables: { ...vars } },
    resources: {
      az: { translation: company.az },
      en: { translation: company.en },
      de: { translation: company.de },
      ru: { translation: company.ru },
      tr: { translation: tr },
      uk: { translation: uk },
    },
  });
  return inst;
};

describe('client copy interpolation', () => {
  it('the client default brand mirrors the server default', () => {
    expect(clientBrand.DEFAULT_BRAND.name).toBe(DEFAULT_BRAND.name);
    expect(clientBrand.brandVars(clientBrand.DEFAULT_BRAND)).toMatchObject({
      brand: 'Triad Vision',
      brandUpper: 'TRIAD VISION',
      brandHyphen: 'Triad-Vision',
      brandDomain: 'triad-vision.de',
      brandWord: 'Triad',
      brandSlug: 'triad-vision',
    });
    expect(clientBrand.sanitizeBrand({ name: '<script>' })).toBeNull();
  });

  it('copy says {{brand}}, never the literal name, and renders "Triad Vision" by default (az, tr, uk, getFixedT)', async () => {
    expect(JSON.stringify(company)).not.toContain('Triad Vision');
    expect(JSON.stringify(tr)).not.toContain('Triad Vision');
    expect(JSON.stringify(company.az)).toContain('{{brand}}');
    const i18n = await makeI18n(clientBrand.brandVars(clientBrand.DEFAULT_BRAND));
    const cols = i18n.t('aboutPage.compare.cols', { returnObjects: true }) as string[];
    expect(cols[0]).toBe('Triad Vision');
    const trT = i18n.getFixedT('tr');
    expect(trT('aboutPage.compare.title')).toBe('Triad Vision ile — ve onsuz');
    const ukAll = JSON.stringify(i18n.getFixedT('uk')('aboutPage', { returnObjects: true }));
    expect(ukAll).toContain('Triad Vision');
    expect(ukAll).not.toContain('{{brand');
    const azAll = JSON.stringify(i18n.t('aboutPage', { returnObjects: true }));
    expect(azAll).not.toContain('{{');
  });

  it('a white-label brand flows through every language, also after a runtime change', async () => {
    const i18n = await makeI18n(clientBrand.brandVars(clientBrand.DEFAULT_BRAND));
    const acme = clientBrand.sanitizeBrand({ name: 'Acme Visa', domain: 'acme.example' })!;
    Object.assign(i18n.options.interpolation!.defaultVariables!, clientBrand.brandVars(acme));
    expect(i18n.getFixedT('tr')('aboutPage.compare.title')).toBe('Acme Visa ile — ve onsuz');
    const de = JSON.stringify(i18n.getFixedT('de')('aboutPage', { returnObjects: true }));
    expect(de).toContain('Acme Visa');
    expect(de).not.toContain('Triad Vision');
  });
});
