import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n';
import type { L10n, L10nList } from './types';

const DATE_LOCALE: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

/** Helpers bound to the current UI language for reading CMS content stored as { az, de, en, ru }. */
export const useL10n = () => {
  const { i18n } = useTranslation();
  const locale = ((i18n.resolvedLanguage ?? 'az').slice(0, 2) as Locale) || 'az';

  const tr = (v: L10n | null | undefined) => (v ? v[locale] || v.az || v.en || '' : '');
  const trList = (v: L10nList | null | undefined) => (v ? v[locale] ?? v.az ?? [] : []);
  const date = (iso: string | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) =>
    new Intl.DateTimeFormat(DATE_LOCALE[locale], opts).format(new Date(iso));
  const dateTime = (iso: string | Date) =>
    new Intl.DateTimeFormat(DATE_LOCALE[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

  return { locale, tr, trList, date, dateTime };
};
