import { startTransition } from 'react';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import az, { type Messages } from './az';
import { details } from './details';
import { extra } from './extra';
import { uiCopy } from './ui';
import { EXTRA_LOCALES, SITE_LOCALES, initialLocaleRedirect, pathLanguageDetector, type ExtraLocale, type SiteLocale } from '@/lib/siteLocale';

/** Content languages: every CMS text, e-mail and stored user locale exists in these four. */
export const LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export { SITE_LOCALES, type SiteLocale };

// /az/… → /…, ?lng=xx → /xx/…, stored language → its prefix (before the detector reads the URL).
initialLocaleRedirect();

const detector = new LanguageDetector();
detector.addDetector(pathLanguageDetector);

void i18n
  .use(detector)
  .use(initReactI18next)
  .init({
    // az (the root language and everyone's fallback) ships with the bundle; the de / en / ru main copy is
    // loaded before the first render in that language (loadCore below, preloaded from the HTML shell).
    resources: {
      az: { translation: { ...az, ...details.az, ...extra.az, ...uiCopy.az } },
      de: { translation: { ...details.de, ...extra.de, ...uiCopy.de } },
      en: { translation: { ...details.en, ...extra.en, ...uiCopy.en } },
      ru: { translation: { ...details.ru, ...extra.ru, ...uiCopy.ru } },
    },
    // tr / uk: strings not translated yet (mostly portal screens) fall back to English.
    fallbackLng: { tr: ['en', 'az'], uk: ['en', 'az'], default: ['az'] },
    supportedLngs: SITE_LOCALES,
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    returnObjects: true,
    // Public pages: the URL prefix decides (/de/…; the root is az). Portals: ?lng=de (the mobile app opens
    // web pages in the user's app language), then the stored choice, then the browser.
    detection: {
      order: ['tvPath', 'querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lng',
      caches: ['localStorage'],
      lookupLocalStorage: 'tv_lang',
    },
  });

// <html lang> drives CSS text-transform rules (Azerbaijani uppercases "i" as "İ"), so keep it in sync
// from the very first render, not only after a language switch.
const syncLang = (lng?: string) => {
  document.documentElement.lang = (lng ?? i18n.resolvedLanguage ?? 'az').slice(0, 2);
};
i18n.on('languageChanged', syncLang);
i18n.on('initialized', () => syncLang());
syncLang(i18n.resolvedLanguage);

const siteLocaleOf = (lng: string | undefined): SiteLocale => {
  const l = (lng ?? 'az').slice(0, 2);
  return (SITE_LOCALES as readonly string[]).includes(l) ? (l as SiteLocale) : 'az';
};

/** The UI language, including the site-only languages tr / uk. */
export const currentSiteLocale = (): SiteLocale => siteLocaleOf(i18n.resolvedLanguage ?? i18n.language);

/** Content language for CMS texts and the API: tr / uk read (and store) English. */
export const toContentLocale = (lng: string | undefined): Locale => {
  const l = siteLocaleOf(lng);
  return l === 'tr' || l === 'uk' ? 'en' : l;
};

export const currentLocale = (): Locale => toContentLocale(i18n.resolvedLanguage ?? i18n.language);

export default i18n;

// ─── de / en / ru main copy and tr / uk: chunks loaded on demand ─────────

type CoreLocale = Exclude<Locale, 'az'>;
const CORE: Record<CoreLocale, () => Promise<{ default: Messages }>> = {
  de: () => import('./de'),
  en: () => import('./en'),
  ru: () => import('./ru'),
};
const pendingCore: Partial<Record<CoreLocale, Promise<void>>> = {};

/**
 * Main copy of a content language (~8 KB gzip each). Same layering as when all four shipped in the bundle:
 * the main file, then details / extra / ui on top (shallow), and it wins over page copy registered meanwhile.
 * Components already rendered with a fallback re-render (languageChanged), also those using getFixedT.
 */
const loadCore = (l: Locale): Promise<void> => {
  if (l === 'az') return Promise.resolve();
  pendingCore[l] ??= CORE[l]()
    .then((m) => {
      i18n.addResourceBundle(l, 'translation', { ...m.default, ...details[l], ...extra[l], ...uiCopy[l] }, true, true);
      startTransition(() => {
        i18n.emit('languageChanged', i18n.language);
      });
    })
    .catch((err) => {
      delete pendingCore[l];
      console.warn('[i18n] could not load', l, err);
    });
  return pendingCore[l]!;
};

/**
 * The other content languages, once the page is idle: getFixedT(lng) (legal texts in another language, the
 * language list in the profile, unsubscribe pages in the recipient's language) needs their copy too.
 */
export const preloadAllLanguages = () => {
  LOCALES.forEach((l) => void loadCore(l));
};

const pendingExtra: Partial<Record<ExtraLocale, Promise<void>>> = {};
const isExtra = (lng: string): lng is ExtraLocale => (EXTRA_LOCALES as readonly string[]).includes(lng);

/**
 * Makes sure the copy of a language is in i18next before it is shown. az ships with the bundle; de / en / ru
 * main copy is a small chunk each; the Turkish and Ukrainian copy (~50 KB gzip each, on top of English, their
 * fallback) is its own chunk, fetched only by visitors who use it.
 */
export const loadSiteLanguage = (lng: string): Promise<void> => {
  const l = siteLocaleOf(lng);
  const core = loadCore(toContentLocale(l));
  if (!isExtra(l)) return core;
  pendingExtra[l] ??= (l === 'tr' ? import('./site/tr') : import('./site/uk'))
    .then((m) => {
      // deep, no overwrite: copy a page module registered earlier (registerCopy) stays as it is.
      i18n.addResourceBundle(l, 'translation', m.default, true, false);
    })
    .catch((err) => {
      delete pendingExtra[l];
      console.warn('[i18n] could not load', l, err);
    });
  return Promise.all([core, pendingExtra[l]]).then(() => undefined);
};

/** Resolves once the starting language's copy is available (main.tsx renders after it). */
export const i18nReady = (): Promise<void> => loadSiteLanguage(i18n.language);

/** Changes the UI language (after loading its copy), as a non-blocking React transition. */
export const setUiLanguage = (lng: SiteLocale): Promise<void> =>
  loadSiteLanguage(lng).then(() => {
    startTransition(() => {
      void i18n.changeLanguage(lng);
    });
  });

/** Set by lib/localeRouter.tsx: moves a public page to its URL in another language. */
let localeNavigator: ((lng: SiteLocale) => boolean) | null = null;
export const setLocaleNavigator = (fn: ((lng: SiteLocale) => boolean) | null) => {
  localeNavigator = fn;
};

/**
 * Switches the UI language without blocking the page. On a public page this navigates to the page's URL in
 * that language (/de/visas → /tr/visas) — the router then applies the language; in the portals only the
 * language changes. Every component that calls useTranslation re-renders on a language change; marking that
 * update as a React transition lets React split the work across frames, so the click is acknowledged
 * instantly instead of freezing for the whole re-render.
 */
export const switchLanguage = (lng: SiteLocale) => {
  void loadSiteLanguage(lng).then(() => {
    if (localeNavigator?.(lng)) return;
    void setUiLanguage(lng);
  });
};

/**
 * Page-specific copy (About, Visas, Account…) is registered by the page module itself, so its text in
 * all four languages ships with that page's chunk instead of the bundle every visitor downloads.
 * A bundle may also carry Turkish / Ukrainian copy (site pages written for all six languages).
 */
export const registerCopy = (bundle: Record<Locale, object> & Partial<Record<ExtraLocale, object>>) => {
  LOCALES.forEach((l) => i18n.addResourceBundle(l, 'translation', bundle[l], true, false));
  EXTRA_LOCALES.forEach((l) => {
    const copy = bundle[l];
    if (copy) i18n.addResourceBundle(l, 'translation', copy, true, false);
  });
};
