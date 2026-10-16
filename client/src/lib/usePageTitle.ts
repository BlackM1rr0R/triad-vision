import { useContext, useEffect } from 'react';
import { UNSAFE_LocationContext } from 'react-router-dom';

const DEFAULT_TITLE = 'Triad Vision';

/*
 * Client-side SEO meta manager.
 *
 * In production the HTML for every URL already contains the page's head tags (title, description, robots,
 * canonical, hreflang, Open Graph, Twitter, JSON-LD), injected by Caddy from GET /__seo/head. Each of those
 * elements carries a `data-seo` attribute. On client-side navigation this module fetches the same fragment
 * from /api/seo/head for the new URL and swaps every `data-seo` element, so a crawler that renders JavaScript
 * sees exactly what a non-JS crawler sees for that URL.
 *
 * The language follows the URL, not the UI: `?lng=xx` when present, otherwise the bare URL (x-default, described
 * in az) — the same rule the server applies, so raw and rendered tags always agree.
 *
 * <title> stays owned by usePageTitle (pages know their localized title immediately); the fragment's title
 * only feeds og:title / twitter:title.
 */

const LOCALES = ['az', 'de', 'en', 'ru'];
/** Mirrors PRIVATE_PREFIXES in server/src/lib/seoCatalogue.ts (and robots.txt). */
const PRIVATE = ['/admin', '/workspace', '/account', '/company', '/api', '/booking/manage', '/review', '/verify-email', '/login/2fa', '/reset-password', '/sign'];
const isPrivate = (path: string) => PRIVATE.some((p) => path === p || path.startsWith(`${p}/`));

const keyFor = (pathname: string, search: string) => {
  const lng = new URLSearchParams(search).get('lng');
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return { path, lng: lng && LOCALES.includes(lng) ? lng : '' };
};

// The URL whose tags are in the document. If the server injected them (og:url present), the first page view
// needs no request.
let appliedKey: string | null = null;
if (typeof document !== 'undefined' && document.head.querySelector('meta[data-seo][property="og:url"]')) {
  const { path, lng } = keyFor(location.pathname, location.search);
  appliedKey = `${path}?${lng}`;
}
let inflight: AbortController | null = null;
const fragments = new Map<string, string>();

const applyFragment = (html: string) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  // The title is managed by usePageTitle.
  tpl.content.querySelectorAll('title').forEach((t) => t.remove());
  document.head.querySelectorAll('[data-seo]:not(title)').forEach((el) => el.remove());
  document.head.append(tpl.content);
};

const markPrivate = () => {
  document.head.querySelectorAll('[data-seo]:not(title)').forEach((el) => el.remove());
  const robots = document.createElement('meta');
  robots.setAttribute('data-seo', '');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow';
  document.head.append(robots);
};

/** Brings the head tags in line with the given URL (no-op if they already describe it). */
export const syncSeoHead = (pathname: string, search: string) => {
  if (typeof document === 'undefined') return;
  const { path, lng } = keyFor(pathname, search);
  const key = `${path}?${lng}`;
  if (key === appliedKey) return;
  appliedKey = key;
  inflight?.abort();
  inflight = null;
  if (isPrivate(path)) {
    markPrivate();
    return;
  }
  const hit = fragments.get(key);
  if (hit !== undefined) {
    applyFragment(hit);
    return;
  }
  const ctrl = new AbortController();
  inflight = ctrl;
  fetch(`/api/seo/head?path=${encodeURIComponent(path)}${lng ? `&lng=${lng}` : ''}`, { signal: ctrl.signal, credentials: 'omit' })
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then((html) => {
      if (ctrl.signal.aborted || !html) return;
      if (fragments.size > 50) fragments.clear();
      fragments.set(key, html);
      applyFragment(html);
    })
    .catch(() => {
      // Offline or rate-limited: keep the current tags and retry on the next visit to this URL.
      if (appliedKey === key) appliedKey = null;
    });
};

/**
 * Keeps the SEO head tags in sync with the current route. Safe to call from many components at once
 * (requests are de-duplicated per URL) and outside a router (then it does nothing).
 */
export const useSeo = () => {
  const location = useContext(UNSAFE_LocationContext)?.location;
  const pathname = location?.pathname;
  const search = location?.search ?? '';
  useEffect(() => {
    if (pathname !== undefined) syncSeoHead(pathname, search);
  }, [pathname, search]);
};

/** Mount once in the site layout so pages that never call usePageTitle get their tags too. */
export const SeoManager = () => {
  useSeo();
  return null;
};

/**
 * Sets `document.title` for the lifetime of a page ("<title> · Triad Vision") and restores the
 * previous title on unmount. Pass nothing (or an empty string) for the default site title.
 * Also keeps the SEO head tags (description, canonical, hreflang, Open Graph, JSON-LD) in sync with the route.
 */
export const usePageTitle = (title?: string | null) => {
  useSeo();
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${DEFAULT_TITLE}` : DEFAULT_TITLE;
    return () => {
      document.title = previous;
    };
  }, [title]);
};
