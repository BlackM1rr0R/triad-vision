import { startTransition, useLayoutEffect, useState, type ReactNode } from 'react';
import { Router, UNSAFE_createBrowserHistory, createPath, parsePath, type Navigator, type To } from 'react-router-dom';
import i18n, { currentSiteLocale, setLocaleNavigator, setUiLanguage } from '@/i18n';
import { isPrivatePath, splitLocalePath, withLocale, type SiteLocale } from './siteLocale';
import { navigateWithTransition } from './viewTransition';

/*
 * Router for language-prefixed URLs (see lib/siteLocale.ts).
 *
 * It is BrowserRouter with one difference: the basename follows the URL. On /de/visas the basename is "/de",
 * so every route, <Link to="/jobs"> and navigate('/booking') keeps working unchanged and automatically stays in
 * German (/de/jobs, /de/booking). The basename is derived from the same location state the routes see, so the
 * two can never disagree for a render.
 *
 * Links are rewritten on the way out (push / replace / createHref):
 *   - into a private area (/account, /admin, /company…) the prefix is dropped: portals never carry one;
 *   - from a portal (no prefix) into a public page the visitor's language is added, so a German user going
 *     from /account to "/visas" lands on /de/visas.
 * On every location change the UI language follows the URL of public pages (/x → az, /de/x → de).
 */

// The SSR build (entry-server.tsx) renders one fixed URL and never navigates: no browser history there.
const history = import.meta.env.SSR ? (null as unknown as ReturnType<typeof UNSAFE_createBrowserHistory>) : UNSAFE_createBrowserHistory({ v5Compat: true });

const rewritePath = (pathname: string): string => {
  const { lang, rest } = splitLocalePath(pathname);
  if (isPrivatePath(rest)) return rest;
  if (lang) return pathname;
  return withLocale(rest, currentSiteLocale());
};

const rewrite = (to: To): To => {
  const path = typeof to === 'string' ? parsePath(to) : { ...to };
  if (!path.pathname || !path.pathname.startsWith('/')) return to;
  path.pathname = rewritePath(path.pathname);
  return path;
};

const navigator: Navigator = {
  createHref: (to) => history.createHref(rewrite(to)),
  encodeLocation: (to) => history.encodeLocation(rewrite(to)),
  go: (delta) => history.go(delta),
  push: (to, state) => history.push(rewrite(to), state),
  replace: (to, state) => history.replace(rewrite(to), state),
};

/** The current page's URL in another language (public pages only). */
const urlIn = (lng: SiteLocale) => {
  const { pathname, search, hash } = history.location;
  const { rest } = splitLocalePath(pathname);
  if (isPrivatePath(rest)) return null;
  return withLocale(rest, lng) + search + hash;
};

/** Called by switchLanguage(): on a public page, switch by navigating to the page in that language. */
const goToLocale = (lng: SiteLocale) => {
  const url = urlIn(lng);
  if (url === null) return false;
  startTransition(() => {
    // Copy is already loaded (switchLanguage waits for it), so the language changes in the same render as the URL.
    void i18n.changeLanguage(lng);
    history.push(url, history.location.state);
  });
  return true;
};
setLocaleNavigator(goToLocale);

/** Path of a public page in the current (or a given) language, for places outside <Link> (share URLs, window.open). */
export const localePath = (path: string, lng: SiteLocale = currentSiteLocale()) => withLocale(path, lng);

/** Path of the current page in a language (language switcher fallbacks, share links). */
export const currentPathIn = (lng: SiteLocale) => urlIn(lng);

/**
 * Client-side navigation to a full site path that already carries its language prefix (paths from the API,
 * e.g. a guide in another language: "/tr/guides/…"). <Link> would add the current prefix again.
 */
export const navigateToUrl = (url: string, opts: { replace?: boolean } = {}) => {
  startTransition(() => (opts.replace ? history.replace(url) : history.push(url)));
};

/**
 * Server render (entry-server.tsx): the request's URL, read-only. Hrefs and link matching go through the same
 * rewrite as in the browser (createHref / encodeLocation of the browser history), so NavLink states and link
 * targets in the server markup are exactly what the hydrating client renders.
 */
const staticHref = (to: To) => {
  const t = rewrite(to);
  return typeof t === 'string' ? t : createPath(t);
};
const staticNavigator: Navigator = {
  createHref: staticHref,
  encodeLocation: (to) => {
    const url = new URL(staticHref(to).replace(/ $/, '%20'), 'http://localhost');
    return { pathname: url.pathname, search: url.search, hash: url.hash };
  },
  go: () => undefined,
  push: () => undefined,
  replace: () => undefined,
};
const StaticLocaleRouter = ({ url, children }: { url: string; children: ReactNode }) => {
  const { pathname = '/', search = '', hash = '' } = parsePath(url);
  const { lang } = splitLocalePath(pathname);
  return (
    <Router basename={lang ? `/${lang}` : '/'} location={{ pathname, search, hash, state: null, key: 'default' }} navigator={staticNavigator} static>
      {children}
    </Router>
  );
};

export const LocaleRouter = ({ children, location }: { children: ReactNode; location?: string }) =>
  import.meta.env.SSR && location !== undefined ? <StaticLocaleRouter url={location}>{children}</StaticLocaleRouter> : <BrowserLocaleRouter>{children}</BrowserLocaleRouter>;

const BrowserLocaleRouter = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState({ action: history.action, location: history.location });
  useLayoutEffect(() => {
    let shownPath = history.location.pathname;
    return history.listen((next) => {
      const update = () => setState({ action: next.action, location: next.location });
      // A new page (pathname change) cross-fades / morphs through the View Transitions API where supported
      // and motion is welcome (lib/viewTransition.ts); query / hash changes (tabs, filters) stay instant.
      const newPage = next.location.pathname !== shownPath;
      const from = shownPath;
      shownPath = next.location.pathname;
      if (newPage) navigateWithTransition(update, (u) => startTransition(u), { from, to: next.location.pathname, back: next.action === 'POP' });
      else startTransition(update);
    });
  }, []);

  const { lang, rest } = splitLocalePath(state.location.pathname);
  const isPublic = !isPrivatePath(rest);

  // The URL decides the language of public pages (back / forward included).
  useLayoutEffect(() => {
    if (!isPublic) return;
    const wanted: SiteLocale = lang ?? 'az';
    if (currentSiteLocale() !== wanted) void setUiLanguage(wanted);
  }, [lang, isPublic]);

  // A prefixed private URL typed or linked from outside (/de/account) → the bare path.
  useLayoutEffect(() => {
    if (lang && !isPublic) history.replace({ ...state.location, pathname: rest });
  }, [lang, isPublic, rest, state.location]);

  return (
    <Router basename={lang ? `/${lang}` : '/'} location={state.location} navigationType={state.action} navigator={navigator}>
      {children}
    </Router>
  );
};
