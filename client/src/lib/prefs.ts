import { useSyncExternalStore } from 'react';

/**
 * Display and accessibility preferences, shared by the public site, the client portal and the admin
 * panel. Persisted in localStorage under `tv_prefs`; the inline script in index.html reads the same
 * key before React loads so the page never flashes the wrong theme or text size.
 */

export type Theme = 'light' | 'dark' | 'system';
export type FontScale = 100 | 112 | 125 | 150;
export type LineHeight = 1 | 1.5 | 2;
export type LetterSpacing = 0 | 0.05 | 0.1;
export type ColorMode = 'normal' | 'gray' | 'invert';

export interface Prefs {
  theme: Theme;
  contrast: boolean;
  fontScale: FontScale;
  lineHeight: LineHeight;
  letterSpacing: LetterSpacing;
  readableFont: boolean;
  bigCursor: boolean;
  highlightLinks: boolean;
  hideImages: boolean;
  colorMode: ColorMode;
  ruler: boolean;
  focusRing: boolean;
  noMotion: boolean;
  speech: boolean;
  speechRate: number;
  visualAlerts: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  contrast: false,
  fontScale: 100,
  lineHeight: 1,
  letterSpacing: 0,
  readableFont: false,
  bigCursor: false,
  highlightLinks: false,
  hideImages: false,
  colorMode: 'normal',
  ruler: false,
  focusRing: false,
  noMotion: false,
  speech: false,
  speechRate: 1,
  visualAlerts: false,
};

export const PREFS_KEY = 'tv_prefs';

const ALL_CLASSES = [
  'a11y-contrast',
  'a11y-lineheight-15',
  'a11y-lineheight-20',
  'a11y-spacing-05',
  'a11y-spacing-10',
  'a11y-font',
  'a11y-cursor',
  'a11y-links',
  'a11y-noimg',
  'a11y-gray',
  'a11y-invert',
  'a11y-ruler',
  'a11y-focus',
  'a11y-nomotion',
  'a11y-visual-alerts',
];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const oneOf = <T,>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

const sanitize = (raw: unknown): Prefs => {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_PREFS;
  const rate = typeof r.speechRate === 'number' && Number.isFinite(r.speechRate) ? Math.min(2, Math.max(0.5, r.speechRate)) : d.speechRate;
  return {
    theme: oneOf<Theme>(r.theme, ['light', 'dark', 'system'], d.theme),
    contrast: bool(r.contrast, d.contrast),
    fontScale: oneOf<FontScale>(r.fontScale, [100, 112, 125, 150], d.fontScale),
    lineHeight: oneOf<LineHeight>(r.lineHeight, [1, 1.5, 2], d.lineHeight),
    letterSpacing: oneOf<LetterSpacing>(r.letterSpacing, [0, 0.05, 0.1], d.letterSpacing),
    readableFont: bool(r.readableFont, d.readableFont),
    bigCursor: bool(r.bigCursor, d.bigCursor),
    highlightLinks: bool(r.highlightLinks, d.highlightLinks),
    hideImages: bool(r.hideImages, d.hideImages),
    colorMode: oneOf<ColorMode>(r.colorMode, ['normal', 'gray', 'invert'], d.colorMode),
    ruler: bool(r.ruler, d.ruler),
    focusRing: bool(r.focusRing, d.focusRing),
    noMotion: bool(r.noMotion, d.noMotion),
    speech: bool(r.speech, d.speech),
    speechRate: rate,
    visualAlerts: bool(r.visualAlerts, d.visualAlerts),
  };
};

const read = (): Prefs => {
  try {
    return sanitize(JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

const write = (p: Prefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // storage unavailable: preferences live for this page only
  }
};

/** `?theme=dark|light|system` on first load sets the preference (used by tests and screenshots). */
const fromQuery = (p: Prefs): Prefs => {
  try {
    const q = new URLSearchParams(window.location.search).get('theme');
    if (q === 'dark' || q === 'light' || q === 'system') return { ...p, theme: q };
  } catch {
    // no window / malformed URL
  }
  return p;
};

let prefs: Prefs = typeof window === 'undefined' ? { ...DEFAULT_PREFS } : fromQuery(read());
const listeners = new Set<() => void>();
const media = typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export const resolveTheme = (theme: Theme): 'light' | 'dark' => (theme === 'system' ? (media?.matches ? 'dark' : 'light') : theme);

/** Writes the current preferences onto <html> (theme attribute, a11y classes, font size). */
export const applyPrefs = (p: Prefs = prefs) => {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const resolved = resolveTheme(p.theme);
  html.setAttribute('data-theme', resolved);
  html.style.colorScheme = resolved;

  const on = new Set<string>();
  if (p.contrast) on.add('a11y-contrast');
  if (p.lineHeight === 1.5) on.add('a11y-lineheight-15');
  if (p.lineHeight === 2) on.add('a11y-lineheight-20');
  if (p.letterSpacing === 0.05) on.add('a11y-spacing-05');
  if (p.letterSpacing === 0.1) on.add('a11y-spacing-10');
  if (p.readableFont) on.add('a11y-font');
  if (p.bigCursor) on.add('a11y-cursor');
  if (p.highlightLinks) on.add('a11y-links');
  if (p.hideImages) on.add('a11y-noimg');
  if (p.colorMode === 'gray') on.add('a11y-gray');
  if (p.colorMode === 'invert') on.add('a11y-invert');
  if (p.ruler) on.add('a11y-ruler');
  if (p.focusRing) on.add('a11y-focus');
  if (p.noMotion) on.add('a11y-nomotion');
  if (p.visualAlerts) on.add('a11y-visual-alerts');
  ALL_CLASSES.forEach((c) => html.classList.toggle(c, on.has(c)));

  html.style.fontSize = p.fontScale === 100 ? '' : `${p.fontScale}%`;
};

const emit = () => listeners.forEach((l) => l());

export const getPrefs = () => prefs;

export const setPrefs = (patch: Partial<Prefs>) => {
  prefs = sanitize({ ...prefs, ...patch });
  write(prefs);
  applyPrefs(prefs);
  emit();
};

export const resetPrefs = () => setPrefs({ ...DEFAULT_PREFS });

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const serverSnapshot = () => DEFAULT_PREFS;

/** Reactive preferences: re-renders the caller whenever any preference changes. */
export const usePrefs = () => useSyncExternalStore(subscribe, getPrefs, serverSnapshot);

// Resolved theme as its own store, so components that only care about light/dark re-render on
// OS changes while the preference stays "system".
let resolved: 'light' | 'dark' = resolveTheme(prefs.theme);
const resolvedListeners = new Set<() => void>();
const syncResolved = () => {
  const next = resolveTheme(prefs.theme);
  if (next === resolved) return;
  resolved = next;
  resolvedListeners.forEach((l) => l());
};
listeners.add(syncResolved);
media?.addEventListener?.('change', () => {
  applyPrefs(prefs);
  syncResolved();
});

export const useResolvedTheme = () =>
  useSyncExternalStore(
    (l) => {
      resolvedListeners.add(l);
      return () => {
        resolvedListeners.delete(l);
      };
    },
    () => resolved,
    () => 'light' as const,
  );

// Apply once on module load (the inline script already did the attribute/classes; this keeps JS state in sync
// and persists a `?theme=` override).
if (typeof window !== 'undefined') {
  write(prefs);
  applyPrefs(prefs);
}
