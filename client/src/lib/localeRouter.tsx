import { startTransition, useLayoutEffect, useState, type ReactNode } from 'react';
import { Router, UNSAFE_createBrowserHistory, parsePath, type Navigator, type To } from 'react-router-dom';
import i18n, { currentSiteLocale, setLocaleNavigator, setUiLanguage } from '@/i18n';
import { isPrivatePath, splitLocalePath, withLocale, type SiteLocale } from './siteLocale';

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

const history = UNSAFE_createBrowserHistory({ v5Compat: true });

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

export const LocaleRouter = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState({ action: history.action, location: history.location });
  useLayoutEffect(() => history.listen((next) => startTransition(() => setState({ action: next.action, location: next.location }))), []);

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
