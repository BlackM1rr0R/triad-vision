import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DATE_LOCALE } from '@/i18n';
import { pickLanguage, type Lang } from '@/i18n/merge';
import type { L10n, L10nList } from '@/types';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatter = (lang: Lang, opts: Intl.DateTimeFormatOptions) => {
  const key = lang + JSON.stringify(opts);
  let f = formatterCache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(DATE_LOCALE[lang], opts);
    } catch {
      // Some engines lack az-Latn-AZ data; fall back gracefully.
      f = new Intl.DateTimeFormat('en-GB', opts);
    }
    formatterCache.set(key, f);
  }
  return f;
};

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const trL10n = (v: L10n | null | undefined, lang: Lang) => (v ? v[lang] || v.az || v.en || '' : '');

/** Helpers bound to the current UI language for CMS content ({ az, de, en, ru }) and dates. */
export const useFormat = () => {
  const { i18n, t } = useTranslation();
  const lang = pickLanguage([i18n.language]);
  return useMemo(() => {
    const date = (iso: string | Date) => formatter(lang, { dateStyle: 'medium' }).format(new Date(iso));
    const dateTime = (iso: string | Date) => formatter(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    const time = (iso: string | Date) => formatter(lang, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    const longDateTime = (iso: string | Date) =>
      formatter(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    /** "Today 14:05", "Yesterday 09:12" or a short date — for lists and chat. */
    const smart = (iso: string | Date) => {
      const d = new Date(iso);
      const now = new Date();
      const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
      if (diffDays === 0) return `${t('m.common.today')} ${time(d)}`;
      if (diffDays === 1) return `${t('m.common.yesterday')} ${time(d)}`;
      return dateTime(d);
    };
    return {
      lang,
      tr: (v: L10n | null | undefined) => trL10n(v, lang),
      trList: (v: L10nList | null | undefined) => (v ? v[lang] ?? v.az ?? [] : []),
      date,
      dateTime,
      time,
      longDateTime,
      smart,
    };
  }, [lang, t]);
};
