/**
 * Shared helpers of the learning games (/german-simulator, /pronunciation, /price-game, /traffic-signs,
 * /waste-sorting): translated content strings, progress in localStorage (best effort, never required) and
 * small deterministic utilities. No React here, so the unit tests can import it.
 */
import type { SiteLocale } from '@/lib/siteLocale';

/** A content text in the six site languages (German is the original where the content is German). */
export type Tx = Record<SiteLocale, string>;
/** Translations of a German line (the German itself is shown as is). */
export type TxNoDe = Omit<Tx, 'de'>;

/** The text in `lng`; tr / uk fall back to English, everything to English, then Azerbaijani. */
export const pickTx = (tx: Partial<Tx>, lng: string): string => {
  const l = lng.slice(0, 2) as SiteLocale;
  return tx[l] || tx.en || tx.az || '';
};

const PREFIX = 'tv.games.';

/** Reads a JSON value saved by `saveProgress`; any error (private mode, blocked storage, bad JSON) gives `fallback`. */
export const loadProgress = <T>(key: string, fallback: T): T => {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as T;
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

/** Saves a small JSON value (best scores, mastered items); silently ignores storage errors. */
export const saveProgress = (key: string, value: unknown) => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: progress simply is not kept */
  }
};

/** Deterministic PRNG (mulberry32) so a seed in a share link reproduces the same rounds. */
export const seededRandom = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Fisher–Yates shuffle with the given random source (a copy; the input stays as is). */
export const shuffle = <T>(list: readonly T[], rnd: () => number = Math.random): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** "1:05" from seconds. */
export const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
