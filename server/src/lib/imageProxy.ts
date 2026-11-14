import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import sharp from 'sharp';
import { config } from '../config.js';
import { STORED_NAME } from './publicImages.js';

/**
 * Same-origin, resized WebP copies of the public site's photos (CMS covers, page heroes, stock photos):
 *
 *   GET /api/img/<width>/<base64url(source)>.webp
 *
 * The browser no longer opens a second connection (DNS + TLS to images.unsplash.com) for the LCP image of a
 * page, and every image arrives at the width it is displayed at (srcset), as WebP. The client builds the URLs in
 * client/src/lib/img.ts (sized / srcSet); the server-rendered HTML and the hydrated page use the same function.
 *
 * Sources (anything else answers 404 — no open proxy, no SSRF):
 *  - https URLs on an allowlisted host: images.unsplash.com (+ IMAGE_PROXY_HOSTS, comma-separated host names);
 *    no credentials, no port, no redirects followed, image/* only, ≤ 20 MB, 10 s timeout.
 *  - CMS photos of this site: /uploads/<stamp>-<hex>.(webp|jpg|png|avif|gif), read from the public uploads folder.
 * Widths: one of IMAGE_WIDTHS (a few presets, so the cache cannot be blown up with every integer).
 *
 * Cache: <uploads>/cache/img/<2 hex>/<sha256>.webp, written once (temp file + rename), served with
 * `Cache-Control: public, max-age=31536000, immutable` (the source URLs are content-addressed: an Unsplash photo id
 * or a CMS file name never changes its bytes). Concurrent misses of one key share a single conversion; at most
 * MAX_CONVERSIONS run at once and a long queue answers with a redirect to the original instead of waiting.
 * When the upstream fails the response is a short-lived 302 to the original image, so a page never shows a broken
 * image because of the proxy. pruneImageCache (nightly job) keeps the folder under IMAGE_CACHE_MAX_MB.
 */

export const IMAGE_WIDTHS = [160, 240, 320, 400, 480, 600, 640, 720, 800, 900, 960, 1000, 1200, 1280, 1600, 1920] as const;

const DEFAULT_HOSTS = ['images.unsplash.com'];
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_CONVERSIONS = 3;
const MAX_QUEUE = 40;
const FETCH_TIMEOUT_MS = 10_000;
const QUALITY = 74;

export const imageCacheDir = () => path.join(config.uploads.cacheDir, 'img');

export const allowedImageHosts = () =>
  new Set([
    ...DEFAULT_HOSTS,
    ...(process.env.IMAGE_PROXY_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => /^[a-z0-9.-]+$/.test(h)),
  ]);

export type ImageSource = { kind: 'remote'; url: URL } | { kind: 'local'; file: string; path: string };

/** Decodes and validates the source of a proxy URL; null = not allowed. */
export const parseImageSource = (token: string): ImageSource | null => {
  if (!/^[A-Za-z0-9_-]{4,2800}$/.test(token)) return null;
  let raw: string;
  try {
    raw = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (raw.length > 2048) return null;
  if (raw.startsWith('/uploads/')) {
    const name = raw.slice('/uploads/'.length);
    if (!STORED_NAME.root.test(name) || /\.(?:svg|mp4|webm)$/.test(name)) return null;
    return { kind: 'local', file: path.join(config.uploads.publicDir, name), path: raw };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowedImageHosts().has(url.hostname.toLowerCase())) return null;
  url.hash = '';
  return { kind: 'remote', url };
};

/** The URL fetched from the upstream: Unsplash resizes on its side first (less to download), JPEG at q 80. */
export const upstreamUrl = (url: URL, width: number) => {
  const u = new URL(url.toString());
  if (u.hostname === 'images.unsplash.com') {
    u.searchParams.set('w', String(width));
    u.searchParams.set('q', '80');
    u.searchParams.delete('auto');
    u.searchParams.delete('fm');
    u.searchParams.delete('dpr');
  }
  return u;
};

/** Where the browser should go when the proxy cannot deliver (the original, at the requested width where possible). */
export const fallbackUrl = (src: ImageSource, width: number) => {
  if (src.kind === 'local') return src.path;
  const u = upstreamUrl(src.url, width);
  if (u.hostname === 'images.unsplash.com') u.searchParams.set('auto', 'format');
  return u.toString();
};

const cacheFile = (token: string, width: number) => {
  const hash = crypto.createHash('sha256').update(`v1|${width}|${token}`).digest('hex');
  return path.join(imageCacheDir(), hash.slice(0, 2), `${hash}.webp`);
};

const readSource = async (src: ImageSource, width: number): Promise<Buffer> => {
  if (src.kind === 'local') return fs.readFile(src.file);
  const res = await fetch(upstreamUrl(src.url, width), {
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8', 'User-Agent': 'image-cache/1.0' },
  });
  if (res.status !== 200) throw new Error(`upstream ${res.status}`);
  if (!/^image\//i.test(res.headers.get('content-type') ?? '')) throw new Error('upstream not an image');
  if (Number(res.headers.get('content-length') ?? 0) > MAX_SOURCE_BYTES) throw new Error('upstream too large');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_SOURCE_BYTES) throw new Error('upstream too large');
  return buf;
};

/** Resized WebP of an image buffer (EXIF orientation applied, metadata dropped, never enlarged). */
export const toWebp = (input: Buffer, width: number) =>
  sharp(input, { limitInputPixels: 60_000_000, failOn: 'error' })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 4 })
    .toBuffer();

