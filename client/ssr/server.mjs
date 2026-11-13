#!/usr/bin/env node
// SSR service of the public site: renders a page's markup for <div id="root"> (src/entry-server.tsx).
//
// Caddy includes GET /render?url=/de/visas into index.html (deploy/Caddyfile, client/index.html); the browser
// then hydrates that markup instead of waiting for the JavaScript to paint the page (src/main.tsx). The
// response is the markup, a separator and the JSON payload script:
//
//   <markup>@@tv-ssr-state@@<script type="application/json" id="tv-ssr">{…}</script>
//
// An empty 200 means "not server-rendered" (private path, render error, timeout, too busy): the shell then keeps
// the crawler HTML from the API (/__seo/body) and the app renders on the client as before. This service never
// answers with an error page, so a failure here can only make a page slower, never break it.
//
//   node ssr/server.mjs            PORT=4100 API_ORIGIN=http://api:4000 SSR_BUNDLE=dist-ssr/entry-server.js
//   node ssr/server.mjs --check    renders "/" once (API optional) and exits 1 if the render fails (CI)
//
// No dependencies: the bundle contains React and the app (vite build --ssr, ssr.noExternal).
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4100);
const API_ORIGIN = (process.env.API_ORIGIN ?? 'http://localhost:4000').replace(/\/$/, '');
const BUNDLE = path.resolve(process.env.SSR_BUNDLE ?? path.join(here, '..', 'dist-ssr', 'entry-server.js'));
const TIMEOUT_MS = Number(process.env.SSR_TIMEOUT_MS ?? 1200);
/** Renders waiting in line at most; beyond that a request gets the client-rendered page at once. */
const MAX_QUEUE = Number(process.env.SSR_MAX_QUEUE ?? 6);
/** Rendered pages are reused for this long (crawler bursts, reloads). The API caches its data longer anyway. */
const CACHE_MS = Number(process.env.SSR_CACHE_MS ?? 15_000);
const CACHE_MAX = 300;
// Plain text, not a comment: the shell's template actions live inside HTML comments (client/index.html).
const SEPARATOR = '@@tv-ssr-state@@';

const { render } = await import(pathToFileURL(BUNDLE).href);

const cache = new Map(); // url → { at, body }
let pending = 0;

/** Rendered response for a URL, or '' (not server-rendered). */
const renderUrl = async (url) => {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;
  if (pending >= MAX_QUEUE) return '';
  pending++;
  try {
    const started = Date.now();
    const r = await render(url, { apiOrigin: API_ORIGIN, timeoutMs: TIMEOUT_MS });
    let body = '';
    if (!r.html) {
      body = '';
    } else if (r.html.includes('<!--$!-->') || r.html.includes('<!--$?-->') || r.html.includes('<script>')) {
      // Part of the page failed or was left unfinished on the server (React would show its fallback until the
      // client renders it): better the plain client render than a spinner flashing over the server markup.
      const reason = /data-msg="([^"]*)"/.exec(r.html)?.[1] ?? 'unknown';
      console.warn(`[ssr] ${url}: client fallback (${reason.replace(/\s+/g, ' ').slice(0, 200)})`);
    } else {
      // email_off: Cloudflare's e-mail obfuscation would rewrite addresses in the markup (hydration mismatch) and
      // add a render-blocking decoder script. React skips comments other than its own markers when hydrating.
      body = `<!--email_off-->${r.html}<!--/email_off-->${SEPARATOR}<!--email_off--><script type="application/json" id="tv-ssr">${r.payload}</script><!--/email_off-->`;
    }
    const ms = Date.now() - started;
    if (ms > 500) console.warn(`[ssr] ${url}: slow render (${ms} ms)`);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(url, { at: Date.now(), body });
    return body;
  } catch (err) {
    console.warn(`[ssr] ${url}: ${err instanceof Error ? err.message : err}`);
    return '';
  } finally {
    pending--;
  }
};

if (process.argv.includes('--check')) {
  const r = await render('/', { apiOrigin: API_ORIGIN, timeoutMs: TIMEOUT_MS });
  const ok = r.html.length > 1000 && !/<!--\$[!?]-->|<script>/.test(r.html) && r.html.includes('id="main"');
  console.log(ok ? `[ssr] check ok (${r.html.length} bytes)` : `[ssr] check FAILED:\n${r.html.slice(0, 2000)}`);
  process.exit(ok ? 0 : 1);
}

const server = http.createServer(async (req, res) => {
  // An unparsable request target must not become an unhandled rejection (that would end the process).
  let u;
  try {
    u = new URL(req.url ?? '/', 'http://ssr');
  } catch {
    res.writeHead(404).end();
    return;
  }
  if (u.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  const target = u.searchParams.get('url');
  if (req.method !== 'GET' || u.pathname !== '/render' || !target || !target.startsWith('/') || target.startsWith('//')) {
    res.writeHead(404).end();
    return;
  }
  const body = await renderUrl(target);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
});
server.keepAliveTimeout = 65_000;
server.listen(PORT, () => console.log(`[ssr] listening on :${PORT}, API ${API_ORIGIN}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
