/**
 * "What does this page do?" registry of the admin panel, keyed by admin route (the `path` of each route in the
 * `/admin` block of App.tsx: '' = the index, ':param' = one segment, '/*' = the rest).
 *
 * The texts (purpose, three steps, tips in az / ru / en / de) are plain data in server/src/lib/adminHelp — the
 * server seeds one Knowledge Base article per page from the same entries (lib/ops/kbSystemArticles.ts), so the
 * panel and the KB never drift apart. They are ~500 kB, so the admin shell only carries this matcher and loads
 * them when the "?" panel opens (components/adminHelp/AdminPageHelp.tsx).
 * Completeness (every admin route of App.tsx has an entry in all four languages): server/tests/unit/adminPageHelp.test.ts.
 * Plain TS, no React (the server unit tests import it).
 */
import type { HelpLocale, PageHelpEntry, PageHelpText } from '../../../../server/src/lib/adminHelp/types';

export type { HelpLocale, PageHelpEntry, PageHelpText };

/** Knowledge Base system key of a page's article (same rule as server lib/adminHelp kbSystemKey). */
export const kbSystemKeyFor = (route: string) => `admin-page:${route === '' ? 'index' : route}`;

/** KB deep link of a page guide (KnowledgeBase.tsx opens ?system=…). */
export const kbHrefFor = (route: string) => `/admin/kb?system=${encodeURIComponent(kbSystemKeyFor(route))}`;

const segs = (p: string) => p.split('/').filter(Boolean);

/**
 * Specificity of `route` for the admin-relative path `rest` (segments after /admin), or -1 if it does not match.
 * Static segments beat ":param", both beat a trailing "*"; the most specific route wins.
 */
export const routeScore = (route: string, rest: string[]): number => {
  const r = segs(route);
  const wild = r[r.length - 1] === '*';
  const fixed = wild ? r.slice(0, -1) : r;
  if (wild ? rest.length < fixed.length : rest.length !== fixed.length) return -1;
  let score = 0;
  for (let i = 0; i < fixed.length; i++) {
    if (fixed[i].startsWith(':')) score += 2;
    else if (fixed[i] === rest[i]) score += 3;
    else return -1;
  }
  return score * 2 + (wild ? 0 : 1);
};

/** The route (of `routes`) of an admin pathname; deeper unknown paths fall back to their parent page. */
export const matchAdminRoute = (pathname: string, routes: readonly string[]): string | undefined => {
  const path = pathname.replace(/[?#].*$/, '');
  if (path !== '/admin' && !path.startsWith('/admin/')) return undefined;
  let rest = segs(path.slice('/admin'.length));
  for (;;) {
    let best: string | undefined;
    let bestScore = -1;
    for (const route of routes) {
      const s = routeScore(route, rest);
      if (s > bestScore) {
        best = route;
        bestScore = s;
      }
    }
    if (best !== undefined) return best;
    if (!rest.length) return undefined;
    rest = rest.slice(0, -1);
  }
};

/** Panel language: the admin UI's own language, Azerbaijani for anything else. */
export const helpLocale = (lng: string | undefined): HelpLocale => {
  const l = (lng ?? '').slice(0, 2);
  return l === 'ru' || l === 'en' || l === 'de' ? l : 'az';
};

let loaded: Promise<PageHelpEntry[]> | null = null;
/** All entries (separate chunk, fetched once). */
export const loadAdminHelp = () => {
  loaded ??= import('../../../../server/src/lib/adminHelp/index').then((m) => m.ADMIN_PAGE_HELP).catch((e) => {
    loaded = null;
    throw e;
  });
  return loaded;
};

/** The entry of an admin pathname from the loaded entries. */
export const adminHelpFor = (pathname: string, entries: readonly PageHelpEntry[]): PageHelpEntry | undefined => {
  const route = matchAdminRoute(
    pathname,
    entries.map((e) => e.route),
  );
  return route === undefined ? undefined : entries.find((e) => e.route === route);
};
