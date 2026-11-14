import { useEffect, useSyncExternalStore } from 'react';
import { api, getImpersonation } from '@/lib/api';

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
 * up is skipped. A step may name its own `route` (multi-page tours): the host navigates there first.
 *
 * Storage: the server keeps the progress per user (GET / PUT /api/tours, server/src/lib/tours.ts:
 * progress + step | done | never), so a tour is shown once per person, not once per browser, and an
 * interrupted tour resumes at its step after the next login. localStorage (`tv-tour:<userId>:<tourId>`)
 * stays as a fast cache / offline fallback. Nothing is written while staff view a portal as the client.
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
  /** Page this step runs on (exact path); defaults to the tour's `route`. '*': the page that is open (sidebar, header). */
  route?: string;
}

export interface TourDef {
  id: string;
  /** Page the tour runs on; startTour() navigates there first (exact path). */
  route?: string;
  steps: TourStep[];
}

/** `restart`: started again from the help menu (reopens a finished tour on the server). */
type State = { tourId: string | null; index: number; restart: boolean };

const registry = new Map<string, TourDef>();
let state: State = { tourId: null, index: 0, restart: false };
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

/**
 * Start (or restart) a tour. Returns false when no tour with that id is registered.
 * `restart: true` (help menu): the tour counts as running again even when it was finished before.
 */
export const startTour = (id: string, opts: { step?: number; restart?: boolean } = {}) => {
  const def = registry.get(id);
  if (!def) {
    if (import.meta.env.DEV) console.warn(`[tour] unknown tour "${id}"`);
    return false;
  }
  state = { tourId: id, index: Math.min(Math.max(0, opts.step ?? 0), Math.max(0, def.steps.length - 1)), restart: !!opts.restart };
  emit();
  return true;
};

/** Help-menu entry: the tour from its first step, also when it was finished or dismissed before. */
export const restartTour = (id: string) => startTour(id, { restart: true });

export const stopTour = () => {
  if (!state.tourId) return;
  state = { tourId: null, index: 0, restart: false };
  emit();
};

export const goToStep = (index: number) => {
  if (!state.tourId) return;
  state = { ...state, index };
  emit();
};

export const isTourActive = () => state.tourId !== null;

export const useTourState = () => useSyncExternalStore(subscribe, () => state, () => state);

// ─── Per-user progress (server + local cache) ───────────────────────────

export type TourOutcome = 'done' | 'never';
type ServerEntry = { status: 'progress' | TourOutcome; step: number };
type ServerTours = Record<string, ServerEntry>;
type PushBody = { status: 'progress' | TourOutcome | 'reset'; step?: number; restart?: boolean };

const seenKey = (userId: string, tourId: string) => `tv-tour:${userId}:${tourId}`;
const sessionKey = (userId: string, tourId: string) => `tv-tour-session:${userId}:${tourId}`;

// Progress from GET /api/tours for the signed-in user (null until loaded; {} when the request failed).
let server: { userId: string; tours: ServerTours } | null = null;
let loading: { userId: string; promise: Promise<ServerTours> } | null = null;

const readLocal = (userId: string, tourId: string): TourOutcome | null => {
  try {
    const v = localStorage.getItem(seenKey(userId, tourId));
    return v === 'done' || v === 'never' ? v : null;
  } catch {
    return null;
  }
};

/** Sends one change (fire and forget: the local cache already has it). Never while viewing as a client. */
const push = (userId: string, tourId: string, body: PushBody) => {
  if (getImpersonation()) return;
  if (server?.userId === userId) {
    if (body.status === 'reset') delete server.tours[tourId];
    else server.tours[tourId] = { status: body.status, step: body.step ?? server.tours[tourId]?.step ?? 0 };
  }
  void api
    .put<{ tours: ServerTours }>(`/tours/${encodeURIComponent(tourId)}`, body)
    .then((r) => {
      if (server?.userId === userId && r.data?.tours) server.tours = r.data.tours;
    })
    .catch(() => undefined);
};

