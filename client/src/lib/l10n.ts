import { useTranslation } from 'react-i18next';
import { toContentLocale, type SiteLocale } from '@/i18n';
import type { L10n, L10nList } from './types';

const DATE_LOCALE: Record<SiteLocale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA' };

/**
 * Helpers bound to the current UI language for reading CMS content stored as { az, de, en, ru }.
 * `locale` is the content language: Turkish and Ukrainian visitors read the English CMS texts (dates and
 * numbers still use their own locale).
 */
export const useL10n = () => {
  const { i18n } = useTranslation();
  const ui = ((i18n.resolvedLanguage ?? 'az').slice(0, 2) as SiteLocale) || 'az';
  const locale = toContentLocale(ui);
  const dateLocale = DATE_LOCALE[ui] ?? DATE_LOCALE[locale];

  const tr = (v: L10n | null | undefined) => (v ? v[locale] || v.az || v.en || '' : '');
  const trList = (v: L10nList | null | undefined) => (v ? v[locale] ?? v.az ?? [] : []);
  const date = (iso: string | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) =>
    new Intl.DateTimeFormat(dateLocale, opts).format(new Date(iso));
  const dateTime = (iso: string | Date) =>
    new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

  return { locale, tr, trList, date, dateTime };
};
