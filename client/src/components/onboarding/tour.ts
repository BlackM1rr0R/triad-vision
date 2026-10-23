import { useEffect, useSyncExternalStore } from 'react';

/**
 * Guided-tour engine: a tiny external store (which tour is running, which step) plus the per-user
 * "seen" flags. The UI lives in <TourHost/>; tours are registered with registerTour() (see tours.ts).
 *
 *   registerTour({ id: 'admin', route: '/admin', steps: [{ id: 'nav', target: 'admin-nav', titleKey: '…', textKey: '…' }] });
 *   startTour('admin');                 // e.g. from a "Restart tour" menu item
 *   useAutoStartTour('admin', ready);   // once after the first login (or <TourHost autoStart="admin" />)
 *
 * Targets are `data-tour="…"` values (or several: the first one that is visible wins, so a step can
 * point at the desktop rail and fall back to the mobile bottom bar). A step whose target never shows
 * up is skipped.
 *
 * Storage: localStorage per user and tour (`tv-tour:<userId>:<tourId>` = done | never). The server has
 * no generic per-user preferences store yet; when one exists, swap readSeen / writeSeen.
 */

export type TourPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

export interface TourStep {
  id: string;
  /** data-tour value(s); the first visible element wins. A value starting with "[" / "#" / "." is used as a raw selector. */
  target: string | string[];
  /** i18n keys (4 languages). */
  titleKey: string;
  textKey: string;
  placement?: TourPlacement;
}

export interface TourDef {
  id: string;
  /** Page the tour runs on; startTour() navigates there first (exact path). */
  route?: string;
  steps: TourStep[];
}

type State = { tourId: string | null; index: number };

const registry = new Map<string, TourDef>();
let state: State = { tourId: null, index: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const registerTour = (def: TourDef) => {
  registry.set(def.id, def);
};
export const getTour = (id: string | null | undefined) => (id ? registry.get(id) : undefined);

/** Start (or restart) a tour. Returns false when no tour with that id is registered. */
export const startTour = (id: string, opts: { step?: number } = {}) => {
  if (!registry.has(id)) {
    if (import.meta.env.DEV) console.warn(`[tour] unknown tour "${id}"`);
    return false;
  }
  state = { tourId: id, index: Math.max(0, opts.step ?? 0) };
  emit();
  return true;
};

export const stopTour = () => {
  if (!state.tourId) return;
  state = { tourId: null, index: 0 };
  emit();
};

export const goToStep = (index: number) => {
  if (!state.tourId) return;
  state = { ...state, index };
  emit();
};

export const isTourActive = () => state.tourId !== null;

export const useTourState = () => useSyncExternalStore(subscribe, () => state, () => state);

// ─── Per-user "seen" flags ──────────────────────────────────────────────

export type TourOutcome = 'done' | 'never';
const seenKey = (userId: string, tourId: string) => `tv-tour:${userId}:${tourId}`;
const sessionKey = (userId: string, tourId: string) => `tv-tour-session:${userId}:${tourId}`;

export const readSeen = (userId: string, tourId: string): TourOutcome | null => {
  try {
    const v = localStorage.getItem(seenKey(userId, tourId));
    return v === 'done' || v === 'never' ? v : null;
  } catch {
    return null;
  }
};

export const writeSeen = (userId: string, tourId: string, outcome: TourOutcome | null) => {
  try {
    if (outcome) localStorage.setItem(seenKey(userId, tourId), outcome);
    else localStorage.removeItem(seenKey(userId, tourId));
  } catch {
    /* private mode: the tour may show again next time */
  }
};

/** Skipped without "don't show again": stays away for this browser session only. */
export const markSkippedThisSession = (userId: string, tourId: string) => {
  try {
    sessionStorage.setItem(sessionKey(userId, tourId), '1');
  } catch {
    /* ignore */
  }
};
const skippedThisSession = (userId: string, tourId: string) => {
  try {
    return sessionStorage.getItem(sessionKey(userId, tourId)) === '1';
  } catch {
    return false;
  }
};

/** Should the tour start on its own for this user? */
export const shouldAutoStart = (userId: string | null | undefined, tourId: string) =>
  !!userId && registry.has(tourId) && !readSeen(userId, tourId) && !skippedThisSession(userId, tourId);

/**
 * Start a tour once after the first login: when `ready` turns true and the user has neither finished
 * nor dismissed it. Waits a moment so the page has painted (targets are looked up by the host).
 */
export const useAutoStartTour = (tourId: string | null | undefined, userId: string | null | undefined, ready = true) => {
  useEffect(() => {
    if (!tourId || !ready || !shouldAutoStart(userId, tourId) || isTourActive()) return;
    const timer = window.setTimeout(() => {
      if (!isTourActive() && shouldAutoStart(userId, tourId)) startTour(tourId);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [tourId, userId, ready]);
};

// ─── Target lookup ──────────────────────────────────────────────────────

const selectorOf = (t: string) => (/^[[#.]/.test(t) ? t : `[data-tour="${t}"]`);

const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
};

export const findTarget = (step: TourStep): HTMLElement | null => {
  const list = Array.isArray(step.target) ? step.target : [step.target];
  for (const t of list) {
    const els = document.querySelectorAll<HTMLElement>(selectorOf(t));
    for (const el of els) if (isVisible(el)) return el;
  }
  return null;
};
