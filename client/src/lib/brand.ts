import { useSyncExternalStore } from 'react';

/**
 * White-label brand of this instance (server/src/lib/brand). The HTML shell carries it in
 * <meta name="tv-brand"> (Caddy include of /__seo/brand), so the very first render already shows the right name;
 * in the Vite dev server (no include) the last known brand from localStorage or the default is used and
 * GET /api/site/brand refreshes it once the page is idle.
 *
 * Copy refers to the brand through i18next default variables ({{brand}}, {{brandUpper}}, {{brandHyphen}},
 * {{brandShort}}, {{brandDomain}}, {{brandWord}}, {{brandSlug}}; set in src/i18n/index.ts), components through useBrand().
 * The default is Triad Vision, so the owner's site renders exactly as before.
 */

export interface BrandIcons {
  favicon: string;
  faviconType: string;
  icon192: string;
  icon512: string;
  maskable192: string;
  maskable512: string;
  appleTouch: string;
  badge: string;
}

export interface Brand {
  name: string;
  shortName: string;
  tagline: string;
  domain: string;
  legalName: string;
  supportEmail: string;
  phone: string;
  country: string;
  footerText: string;
  languages: string[];
  defaultLanguage: string;
  primaryColor: string;
  logoLight: string;
  logoDark: string;
  icons: BrandIcons;
  isDefault: boolean;
}

export const DEFAULT_BRAND: Brand = {
  name: 'Triad Vision',
  shortName: 'Triad Vision',
  tagline: 'People · Work · Opportunities',
  domain: 'triad-vision.de',
  legalName: '',
  supportEmail: '',
  phone: '+994 50 748 70 48',
  country: 'DE',
  footerText: '',
  languages: ['az', 'de', 'en', 'ru', 'tr', 'uk'],
  defaultLanguage: 'az',
  primaryColor: '#0b1f44',
  logoLight: '',
  logoDark: '',
  icons: {
    favicon: '/favicon.svg',
    faviconType: 'image/svg+xml',
    icon192: '/icons/icon-192.png',
    icon512: '/icons/icon-512.png',
    maskable192: '/icons/icon-maskable-192.png',
    maskable512: '/icons/icon-maskable-512.png',
    appleTouch: '/icons/apple-touch-icon.png',
    badge: '/icons/badge-96.png',
  },
  isDefault: true,
};

const CACHE_KEY = 'tv_brand';
const SAFE = /^[^<>"&\\{}]*$/;
const ASSET = /^\/(uploads\/brand\/[a-z0-9/-]+\.png|icons\/[a-z0-9-]+\.png|favicon\.svg)$/;

const str = (v: unknown, fallback: string, max = 300) => (typeof v === 'string' && v.length <= max && SAFE.test(v) ? v : fallback);
const asset = (v: unknown, fallback: string) => (typeof v === 'string' && (v === '' || ASSET.test(v)) ? v : fallback);

/** Accepts only well-formed values (the meta tag and the cache are input like any other). */
export const sanitizeBrand = (raw: unknown): Brand | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, '', 60).trim();
  if (!name) return null;
  const icons = (r.icons && typeof r.icons === 'object' ? r.icons : {}) as Record<string, unknown>;
  const d = DEFAULT_BRAND;
  return {
    name,
    shortName: str(r.shortName, name, 30) || name,
    tagline: str(r.tagline, '', 80),
    domain: str(r.domain, d.domain, 200),
    legalName: str(r.legalName, '', 200),
    supportEmail: str(r.supportEmail, '', 200),
    phone: str(r.phone, '', 40),
    country: str(r.country, '', 2),
    footerText: str(r.footerText, '', 300),
    languages: Array.isArray(r.languages) ? r.languages.filter((l): l is string => typeof l === 'string' && /^[a-z]{2}$/.test(l)) : d.languages,
    defaultLanguage: str(r.defaultLanguage, 'az', 2),
    primaryColor: typeof r.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.primaryColor) ? r.primaryColor : d.primaryColor,
    logoLight: asset(r.logoLight, ''),
    logoDark: asset(r.logoDark, ''),
    icons: {
      favicon: asset(icons.favicon, d.icons.favicon) || d.icons.favicon,
      faviconType: icons.faviconType === 'image/png' ? 'image/png' : 'image/svg+xml',
      icon192: asset(icons.icon192, d.icons.icon192) || d.icons.icon192,
      icon512: asset(icons.icon512, d.icons.icon512) || d.icons.icon512,
      maskable192: asset(icons.maskable192, d.icons.maskable192) || d.icons.maskable192,
      maskable512: asset(icons.maskable512, d.icons.maskable512) || d.icons.maskable512,
      appleTouch: asset(icons.appleTouch, d.icons.appleTouch) || d.icons.appleTouch,
      badge: asset(icons.badge, d.icons.badge) || d.icons.badge,
    },
    isDefault: r.isDefault === true,
  };
};

const fromMeta = (): Brand | null => {
  if (typeof document === 'undefined') return null;
  const content = document.querySelector('meta[name="tv-brand"]')?.getAttribute('content');
  if (!content) return null;
  try {
    return sanitizeBrand(JSON.parse(content));
  } catch {
    return null;
  }
};

const fromCache = (): Brand | null => {
  try {
    return sanitizeBrand(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'));
  } catch {
    return null;
  }
};

const fromServer = fromMeta();
let current: Brand = fromServer ?? fromCache() ?? DEFAULT_BRAND;
const listeners = new Set<(b: Brand) => void>();

export const getBrand = () => current;

/** i18next default variables for copy ("{{brand}}" etc.). */
export const brandVars = (b: Brand = current) => ({
  brand: b.name,
  brandShort: b.shortName,
  brandUpper: b.name.toLocaleUpperCase('en'),
  brandHyphen: b.name.replace(/\s+/g, '-'),
  brandDomain: b.domain,
  /** First word ("Triad"): "your Triad contact". */
  brandWord: b.name.split(/\s+/)[0] ?? b.name,
  /** Lower-case, hyphenated ("triad-vision"): example addresses. */
  brandSlug: b.name.toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''),
});

export const onBrandChange = (fn: (b: Brand) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const setBrand = (next: Brand) => {
  const changed = JSON.stringify(next) !== JSON.stringify(current);
  current = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: this page only
  }
  if (changed) listeners.forEach((l) => l(next));
};

/** Called once at start-up (main.tsx): without the server-rendered tag, ask the API once the page is idle. */
export const initBrand = () => {
  if (fromServer) {
    setBrand(fromServer);
    return;
  }
  if (typeof fetch === 'undefined') return;
  const load = () =>
    fetch('/api/site/brand', { credentials: 'omit' })
      .then((r) => (r.ok ? (r.json() as Promise<{ brand?: unknown }>) : null))
      .then((data) => {
        const b = sanitizeBrand(data?.brand);
        if (b) setBrand(b);
      })
      .catch(() => undefined);
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) window.requestIdleCallback(() => void load(), { timeout: 3000 });
  else setTimeout(() => void load(), 800);
};

const subscribe = (cb: () => void) => onBrandChange(cb);
export const useBrand = (): Brand => useSyncExternalStore(subscribe, getBrand, getBrand);
