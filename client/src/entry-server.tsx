/*
 * Server-side render of the public pages (the SSR service, client/ssr/server.mjs, imports the build of this file:
 * `vite build --ssr src/entry-server.tsx`, see client/package.json "build:ssr").
 *
 * render(url) renders the same <Root> as main.tsx at that URL and returns the markup for <div id="root"> plus
 * the JSON payload main.tsx hydrates with (src/lib/ssr.ts). Data: the queries the page creates are fetched from
 * the API like the browser would (anonymous, no cookies) and the page is rendered again with them — at most
 * three passes. Only queries of public content are fetched and shipped (SSR_QUERY_KEYS); everything else
 * (the signed-in user, portals) renders in its loading state, exactly like the browser's first render.
 *
 * One render at a time: i18next and the axios defaults are module-wide, so requests are queued (renders take
 * a few milliseconds; the data comes from the API's own caches).
 */
import { prerenderToNodeStream } from 'react-dom/static';
import { dehydrate, type Query } from '@tanstack/react-query';
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import i18n, { loadSiteLanguage } from './i18n';
import { api } from './lib/api';
import { isPrivatePath, splitLocalePath } from './lib/siteLocale';
import { sanitizeBrand, setBrand } from './lib/brand';
import { createQueryClient, Root } from './Root';
import type { SsrPayload } from './lib/ssr';
import { takeRenderedRoutes } from './lib/lazyRoute';

/**
 * First element of the query keys whose data is public and the same for every visitor (CMS content, visas,
 * jobs, guides…). Anything else is never fetched on the server.
 */
export const SSR_QUERY_KEYS = new Set<string>([
  'content', // header, footer, home sections, visas and services (GET /public/content)
  'posts',
  'post',
  'visa',
  'service',
  'jobs',
  'job',
  'job-landing', // /jobs/in/:city/:profession (GET /vacancies/landing/…)
  'guides',
  'guide',
  'public-packages',
  'public-reviews',
  'landing', // /l/:slug landing pages
  // Without these the AGB / privacy / cookie pages, the visa comparison, the Blue Card check and the referral
  // terms reached crawlers as an empty skeleton (the server markup replaces the crawler HTML).
  'legal', // GET /legal/:kind(/versions…): published texts, the same for everyone
  'compare-visas',
  'blue-card-thresholds',
  'referral-terms',
]);

export interface RenderResult {
  /** Markup for <div id="root"> ('' when the path is not server-rendered). */
  html: string;
  /** JSON for <script type="application/json" id="tv-ssr"> (already escaped for use inside a script tag). */
  payload: string;
  /** Query keys the page asked for that were not fetched (logged by the service, to extend SSR_QUERY_KEYS). */
  skipped: string[];
}

const streamToString = async (stream: AsyncIterable<Uint8Array | string>) => {
  const decoder = new TextDecoder();
  let out = '';
  for await (const c of stream) out += typeof c === 'string' ? c : decoder.decode(c, { stream: true });
  return out + decoder.decode();
};

const allowed = (q: Query) => SSR_QUERY_KEYS.has(String(q.queryKey[0]));

/** `enabled: false` (or a function saying so) on the query that created it: the browser would not fetch it either. */
const enabledOn = (q: Query) => {
  const en = (q.options as { enabled?: boolean | ((q: Query) => boolean) }).enabled;
  return typeof en === 'function' ? en(q) : en !== false;
};

/** White-label brand of the instance (name, logo, copy variables), refreshed from the API every 5 minutes. */
let brandLoadedAt = 0;
const refreshBrand = async (apiOrigin: string) => {
  if (Date.now() - brandLoadedAt < 5 * 60_000) return;
  brandLoadedAt = Date.now();
  try {
    const res = await fetch(`${apiOrigin}/api/site/brand`, { signal: AbortSignal.timeout(1000) });
    const b = res.ok ? sanitizeBrand(((await res.json()) as { brand?: unknown }).brand) : null;
    if (b) setBrand(b);
  } catch {
    brandLoadedAt = 0; // try again with the next request
  }
};

/*
 * API answers are reused for 30 seconds (GET, 2xx). Every render needs GET /public/content, and all SSR requests
 * reach the API from one address, which shares the API's per-IP rate limit (600 a minute).
 */
