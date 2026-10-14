import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import az from './az';
import de from './de';
import en from './en';
import ru from './ru';
import { details } from './details';
import { extra } from './extra';

export const LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      az: { translation: { ...az, ...details.az, ...extra.az } },
      de: { translation: { ...de, ...details.de, ...extra.de } },
      en: { translation: { ...en, ...details.en, ...extra.en } },
      ru: { translation: { ...ru, ...details.ru, ...extra.ru } },
    },
    fallbackLng: 'az',
    supportedLngs: LOCALES,
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    returnObjects: true,
    // ?lng=de in the URL wins (the mobile app opens web pages in the user's app language).
    detection: { order: ['querystring', 'localStorage', 'navigator'], lookupQuerystring: 'lng', caches: ['localStorage'], lookupLocalStorage: 'tv_lang' },
  });

// <html lang> drives CSS text-transform rules (Azerbaijani uppercases "i" as "İ"), so keep it in sync
// from the very first render, not only after a language switch.
const syncLang = (lng?: string) => {
  document.documentElement.lang = (lng ?? i18n.resolvedLanguage ?? 'az').slice(0, 2);
};
i18n.on('languageChanged', syncLang);
i18n.on('initialized', () => syncLang());
syncLang(i18n.resolvedLanguage);

export const currentLocale = (): Locale => {
  const l = (i18n.resolvedLanguage ?? i18n.language ?? 'az').slice(0, 2) as Locale;
  return LOCALES.includes(l) ? l : 'az';
};

export default i18n;

/**
 * Page-specific copy (About, Visas, Account…) is registered by the page module itself, so its text in
 * all four languages ships with that page's chunk instead of the bundle every visitor downloads.
 */
export const registerCopy = (bundle: Record<Locale, object>) => {
  LOCALES.forEach((l) => i18n.addResourceBundle(l, 'translation', bundle[l], true, false));
};
