import { deepMerge, pickLanguage, type Dict } from '@/i18n/merge';
import az from '@/i18n/locales/az.json';
import de from '@/i18n/locales/de.json';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import mAz from '@/i18n/mobile.az.json';
import mDe from '@/i18n/mobile.de.json';
import mEn from '@/i18n/mobile.en.json';
import mRu from '@/i18n/mobile.ru.json';

/** All leaf key paths of a dictionary ("a.b.c"). Arrays count as leaves. */
const keys = (obj: unknown, prefix = ''): string[] =>
  obj && typeof obj === 'object' && !Array.isArray(obj)
    ? Object.entries(obj as Dict).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
    : [prefix];

const get = (obj: Dict, path: string) => path.split('.').reduce<unknown>((o, k) => (o as Dict | undefined)?.[k], obj);

describe('deepMerge', () => {
  it('merges nested objects and lets later sources win', () => {
    const merged = deepMerge({ a: { x: 1, y: 2 }, list: [1, 2] }, { a: { y: 3, z: 4 }, list: [9] });
    expect(merged).toEqual({ a: { x: 1, y: 3, z: 4 }, list: [9] });
  });

  it('does not mutate its inputs', () => {
    const base = { a: { x: 1 } };
    const extra = { a: { y: 2 } };
    deepMerge(base, extra);
    expect(base).toEqual({ a: { x: 1 } });
    expect(extra).toEqual({ a: { y: 2 } });
  });

  it('ignores undefined sources', () => {
    expect(deepMerge(undefined, { a: 1 }, undefined)).toEqual({ a: 1 });
  });

  it('adds mobile strings under m.* without losing web strings', () => {
    const merged = deepMerge(en as Dict, mEn as Dict);
    expect(get(merged, 'portal.status.APPROVED')).toBe('Visa approved');
    expect(get(merged, 'm.tabs.home')).toBe('Home');
    expect(Object.keys(merged).length).toBe(Object.keys(en).length + 1);
  });
});

describe('pickLanguage', () => {
  it.each([
    [['de-DE'], 'de'],
    [['ru'], 'ru'],
    [['az-Latn-AZ'], 'az'],
    [['fr-FR', 'en-US'], 'en'],
    [['fr-FR', 'es'], 'az'],
    [[null, undefined], 'az'],
  ] as const)('%j → %s', (tags, expected) => {
    expect(pickLanguage([...tags])).toBe(expected);
  });
});

describe('translation files', () => {
  const web = { az, de, en, ru } as Record<string, Dict>;
  const mobile = { az: mAz, de: mDe, en: mEn, ru: mRu } as Record<string, Dict>;

  it('mobile strings have the same keys in all 4 languages', () => {
    const reference = keys(mobile.en).sort();
    for (const lng of ['az', 'de', 'ru']) {
      expect(keys(mobile[lng]).sort()).toEqual(reference);
    }
  });

  it('no mobile string is empty', () => {
    for (const lng of Object.keys(mobile)) {
      for (const k of keys(mobile[lng])) expect(String(get(mobile[lng], k)).trim()).not.toBe('');
    }
  });

  it('synced web locales contain the portal strings the app relies on', () => {
    const needed = ['portal.status.DOCUMENTS_PENDING', 'portal.statusHelp.APPROVED', 'portal.steps.result', 'portal.docs.submit', 'auth.login', 'portal.events.CONTRACT_SIGNED'];
    for (const lng of Object.keys(web)) {
      for (const k of needed) expect(typeof get(web[lng], k)).toBe('string');
    }
  });

  it('has a staff label and situation for every case status', () => {
    const statuses = Object.keys(get(en as Dict, 'portal.status') as Dict);
    for (const lng of Object.keys(mobile)) {
      for (const s of statuses) {
        expect(typeof get(mobile[lng], `m.staff.status.${s}`)).toBe('string');
        expect(typeof get(mobile[lng], `m.staff.situation.${s}`)).toBe('string');
      }
    }
  });
});