const API_CACHE_MS = 30_000;
const apiCache = new Map<string, { at: number; res: AxiosResponse }>();
const baseAdapter = axios.getAdapter(axios.defaults.adapter);
api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
  if ((config.method ?? 'get').toLowerCase() !== 'get') return baseAdapter(config);
  const key = `${config.headers.get('X-Locale') ?? ''} ${axios.getUri(config)}`;
  const hit = apiCache.get(key);
  if (hit && Date.now() - hit.at < API_CACHE_MS) return { ...hit.res, config };
  const res = await baseAdapter(config);
  if (res.status >= 200 && res.status < 300) {
    if (apiCache.size >= 500) apiCache.delete(apiCache.keys().next().value!);
    apiCache.set(key, { at: Date.now(), res });
  }
  return res;
};

let queue: Promise<unknown> = Promise.resolve();

export const render = (url: string, opts: { apiOrigin: string; timeoutMs?: number }): Promise<RenderResult> => {
  const run = queue.then(() => renderNow(url, opts));
  queue = run.catch(() => undefined);
  return run;
};

const renderNow = async (url: string, { apiOrigin, timeoutMs = 1500 }: { apiOrigin: string; timeoutMs?: number }): Promise<RenderResult> => {
  const pathname = url.split(/[?#]/)[0] || '/';
  const { lang, rest } = splitLocalePath(pathname);
  if (isPrivatePath(rest)) return { html: '', payload: '', skipped: [] };
  const site = lang ?? 'az';

  await refreshBrand(apiOrigin.replace(/\/$/, ''));
  await loadSiteLanguage(site);
  if (i18n.language !== site) await i18n.changeLanguage(site);
  api.defaults.baseURL = `${apiOrigin.replace(/\/$/, '')}/api`;
  api.defaults.headers.common['X-Locale'] = site === 'tr' || site === 'uk' ? 'en' : site;

  takeRenderedRoutes(); // forget pages of an earlier (aborted) render
  const deadline = Date.now() + timeoutMs;
  const queryClient = createQueryClient();
  // No retries on the server: a failing request renders its loading state and the browser asks again.
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
  const skipped = new Set<string>();
  const failed = new Set<string>();
  let html = '';
  for (let pass = 0; pass < 3; pass++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(200, deadline - Date.now()));
    try {
      const { prelude } = await prerenderToNodeStream(<Root queryClient={queryClient} location={url} />, {
        signal: controller.signal,
        // Every boundary inline and complete: no streaming scripts ($RC…), which the CSP would block anyway.
        progressiveChunkSize: Number.POSITIVE_INFINITY,
        onError: (err) => {
          // Errors inside a Suspense boundary: that part renders on the client. Logged by the service.
          if (!controller.signal.aborted) console.warn('[ssr]', url, err instanceof Error ? err.message : err);
        },
      });
      html = await streamToString(prelude as unknown as AsyncIterable<Uint8Array | string>);
    } finally {
      clearTimeout(timer);
    }
    const missing = queryClient
      .getQueryCache()
      .getAll()
      .filter((q) => q.state.status === 'pending' && q.state.fetchStatus === 'idle' && enabledOn(q));
    const todo = missing.filter((q) => allowed(q) && !failed.has(q.queryHash));
    missing.filter((q) => !allowed(q)).forEach((q) => skipped.add(String(q.queryKey[0])));
    if (todo.length === 0 || Date.now() > deadline) break;
    await Promise.race([
      Promise.allSettled(todo.map((q) => q.fetch().catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()))),
    ]);
    // A failed (or unfinished) request renders in its loading state, like the browser's first render.
    for (const q of todo) {
      if (q.state.status !== 'success') {
        failed.add(q.queryHash);
        queryClient.getQueryCache().remove(q);
      }
    }
  }

  const payload: SsrPayload = {
    path: pathname,
    lang: site,
    routes: takeRenderedRoutes(),
    queries: dehydrate(queryClient, { shouldDehydrateQuery: (q) => q.state.status === 'success' && allowed(q) }),
  };
  // Inside <script>: "<" never appears raw, so "</script>" or "<!--" in CMS text cannot end the element.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  queryClient.clear();
  return { html, payload: json, skipped: [...skipped] };
};
