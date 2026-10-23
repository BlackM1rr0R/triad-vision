#!/usr/bin/env node
// CI guard: every inline <script> in the built client/dist/index.html must be allowed by a sha256 hash in
// the CSP of deploy/Caddyfile. A mismatch means a white page in production (the browser blocks the theme
// script), so the pipeline stops before deploying.
//
//   node scripts/ci/check-csp-hash.mjs [path/to/index.html]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const htmlPath = path.resolve(process.argv[2] ?? path.join(root, 'client', 'dist', 'index.html'));
const caddy = fs.readFileSync(path.join(root, 'deploy', 'Caddyfile'), 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');

const allowed = new Set([...caddy.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]));
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

let failed = false;
for (const body of inline) {
  if (!body.trim()) continue;
  const hash = `sha256-${crypto.createHash('sha256').update(body).digest('base64')}`;
  if (allowed.has(hash)) {
    console.log(`ok   ${hash}`);
  } else {
    failed = true;
    console.error(`FAIL inline script not allowed by the CSP: ${hash}`);
    console.error('     Update the script-src hash in deploy/Caddyfile (and keep client/index.html LF).');
  }
}
if (failed) process.exit(1);
console.log(`CSP check passed (${inline.length} inline script(s)).`);
