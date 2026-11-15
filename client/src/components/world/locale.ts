import { useTranslation } from 'react-i18next';

export type WorldLang = 'az' | 'de' | 'en' | 'ru' | 'tr' | 'uk';
const LANGS: WorldLang[] = ['az', 'de', 'en', 'ru', 'tr', 'uk'];

export const INTL_LOCALE: Record<WorldLang, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA' };

/** The site language as one of the six (unknown → en). */
export const useWorldLang = (): WorldLang => {
  const { i18n } = useTranslation();
  const l = (i18n.resolvedLanguage ?? i18n.language ?? 'az').slice(0, 2) as WorldLang;
  return LANGS.includes(l) ? l : 'en';
};
