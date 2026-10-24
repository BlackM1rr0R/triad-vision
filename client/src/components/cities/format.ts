import { useTranslation } from 'react-i18next';
import { toContentLocale } from '@/i18n';
import type { L4, Range } from '@/lib/cities/data';

const NUM_LOCALE: Record<string, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA' };

/** Number / euro helpers bound to the UI language. */
export const useCityFormat = () => {
  const { i18n } = useTranslation();
  const ui = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const locale = toContentLocale(ui); // city texts exist in az/de/en/ru; tr / uk read English
  const nf = new Intl.NumberFormat(NUM_LOCALE[ui] ?? NUM_LOCALE[locale], { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(NUM_LOCALE[ui] ?? NUM_LOCALE[locale], { maximumFractionDigits: 1 });
  const euro = (n: number) => `${nf.format(Math.round(n))} €`;
  const range = (r: Range) => (r[0] === r[1] ? euro(r[0]) : `${nf.format(r[0])}–${nf.format(r[1])} €`);
  const num = (n: number) => nf.format(n);
  const dec = (n: number) => nf1.format(n);
  const l4 = (v: L4) => v[locale] || v.en;
  return { locale, euro, range, num, dec, l4 };
};