/** Loads the user's tour progress once per page load (resolves with {} on errors: the local flags then decide). */
export const loadTourProgress = (userId: string): Promise<ServerTours> => {
  if (server?.userId === userId) return Promise.resolve(server.tours);
  if (loading?.userId === userId) return loading.promise;
  const promise = api
    .get<{ tours: ServerTours }>('/tours')
    .then((r) => r.data?.tours ?? {})
    .catch(() => ({}) as ServerTours)
    .then((tours) => {
      server = { userId, tours: { ...tours } };
      loading = null;
      // Finished in this browser before the server kept progress: tell the server once.
      for (const id of registry.keys()) {
        const local = readLocal(userId, id);
        if (local && !tours[id]) push(userId, id, { status: local });
      }
      return server.tours;
    });
  loading = { userId, promise };
  return promise;
};

/** Finished / dismissed (on the server or in this browser). */
export const readSeen = (userId: string, tourId: string): TourOutcome | null => {
  const remote = server?.userId === userId ? server.tours[tourId]?.status : undefined;
  if (remote === 'done' || remote === 'never') return remote;
  return readLocal(userId, tourId);
};

/** Marks the tour finished / dismissed (`null` forgets it: it starts on its own again). */
export const writeSeen = (userId: string, tourId: string, outcome: TourOutcome | null, step?: number) => {
  try {
    if (outcome) localStorage.setItem(seenKey(userId, tourId), outcome);
    else localStorage.removeItem(seenKey(userId, tourId));
  } catch {
    /* private mode: the server copy still counts */
  }
  push(userId, tourId, outcome ? { status: outcome, step } : { status: 'reset' });
};

/**
 * The step the user is on, so an interrupted tour resumes there after the next login. A replay of a
 * finished tour (e.g. "Göstər" in "Yeniliklər") does not reopen it; `restart` (help menu) does.
 */
export const saveTourProgress = (userId: string, tourId: string, step: number, restart = false) => {
  const prev = server?.userId === userId ? server.tours[tourId] : undefined;
  if (restart) {
    try {
      localStorage.removeItem(seenKey(userId, tourId));
    } catch {
      /* ignore */
    }
  } else {
    if (readLocal(userId, tourId) || (prev && prev.status !== 'progress')) return;
    if (prev?.status === 'progress' && prev.step === step) return;
  }
  push(userId, tourId, { status: 'progress', step, ...(restart ? { restart: true } : {}) });
};

/** Step to resume an interrupted tour at (0 when it never ran). */
export const resumeStep = (userId: string, tourId: string): number => {
  const entry = server?.userId === userId ? server.tours[tourId] : undefined;
  const steps = registry.get(tourId)?.steps.length ?? 1;
  return entry?.status === 'progress' ? Math.min(Math.max(0, entry.step), steps - 1) : 0;
};

/** Skipped without "don't show again": stays away for this browser session only (then resumes). */
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

/** Should the tour start on its own for this user? Never while staff view a portal as the client. */
export const shouldAutoStart = (userId: string | null | undefined, tourId: string) =>
  !!userId && registry.has(tourId) && !getImpersonation() && !readSeen(userId, tourId) && !skippedThisSession(userId, tourId);

/**
 * Start a tour once after the first login: when `ready` turns true and the user has neither finished
 * nor dismissed it (the server progress is loaded first). An interrupted tour resumes at its step.
 * Waits a moment so the page has painted (targets are looked up by the host).
 */
export const useAutoStartTour = (tourId: string | null | undefined, userId: string | null | undefined, ready = true) => {
  useEffect(() => {
    if (!tourId || !userId || !ready || !shouldAutoStart(userId, tourId) || isTourActive()) return;
    let cancelled = false;
    let timer = 0;
    void loadTourProgress(userId).then(() => {
      if (cancelled || !shouldAutoStart(userId, tourId) || isTourActive()) return;
      timer = window.setTimeout(() => {
        if (!isTourActive() && shouldAutoStart(userId, tourId)) startTour(tourId, { step: resumeStep(userId, tourId) });
      }, 900);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tourId, userId, ready]);
};

/** Tests: forget the cached server progress. */
export const resetTourProgressCache = () => {
  server = null;
  loading = null;
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
