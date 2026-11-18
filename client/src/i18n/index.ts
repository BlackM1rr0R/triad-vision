import { startTransition } from 'react';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import az, { type Messages } from './az';
import { details } from './details';
import { extra } from './extra';
import { uiCopy } from './ui';
import { EXTRA_LOCALES, SITE_LOCALES, initialLocaleRedirect, pathLanguageDetector, type ExtraLocale, type SiteLocale } from '@/lib/siteLocale';
import { brandVars, onBrandChange } from '@/lib/brand';
import { isHydrating } from '@/lib/ssr';

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
    // White-label: copy says {{brand}} (and {{brandUpper}}, {{brandHyphen}}, {{brandShort}}, {{brandDomain}}) instead
    // of the literal name; every t() / getFixedT() call fills them in from the instance brand (src/lib/brand.ts).
    interpolation: { escapeValue: false, defaultVariables: brandVars() },
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

// A brand change (System → Brand saved, or the API's answer in the dev server) re-renders every translated text.
onBrandChange(() => {
  const vars = i18n.options.interpolation?.defaultVariables;
  if (vars) Object.assign(vars, brandVars());
  startTransition(() => {
    i18n.emit('languageChanged', i18n.language);
  });
});

// <html lang> drives CSS text-transform rules (Azerbaijani uppercases "i" as "İ"), so keep it in sync
// from the very first render, not only after a language switch.
const syncLang = (lng?: string) => {
  if (typeof document === 'undefined') return; // server render (entry-server.tsx)
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
  LOCALES.forEach((l) => void loadLazyCopies(l));
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
  const core = Promise.all([loadCore(toContentLocale(l)), loadLazyCopies(l)]).then(() => undefined);
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

/**
 * Resolves once the starting language's copy is available (main.tsx renders after it). i18next picked
 * `resolvedLanguage` at init, when tr / uk had no copy yet (it said "en"); resolving again now makes the first
 * render use the URL's language everywhere (links, formats), like the server render (entry-server.tsx).
 */
export const i18nReady = (): Promise<void> =>
  loadSiteLanguage(i18n.language).then(async () => {
    if (i18n.resolvedLanguage !== i18n.language && i18n.hasResourceBundle(i18n.language, 'translation')) await i18n.changeLanguage(i18n.language);
  });

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

// ─── Page copy split per language (vite/lazyCopy.ts) ─────────

/**
 * `import copy from '@/i18n/pagesXxx?lazy-copy'`: one loader per language of the module, and the languages that
 * have every key of the az copy (their fallback is then never read, so the az chunk is not needed for them).
 */
export type CopyLoaders = Partial<Record<SiteLocale, () => Promise<object>>> & { complete?: readonly string[] };

const lazyCopies: CopyLoaders[] = [];
const lazyLoaded = new WeakMap<CopyLoaders, Map<SiteLocale, Promise<void>>>();
let addQueue: Promise<void> = Promise.resolve();

/** A language and the fallbacks i18next may read for it (fallbackLng above); az is skipped where never read. */
const copyChain = (copy: CopyLoaders, l: SiteLocale): SiteLocale[] => {
  const withAz = (x: SiteLocale): SiteLocale[] => (copy.complete?.includes(x) ? [x] : [x, 'az']);
  if (l === 'az') return ['az'];
  return isExtra(l) ? [l, ...withAz('en')] : withAz(l);
};

/** Loads one module's copy of a language and its fallbacks; true when something had to be fetched. */
const loadCopyChain = (copy: CopyLoaders, l: SiteLocale): { started: boolean; done: Promise<void> } => {
  let map = lazyLoaded.get(copy);
  if (!map) lazyLoaded.set(copy, (map = new Map()));
  let started = false;
  const done = copyChain(copy, l).map((x) => {
    const load = copy[x];
    if (!load) return Promise.resolve();
    let p = map.get(x);
    if (!p) {
      started = true;
      const fetched = load();
      // Fetched in parallel, added in the order they were asked for (as registerCopy calls run in module order):
      // the same deep, no-overwrite merge, so a key two modules share keeps the same winner.
      p = addQueue = addQueue.then(() =>
        fetched.then(
          (c) => {
            i18n.addResourceBundle(x, 'translation', c, true, false);
          },
          (err: unknown) => {
            map.delete(x);
            console.warn('[i18n] could not load page copy', x, err);
          },
        ),
      );
      map.set(x, p);
    }
    return p;
  });
  return { started, done: Promise.all(done).then(() => undefined) };
};

/** Every split page copy registered so far, in a language (before switching to it, see loadSiteLanguage). */
const loadLazyCopies = (l: SiteLocale): Promise<void> => Promise.all(lazyCopies.map((c) => loadCopyChain(c, l).done)).then(() => undefined);

const whenInitialized = () =>
  i18n.isInitialized ? Promise.resolve() : new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));

const pendingCopies = new Set<Promise<void>>();
const awaitedCopies = new WeakSet<Promise<void>>();

/** Renders the translated texts again (after the hydration: an update then would discard server markup). */
const rerenderTexts = () => {
  if (import.meta.env.SSR) return;
  if (isHydrating()) {
    window.setTimeout(rerenderTexts, 250);
    return;
  }
  startTransition(() => {
    i18n.emit('languageChanged', i18n.language);
  });
};

/**
 * registerCopy for a module split per language: called at the top of the module like registerCopy, it loads only
 * the copy of the current language (and the fallbacks i18next may read). Route pages wait for it before they
 * render (lib/lazyRoute.tsx awaits copyReady() after importing the page chunk, which ran the registrations of the
 * page and everything it imports), so the page — and the server render — shows its copy from the first paint.
 * Copy that nothing waited for (a chunk loaded some other way) re-renders the texts once it is in. Other languages
 * follow when the UI switches to them (loadSiteLanguage) or, for getFixedT, once the page is idle
 * (preloadAllLanguages) — as with the main copy.
 */
export const registerLazyCopy = (...copies: CopyLoaders[]): Promise<void> => {
  copies.forEach((c) => {
    if (!lazyCopies.includes(c)) lazyCopies.push(c);
  });
  let fetched = false;
  const p = whenInitialized().then(() => {
    const loads = copies.map((c) => loadCopyChain(c, siteLocaleOf(i18n.language)));
    fetched = loads.some((r) => r.started);
    return Promise.all(loads.map((r) => r.done)).then(() => undefined);
  });
  pendingCopies.add(p);
  void p.then(() => {
    pendingCopies.delete(p);
    if (fetched && !awaitedCopies.has(p)) rerenderTexts();
  });
  return p;
};

/** Resolves once every split page copy registered so far is loaded (lib/lazyRoute.tsx, before a page renders). */
export const copyReady = async (): Promise<void> => {
  while (pendingCopies.size) {
    const list = [...pendingCopies];
    list.forEach((p) => awaitedCopies.add(p));
    await Promise.all(list);
  }
};

// A language change that did not go through loadSiteLanguage (i18n.changeLanguage elsewhere): fetch what is
// missing and render again once it is there (like loadCore).
i18n.on('languageChanged', (lng) => {
  const l = siteLocaleOf(lng);
  const loads = lazyCopies.map((c) => loadCopyChain(c, l)).filter((r) => r.started);
  if (!loads.length) return;
  void Promise.all(loads.map((r) => r.done)).then(() => {
    startTransition(() => {
      i18n.emit('languageChanged', i18n.language);
    });
  });
});
