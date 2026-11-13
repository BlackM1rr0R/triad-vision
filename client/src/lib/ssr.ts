import { useSyncExternalStore } from 'react';
import type { DehydratedState } from '@tanstack/react-query';

/*
 * Server-rendered first paint (see src/entry-server.tsx and client/ssr/server.mjs).
 *
 * Public pages arrive with the real page markup inside <div id="root"> (Caddy includes it from the SSR service)
 * plus the data it was rendered with in <script type="application/json" id="tv-ssr">. main.tsx then hydrates
 * that markup instead of rendering from scratch, so the visitor sees the page before the JavaScript has loaded.
 *
 * While the server markup is being hydrated, components must render exactly what the server rendered: no
 * entrance animations from opacity 0 (the content is already on screen; Root.tsx turns them off for the whole
 * tree), no state read from localStorage or window in a useState initialiser (useClientOnly below).
 * `isHydrating()` is true on the server and in the browser from hydrateRoot until the server-rendered page has
 * been hydrated (SiteLayout → HydrationDone); everything mounted after that animates as usual.
 */

export interface SsrPayload {
  /** Path the markup was rendered for (pathname, with language prefix). */
  path: string;
  /** Site language of the markup. */
  lang: string;
  /** Route pages the markup contains (lib/lazyRoute.tsx): their chunks are loaded before hydrating. */
  routes: string[];
  /** Dehydrated TanStack Query cache (public data only). */
  queries: DehydratedState;
}

let hydrating = false;
const listeners = new Set<() => void>();

/** True on the server and while the client hydrates server markup. */
export const isHydrating = () => import.meta.env.SSR || hydrating;

export const setHydrating = (on: boolean) => {
  if (hydrating === on) return;
  hydrating = on;
  listeners.forEach((l) => l());
};

const subscribeHydrating = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** isHydrating() as a hook (re-renders once the hydration is over). */
export const useHydrating = () => useSyncExternalStore(subscribeHydrating, isHydrating, () => true);

/** The payload written by the SSR service, if this page was server-rendered (null in the dev server). */
export const readSsrPayload = (): SsrPayload | null => {
  if (import.meta.env.SSR || typeof document === 'undefined') return null;
  const el = document.getElementById('tv-ssr');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as SsrPayload;
  } catch {
    return null;
  }
};

const noSubscribe = () => () => undefined;
/**
 * False on the server and during hydration, true afterwards (and from the start in a client-only render). For
 * what only exists in the browser — portals into document.body, sizes, stored preferences — so the hydrating
 * render matches the server markup and the browser-only part follows right after.
 */
export const useClientOnly = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
