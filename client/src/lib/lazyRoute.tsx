import { createElement, lazy, useState, type ComponentProps, type ComponentType } from 'react';

/*
 * React.lazy for route pages, with two additions for the server-rendered first paint (lib/ssr.ts):
 *  - the server records which pages a render used (takeRenderedRoutes → SSR payload);
 *  - the browser loads exactly those page chunks before it hydrates (preloadRoutes, main.tsx), and a page whose
 *    chunk is already loaded renders directly instead of through React.lazy.
 * Without this, hydration reaches the route's Suspense boundary while the page chunk is still pending; any
 * ordinary update in that window (theme, signed-in user, a query) makes React throw the server markup of the
 * page away and render it again on the client — a visible repaint and a late Largest Contentful Paint.
 *
 * Whether a mounted page renders directly or through React.lazy is fixed for its lifetime (state), so a page
 * that started lazily is never remounted when its chunk arrives.
 */

const loaders = new Map<string, () => Promise<unknown>>();
const rendered = new Set<string>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lazyRoute = <T extends ComponentType<any>>(id: string, factory: () => Promise<{ default: T }>) => {
  let loaded: T | null = null;
  let pending: Promise<{ default: T }> | null = null;
  const load = () =>
    (pending ??= factory().then(
      (m) => {
        loaded = m.default;
        return m;
      },
      (err: unknown) => {
        pending = null; // a failed chunk request may be retried (RouteErrorBoundary)
        throw err;
      },
    ));
  loaders.set(id, load);
  const Lazy = lazy(load);
  const Route = (props: ComponentProps<T>) => {
    if (import.meta.env.SSR) rendered.add(id);
    const [direct] = useState<T | null>(() => loaded);
    return createElement(direct ?? Lazy, props);
  };
  Route.displayName = `Route(${id})`;
  return Route;
};

/** Server: the pages rendered since the last call (entry-server.tsx, once per request). */
export const takeRenderedRoutes = () => {
  const ids = [...rendered];
  rendered.clear();
  return ids;
};

/** Browser: loads these pages' chunks (ids from the SSR payload). Never rejects. */
export const preloadRoutes = (ids: readonly string[]) =>
  Promise.all(ids.map((id) => loaders.get(id)?.().catch(() => undefined))).then(() => undefined);