let running = 0;
const waiting: (() => void)[] = [];
const inflight = new Map<string, Promise<void>>();

const withSlot = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (running >= MAX_CONVERSIONS) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
};

const convert = (src: ImageSource, width: number, file: string) =>
  withSlot(async () => {
    const out = await toWebp(await readSource(src, width), width);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, out);
    await fs.rename(tmp, file);
  });

const DAY = 24 * 60 * 60 * 1000;

const sendCached = (res: Response, file: string) => {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type('image/webp');
  res.sendFile(file);
};

/** Express handler of GET /api/img/:w/:file. */
export const imageProxyHandler = async (req: Request, res: Response) => {
  const width = Number(req.params.w);
  const m = /^([A-Za-z0-9_-]+)\.webp$/.exec(String(req.params.file ?? ''));
  const src = m && (IMAGE_WIDTHS as readonly number[]).includes(width) ? parseImageSource(m[1]) : null;
  if (!src) {
    res.status(404).setHeader('Cache-Control', 'public, max-age=300');
    res.json({ error: 'NOT_FOUND' });
    return;
  }
  const file = cacheFile(m![1], width);
  const stat = await fs.stat(file).catch(() => null);
  if (stat) {
    // Mark as recently used for the size cap (at most once a week per file).
    if (Date.now() - stat.mtimeMs > 7 * DAY) void fs.utimes(file, new Date(), new Date()).catch(() => {});
    sendCached(res, file);
    return;
  }
  const fallback = () => {
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, fallbackUrl(src, width));
  };
  let job = inflight.get(file);
  if (!job) {
    if (waiting.length >= MAX_QUEUE) return fallback();
    job = convert(src, width, file).finally(() => inflight.delete(file));
    inflight.set(file, job);
  }
  try {
    await job;
  } catch (err) {
    // Only the reason, never the request: the URL is public data, but keep the log short.
    console.warn(`[image-proxy] ${src.kind === 'remote' ? src.url.hostname : 'local'} w=${width}: ${(err as Error).message}`);
    return fallback();
  }
  sendCached(res, file);
};

/** Deletes cache files unused for 90 days, then the least recently used ones above the size cap. */
export const pruneImageCache = async (maxBytes = Number(process.env.IMAGE_CACHE_MAX_MB ?? 2048) * 1024 * 1024) => {
  const root = imageCacheDir();
  const files: { file: string; size: number; mtime: number }[] = [];
  for (const dir of await fs.readdir(root).catch(() => [] as string[])) {
    if (!/^[a-f0-9]{2}$/.test(dir)) continue;
    for (const name of await fs.readdir(path.join(root, dir)).catch(() => [] as string[])) {
      const file = path.join(root, dir, name);
      const st = await fs.stat(file).catch(() => null);
      if (st?.isFile()) files.push({ file, size: st.size, mtime: st.mtimeMs });
    }
  }
  files.sort((a, b) => a.mtime - b.mtime);
  let total = files.reduce((s, f) => s + f.size, 0);
  let deleted = 0;
  const now = Date.now();
  for (const f of files) {
    const stale = now - f.mtime > 90 * DAY || (f.file.endsWith('.tmp') && now - f.mtime > DAY);
    if (!stale && total <= maxBytes) break;
    await fs.rm(f.file, { force: true });
    total -= f.size;
    deleted++;
  }
  return { files: files.length, deleted, bytes: total };
};
