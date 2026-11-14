import { useSyncExternalStore } from 'react';
import type { L10n } from '@/lib/types';
import { CITIES, cityBySlug, type City } from '@/lib/cities/data';
import { cityCoords } from '@/components/about/geo';

/**
 * Vacancy comparison list (2–3 vacancies, /compare-jobs?v=a,b,c). Kept in sessionStorage for this visit only:
 * it is a tool the visitor operates themselves (strictly necessary, no consent needed) and never leaves the
 * browser. The server snapshot is always empty, so server-rendered pages hydrate without a mismatch.
 */

export const COMPARE_MAX = 3;
const KEY = 'tv.jobs.compare';

export interface CompareItem {
  slug: string;
  title: L10n;
  city: string | null;
}

let items: CompareItem[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const EMPTY: CompareItem[] = [];

const load = () => {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as unknown;
    if (Array.isArray(v)) items = v.filter((x): x is CompareItem => !!x && typeof (x as CompareItem).slug === 'string').slice(0, COMPARE_MAX);
  } catch {
    items = [];
  }
};

const save = (next: CompareItem[]) => {
  items = next;
  try {
    if (next.length) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // storage blocked: the list lasts for this page view
  }
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    loaded = false;
    load();
    l();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
};

const snapshot = () => {
  load();
  return items;
};

export const useCompareList = () => useSyncExternalStore(subscribe, snapshot, () => EMPTY);

export const compareActions = {
  has: (slug: string) => snapshot().some((x) => x.slug === slug),
  /** Adds or removes; false when the list is full (the item is not added). */
  toggle: (item: CompareItem): boolean => {
    const list = snapshot();
    if (list.some((x) => x.slug === item.slug)) {
      save(list.filter((x) => x.slug !== item.slug));
      return true;
    }
    if (list.length >= COMPARE_MAX) return false;
    save([...list, { slug: item.slug, title: item.title, city: item.city }]);
    return true;
  },
  remove: (slug: string) => save(snapshot().filter((x) => x.slug !== slug)),
  clear: () => save([]),
};

/** Comparison URL; the slugs keep their order. */
export const compareHref = (slugs: string[]) => `/compare-jobs?v=${slugs.map(encodeURIComponent).join(',')}`;

/** Slugs of a ?v= parameter (comma separated, de-duplicated, at most COMPARE_MAX). */
export const slugsFromParam = (v: string | null) =>
  [...new Set((v ?? '').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9][a-z0-9-]{0,190}$/i.test(s)))].slice(0, COMPARE_MAX);

// ─── Vacancy city → cost-of-living profile ─────────────────────────────

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ü/g, 'ue')
    .replace(/ö/g, 'oe')
    .replace(/ä/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/\s+(am|an der|a\.)\s+.*$/, '')
    .replace(/[^a-z]+/g, '');

const distKm = (a: [number, number], b: [number, number]) => {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad);
  const y = (b[1] - a[1]) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
};

/** Within this distance a place uses the nearby big city's profile (commuter belt). */
const NEAR_KM = 40;

export type CityMatch = { city: City; how: 'exact' | 'near' | 'small' };

/**
 * The city profile for a vacancy's place: the same city, a big city within NEAR_KM (known coordinates), else the
 * "small town" profile. Null without a place.
 */
export const costCityFor = (place: string | null | undefined): CityMatch | null => {
  if (!place?.trim()) return null;
  const n = norm(place.split(/[,(/]/)[0]);
  const big = CITIES.filter((c) => c.slug !== 'small-town');
  const exact = big.find((c) => norm(c.slug) === n || Object.values(c.name).some((x) => norm(x) === n));
  if (exact) return { city: exact, how: 'exact' };
  const at = cityCoords(place.split(/[,(/]/)[0]);
  if (at) {
    let best: { c: City; d: number } | null = null;
    for (const c of big) {
      const cc = cityCoords(c.name.de) ?? cityCoords(c.name.en);
      if (!cc) continue;
      const d = distKm(at, cc);
      if (d <= NEAR_KM && (!best || d < best.d)) best = { c, d };
    }
    if (best) return { city: best.c, how: 'near' };
  }
  const small = cityBySlug('small-town');
  return small ? { city: small, how: 'small' } : null;
};
