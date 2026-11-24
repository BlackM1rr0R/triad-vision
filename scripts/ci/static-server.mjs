#!/usr/bin/env node
// Tiny static server for the built client (client/dist): gzip like Caddy's `encode`, immutable caching for
// /assets/*, single-page-app fallback to index.html, and an optional proxy for /api and /uploads.
// Used by scripts/ci/a11y-smoke.mjs and for local performance measurements. No dependencies.
//
//   node scripts/ci/static-server.mjs [--dir client/dist] [--port 4174] [--api http://localhost:4000]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
};
const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json|wasm)|image\/svg)/;

/**
 * index.html is a Caddy template in production: its per-language / per-route preload hints sit in
 * `<!--tv:if …:tv--> … <!--tv:end:tv-->` branches (client/vite.config.ts, shellPreloads) and Caddy keeps only the
 * branch of the request. Served raw, the browser fetched the hints of EVERY branch (~750 modulepreloads: every public
 * page and language) on each navigation, and the page's own chunks queued behind them (seconds on a CI runner).
 * This server leaves the template as it was (inert comments) but drops the preload links inside conditional
 * branches: the page loads its chunks itself, as without hints. Links outside any branch (entry deps) stay.
 */
const PRELOAD_LINK = /<link\b[^>]*\brel="(?:modulepreload|preload)"[^>]*>/g;
export const stripShellTemplate = (html) => {
  let out = '';
  let depth = 0;
  let last = 0;
  const flush = (to) => {
    const part = html.slice(last, to);
    out += depth > 0 ? part.replace(PRELOAD_LINK, '') : part;
  };
  for (const m of html.matchAll(/<!--tv:([\s\S]*?):tv-->/g)) {
    flush(m.index);
    out += m[0];
    last = m.index + m[0].length;
    const action = m[1].trim();
    if (/^if\b/.test(action)) depth++;
    else if (action === 'end') depth = Math.max(0, depth - 1);
  }
  flush(html.length);
  return out;
};

/** Starts the server; resolves with { server, url, close }. */
export const startStaticServer = ({ dir, port = 0, api } = {}) =>
  new Promise((resolve, reject) => {
    const root = path.resolve(dir ?? 'client/dist');
    const index = path.join(root, 'index.html');
    if (!fs.existsSync(index)) return reject(new Error(`No index.html in ${root} (build the client first)`));
    const apiUrl = api ? new URL(api) : null;
    // gzip each hashed asset once, not on every request (a page loads hundreds of chunks; compressing each of them again per
    // request kept the server busy for seconds and made pages wait for their own chunks).
    const gzipCache = new Map();

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (apiUrl && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/'))) {
        const upstream = http.request(
          { hostname: apiUrl.hostname, port: apiUrl.port, path: req.url, method: req.method, headers: { ...req.headers, host: apiUrl.host } },
          (up) => {
            res.writeHead(up.statusCode ?? 502, up.headers);
            up.pipe(res);
          },
        );
        upstream.on('error', () => {
          res.writeHead(502).end();
        });
        req.pipe(upstream);
        return;
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
        res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"NOT_FOUND"}');
        return;
      }

      let file = path.join(root, decodeURIComponent(url.pathname));
      if (!file.startsWith(root)) return void res.writeHead(403).end();
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        // Missing hashed assets are a real 404 (the SPA fallback would hand HTML to a <script>).
        if (url.pathname.startsWith('/assets/')) return void res.writeHead(404).end();
        file = index;
      }
      const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
      const headers = {
        'content-type': type,
        'cache-control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      };
      const body = file === index ? Buffer.from(stripShellTemplate(fs.readFileSync(index, 'utf8'))) : fs.readFileSync(file);
      if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && body.length > 1024) {
        // Hashed assets never change under the same name: compress them once.
        const cacheable = url.pathname.startsWith('/assets/');
        let gz = cacheable ? gzipCache.get(file) : undefined;
        if (!gz) {
          gz = zlib.gzipSync(body, { level: 6 });
          if (cacheable) gzipCache.set(file, gz);
        }
        res.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'Accept-Encoding', 'content-length': gz.length });
        res.end(gz);
      } else {
        res.writeHead(200, { ...headers, 'content-length': body.length });
        res.end(body);
      }
    });
    server.on('error', reject);
    // No host: listens on IPv4 and IPv6, so "localhost" works whichever the browser resolves first.
    server.listen(port, () => {
      const { port: actual } = server.address();
      const close = () =>
        new Promise((r) => {
          server.close(() => r());
          server.closeAllConnections(); // keep-alive and proxied live connections (SSE) would hold close() open
        });
      resolve({ server, url: `http://localhost:${actual}`, close });
    });
  });

// CLI
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : fallback;
  };
  const { url } = await startStaticServer({ dir: arg('dir', 'client/dist'), port: Number(arg('port', '4174')), api: arg('api') });
  console.log(`serving on ${url}`);
}
