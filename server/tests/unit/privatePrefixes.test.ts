import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PRIVATE_PREFIXES } from '../../src/lib/seoCatalogue.js';

/**
 * QA PUB-7: the private areas (no language prefix, no SSR, noindex) are listed three times — the client router
 * (client/src/lib/siteLocale.ts ROUTING_PRIVATE_PREFIXES), the server (lib/seoCatalogue.ts PRIVATE_PREFIXES) and
 * Caddy (@lnglegacy exclusions in deploy/Caddyfile). They must agree, or e.g. /upload/<token> got a /de prefix
 * and server rendering.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let client: { ROUTING_PRIVATE_PREFIXES: readonly string[]; isPrivatePath: (p: string) => boolean };
beforeAll(async () => {
  client = await import(/* @vite-ignore */ pathToFileURL(path.join(root, 'client/src/lib/siteLocale.ts')).href);
});

/** Client-only entries: static files and Vite assets, not pages (the server never renders them). */
const CLIENT_ONLY = new Set(['/uploads']);

describe('private path prefixes', () => {
  it('client list = server list (plus static file folders)', () => {
    const c = client.ROUTING_PRIVATE_PREFIXES.filter((p) => !CLIENT_ONLY.has(p));
    expect([...c].sort()).toEqual([...PRIVATE_PREFIXES].sort());
  });

  it('every server prefix is excluded from the Caddy ?lng= legacy redirect', () => {
    const caddy = fs.readFileSync(path.join(root, 'deploy/Caddyfile'), 'utf8');
    const m = /@lnglegacy \{[\s\S]*?not path_regexp \^\(\/\([a-z|]+\)\)\?\/\(([^)]+)\)/.exec(caddy);
    expect(m, 'Caddy @lnglegacy exclusion').toBeTruthy();
    const excluded = new Set(m![1].split('|').map((s) => `/${s}`));
    for (const p of PRIVATE_PREFIXES) expect(excluded.has(p), p).toBe(true);
  });

  it('token pages are private on the client', () => {
    expect(client.isPrivatePath('/upload/abc')).toBe(true);
    expect(client.isPrivatePath('/originals/verify/X1')).toBe(true);
    expect(client.isPrivatePath('/uploader')).toBe(false);
  });
});
