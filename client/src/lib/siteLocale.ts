/**
 * Language in the URL of the public site.
 *
 *   /visas          → Azerbaijani (x-default; the default language lives at the root so old links keep working)
 *   /de/visas       → German, likewise /en/…, /ru/…, /tr/…, /uk/…
 *
 * Private areas (portals, admin, one-off token pages) never carry a prefix: their language is the visitor's
 * choice (localStorage), and a prefixed link into them is rewritten to the bare path (lib/localeRouter.tsx).
 * Mirrors server/src/lib/seoCatalogue.ts (SITE_LOCALES, PREFIX_LOCALES, ROUTING_PRIVATE_PREFIXES).
 *
 * No imports: i18n/index.ts uses this before i18next is initialised.
 */
export const SITE_LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];

/** Languages with a path prefix (az is the root). */
export const PREFIX_LOCALES = ['de', 'en', 'ru', 'tr', 'uk'] as const satisfies readonly SiteLocale[];

/** Languages with a separate, lazily loaded copy chunk (i18n/site/<lng>). */
export const EXTRA_LOCALES = ['tr', 'uk'] as const satisfies readonly SiteLocale[];
export type ExtraLocale = (typeof EXTRA_LOCALES)[number];

export const SITE_LANGUAGE_NAMES: Record<SiteLocale, string> = {
  az: 'Azərbaycan',
  de: 'Deutsch',
  en: 'English',
  ru: 'Русский',
  tr: 'Türkçe',
  uk: 'Українська',
};

export const isSiteLocale = (v: unknown): v is SiteLocale => typeof v === 'string' && (SITE_LOCALES as readonly string[]).includes(v);
const isPrefixLocale = (v: string): boolean => (PREFIX_LOCALES as readonly string[]).includes(v);

/** Areas that never get a language prefix (and are never indexed). */
export const ROUTING_PRIVATE_PREFIXES = [
  '/admin',
  '/workspace',
  '/account',
  '/company',
  '/agent',
  '/partner',
  '/api',
  '/uploads',
  '/booking/manage',
  '/review',
  '/verify-email',
  '/login/2fa',
  '/reset-password',
  '/sign',
  '/angebot',
  '/share',
  '/q',
  '/survey',
  '/check-in',
  '/unsubscribe',
  '/kandidat',
  '/job-alert', // job alert confirm / manage link (token)
];

export const isPrivatePath = (path: string) => ROUTING_PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/** "/de/visas" → { lang: 'de', rest: '/visas' }; "/visas" → { lang: null, rest: '/visas' }. */
export const splitLocalePath = (pathname: string): { lang: SiteLocale | null; rest: string } => {
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(pathname);
  if (m && isPrefixLocale(m[1])) return { lang: m[1] as SiteLocale, rest: m[2] && m[2] !== '/' ? m[2] : '/' };
  return { lang: null, rest: pathname || '/' };
};

/** Path of a public page in a language: localePath('/visas', 'de') → '/de/visas'. Private paths stay bare. */
export const withLocale = (path: string, lng: SiteLocale | null | undefined) => {
  const cut = path.search(/[?#]/);
  const tail = cut < 0 ? '' : path.slice(cut);
  const { rest } = splitLocalePath((cut < 0 ? path : path.slice(0, cut)) || '/');
  if (!lng || lng === 'az' || isPrivatePath(rest)) return rest + tail;
  return `/${lng}${rest === '/' ? '' : rest}${tail}`;
};

const STORAGE_KEY = 'tv_lang';

const storedLanguage = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * Runs once before the router and i18next start:
 *  - /az/… → /… (az lives at the root; Caddy does the same with a 301 in production)
 *  - ?lng=xx on a public page → /xx/… (production answers these with a 301 already)
 *  - a bare public URL opened by a visitor who explicitly chose another language before (stored) → /xx/…
 * Crawlers have no stored language, so the root always shows Azerbaijani to them.
 */
export const initialLocaleRedirect = () => {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  let path = pathname;
  const az = /^\/az(\/.*)?$/.exec(path);
  if (az) path = az[1] || '/';
  const { lang, rest } = splitLocalePath(path);
  if (lang || isPrivatePath(rest)) {
    if (path !== pathname) window.history.replaceState(window.history.state, '', path + search + hash);
    return;
  }
  const params = new URLSearchParams(search);
  const fromQuery = params.get('lng');
  let target: string | null = null;
  if (fromQuery !== null) {
    params.delete('lng');
    target = isSiteLocale(fromQuery) ? fromQuery : null;
  } else {
    const stored = storedLanguage();
    target = stored && isPrefixLocale(stored) ? stored : null;
  }
  const qs = params.toString();
  const next = withLocale(rest, target as SiteLocale | null) + (qs ? `?${qs}` : '') + hash;
  if (next !== pathname + search + hash) window.history.replaceState(window.history.state, '', next);
};

/** i18next-browser-languagedetector plugin: the URL decides the language of public pages. */
export const pathLanguageDetector = {
  name: 'tvPath',
  lookup: (): string | undefined => {
    if (typeof window === 'undefined') return undefined;
    const { lang, rest } = splitLocalePath(window.location.pathname);
    if (lang) return lang;
    return isPrivatePath(rest) ? undefined : 'az';
  },
};
