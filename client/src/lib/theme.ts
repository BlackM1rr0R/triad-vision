import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { Density, SiteTheme, ThemeVars } from './contrast';

/**
 * Runtime side of the design system (tokens: src/index.css):
 * - the site theme (SUPER_ADMIN → System settings → Theme): CSS variables from GET /api/site/theme, set on
 *   <html> and cached in localStorage so the next visit paints with them at once;
 * - the surface flavour: `data-surface="admin"` (crisp staff workspace) or `"public"` (marketing site, serif
 *   display headings) on <html> while that layout is mounted; the client / company / partner portals keep the
 *   default (warm) surface;
 * - the admin table density (`data-density` on <html>): per user in localStorage, else the theme default.
 */

const THEME_CACHE = 'tv_theme';
const DENSITY_KEY = 'tv_density';
const THEME_VAR_RE = /^--tv-[a-z-]+$/;
const VALUE_RE = /^[#a-zA-Z0-9.,()% -]{1,40}$/;

const root = () => (typeof document === 'undefined' ? null : document.documentElement);

/** Sets the theme variables on <html> (only `--tv-*` names with plain colour / number values). */
export const applyThemeVars = (vars: ThemeVars | null | undefined) => {
  const html = root();
  if (!html || !vars) return;
  for (const [k, v] of Object.entries(vars)) if (THEME_VAR_RE.test(k) && VALUE_RE.test(v)) html.style.setProperty(k, v);
};

/** Removes every theme variable from <html> (back to the defaults in index.css). */
export const clearThemeVars = () => {
  const html = root();
  if (!html) return;
  for (const name of Array.from(html.style)) if (name.startsWith('--tv-')) html.style.removeProperty(name);
};

type Cached = { theme: SiteTheme; vars: ThemeVars };
let current: Cached | null = null;
const themeListeners = new Set<() => void>();

const readCache = (): Cached | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(THEME_CACHE) ?? 'null') as Cached | null;
    return raw && typeof raw === 'object' && raw.vars && raw.theme ? raw : null;
  } catch {
    return null;
  }
};

/** Applies a theme response (and caches it). */
export const setSiteTheme = (next: Cached) => {
  clearThemeVars();
  applyThemeVars(next.vars);
  current = next;
  try {
    localStorage.setItem(THEME_CACHE, JSON.stringify(next));
  } catch {
    // storage unavailable: applied for this page only
  }
  applyDensity();
  themeListeners.forEach((l) => l());
};

/** Called once at start-up (main.tsx): cached theme now, fresh theme after the first paint. */
export const initSiteTheme = () => {
  current = readCache();
  if (current) applyThemeVars(current.vars);
  applyDensity();
  if (typeof fetch === 'undefined') return;
  const load = () =>
    fetch('/api/site/theme', { credentials: 'omit' })
      .then((r) => (r.ok ? (r.json() as Promise<Cached>) : null))
      .then((data) => {
        if (data?.vars && JSON.stringify(data) !== JSON.stringify(current)) setSiteTheme(data);
      })
      .catch(() => undefined);
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) window.requestIdleCallback(() => void load(), { timeout: 3000 });
  else setTimeout(() => void load(), 800);
};

export const useSiteThemeSnapshot = () =>
  useSyncExternalStore(
    (l) => {
      themeListeners.add(l);
      return () => themeListeners.delete(l);
    },
    () => current,
    () => null,
  );

// ─── Density ────────────────────────────────────────────────────────────

const densityListeners = new Set<() => void>();
const readDensity = (): Density | null => {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    return v === 'compact' || v === 'comfortable' ? v : null;
  } catch {
    return null;
  }
};
/** The density in effect: the user's choice, else the theme default. */
export const effectiveDensity = (): Density => readDensity() ?? current?.theme.defaultDensity ?? 'comfortable';

const applyDensity = () => {
  const html = root();
  if (!html) return;
  html.setAttribute('data-density', effectiveDensity());
  densityListeners.forEach((l) => l());
};

/** Saves the user's own density (null = follow the theme default). */
export const setDensity = (d: Density | null) => {
  try {
    if (d) localStorage.setItem(DENSITY_KEY, d);
    else localStorage.removeItem(DENSITY_KEY);
  } catch {
    // storage unavailable: this page only
  }
  applyDensity();
};

export const useDensity = () =>
  useSyncExternalStore(
    (l) => {
      densityListeners.add(l);
      return () => densityListeners.delete(l);
    },
    effectiveDensity,
    () => 'comfortable' as Density,
  );

// ─── Surface ────────────────────────────────────────────────────────────

export type Surface = 'admin' | 'public' | 'portal';

/** Marks <html> with the layout's surface flavour while the layout is mounted (overlays in portals follow). */
export const useSurface = (surface: Surface) => {
  useLayoutEffect(() => {
    const html = root();
    if (!html) return;
    const prev = html.getAttribute('data-surface');
    html.setAttribute('data-surface', surface);
    return () => {
      if (html.getAttribute('data-surface') !== surface) return;
      if (prev && prev !== surface) html.setAttribute('data-surface', prev);
      else html.removeAttribute('data-surface');
    };
  }, [surface]);
};
