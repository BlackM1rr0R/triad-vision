import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../../src/config.js';
import { IMAGE_WIDTHS, fallbackUrl, imageCacheDir, imageProxyHandler, parseImageSource, pruneImageCache, upstreamUrl } from '../../src/lib/imageProxy.js';
import { fileURLToPath } from 'node:url';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const app = express().get('/api/img/:w/:file', imageProxyHandler);
const UNSPLASH = 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=2000&q=70';
const LOCAL = '/uploads/1731500000000-0123456789abcdef01234567.jpg';

// The client builds the URLs (client/src/lib/img.ts): loaded at run time, outside this project's rootDir.
type ClientImg = { IMAGE_WIDTHS: readonly number[]; sized: (url: string, w: number) => string; srcSet: (url: string, ws: number[]) => string | undefined };
let client: ClientImg;

const jpeg = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#c86' } }).jpeg().toBuffer();

beforeAll(async () => {
  client = (await import(fileURLToPath(new URL('../../../client/src/lib/img.ts', import.meta.url)))) as ClientImg;
  await fs.mkdir(config.uploads.publicDir, { recursive: true });
  await fs.writeFile(path.join(config.uploads.publicDir, path.basename(LOCAL)), await jpeg(1600, 1000));
  await fs.rm(imageCacheDir(), { recursive: true, force: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('image proxy: sources', () => {
  it('accepts only allowlisted https hosts and CMS raster files', () => {
    expect(parseImageSource(b64(UNSPLASH))).toMatchObject({ kind: 'remote' });
    expect(parseImageSource(b64(LOCAL))).toMatchObject({ kind: 'local', path: LOCAL });
    for (const bad of [
      'http://images.unsplash.com/x',
      'https://images.unsplash.com:8443/x',
      'https://user:pw@images.unsplash.com/x',
      'https://evil.example/x.jpg',
      'https://images.unsplash.com.evil.example/x',
      'https://169.254.169.254/latest/meta-data',
      'file:///etc/passwd',
      '/uploads/../private/x.jpg',
      '/uploads/1731500000000-0123456789abcdef01234567.svg',
      '/uploads/vacancies/0123456789abcdef0123456789abcdef.webp',
    ]) {
      expect(parseImageSource(b64(bad)), bad).toBeNull();
    }
    expect(parseImageSource('not+base64/url')).toBeNull();
  });

  it('asks Unsplash for the requested width and falls back to the original', () => {
    const src = parseImageSource(b64(UNSPLASH))!;
    expect(src.kind).toBe('remote');
    const u = upstreamUrl((src as { url: URL }).url, 640);
    expect(u.searchParams.get('w')).toBe('640');
    expect(u.searchParams.get('auto')).toBeNull();
    expect(u.searchParams.get('fit')).toBe('crop');
    expect(fallbackUrl(src, 640)).toContain('w=640');
    expect(fallbackUrl(parseImageSource(b64(LOCAL))!, 640)).toBe(LOCAL);
  });

  it('client URLs match the server (same widths, same encoding, deterministic)', () => {
    const { IMAGE_WIDTHS: CLIENT_WIDTHS, sized, srcSet } = client;
    expect([...CLIENT_WIDTHS]).toEqual([...IMAGE_WIDTHS]);
    expect(sized(UNSPLASH, 700)).toBe(`/api/img/720/${b64(UNSPLASH)}.webp`);
    expect(sized(LOCAL, 400)).toBe(`/api/img/400/${b64(LOCAL)}.webp`);
    expect(sized('/uploads/vacancies/x.webp', 400)).toBe('/uploads/vacancies/x.webp');
    expect(sized('https://example.com/a.jpg', 400)).toBe('https://example.com/a.jpg');
    expect(srcSet(UNSPLASH, [480, 720, 1000])).toBe([480, 720, 1000].map((w) => `/api/img/${w}/${b64(UNSPLASH)}.webp ${w}w`).join(', '));
    expect(srcSet('https://example.com/a.jpg', [480])).toBeUndefined();
  });
});

describe('image proxy: GET /api/img/:w/:file', () => {
  it('serves a resized, immutable WebP of a CMS photo and caches it on disk', async () => {
    const res = await request(app).get(`/api/img/480/${b64(LOCAL)}.webp`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/webp/);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const meta = await sharp(res.body as Buffer).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 480, height: 300 });
    const second = await request(app).get(`/api/img/480/${b64(LOCAL)}.webp`);
    expect(second.status).toBe(200);
  });

  it('fetches remote photos once (no redirects followed) and redirects to the original when the upstream fails', async () => {
    const body = await jpeg(640, 400);
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(init.redirect).toBe('manual');
      return new Response(new Uint8Array(body), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const url = `/api/img/640/${b64(UNSPLASH)}.webp`;
    const [a, b] = await Promise.all([request(app).get(url), request(app).get(url)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('w=640');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('moved', { status: 301, headers: { location: 'https://evil.example/' } })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const other = 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?fit=crop&w=2000';
    const failed = await request(app).get(`/api/img/800/${b64(other)}.webp`);
    expect(failed.status).toBe(302);
    expect(failed.headers.location).toMatch(/^https:\/\/images\.unsplash\.com\/photo-1601584115197-04ecc0da31d7\?.*w=800/);
    expect(failed.headers['cache-control']).toBe('no-store');
  });

  it('404s on unknown widths, hosts and file names', async () => {
    expect((await request(app).get(`/api/img/123/${b64(LOCAL)}.webp`)).status).toBe(404);
    expect((await request(app).get(`/api/img/480/${b64('https://evil.example/a.jpg')}.webp`)).status).toBe(404);
    expect((await request(app).get(`/api/img/480/${b64(LOCAL)}.png`)).status).toBe(404);
  });

  it('prunes the cache down to its size cap', async () => {
    const before = await pruneImageCache(Number.MAX_SAFE_INTEGER);
    expect(before.files).toBeGreaterThanOrEqual(2);
    expect(before.deleted).toBe(0);
    const after = await pruneImageCache(0);
    expect(after.deleted).toBe(before.files);
    expect(after.bytes).toBe(0);
  });
});
