/**
 * Public photos at the size they are displayed, from our own origin, as WebP.
 *
 * Stock photos (images.unsplash.com) and CMS photos (/uploads/<stamp>-<hex>.webp|jpg|png…) go through the API image
 * cache: `/api/img/<width>/<base64url(source)>.webp` (server/src/lib/imageProxy.ts) — resized, re-encoded, cached
 * on disk and immutable. Same origin: the LCP photo of a page needs no extra DNS + TLS connection. Other URLs
 * (vacancy photos with their own variants, SVG logos, data: URIs) are returned unchanged.
 *
 * Pure and deterministic: the server-rendered HTML and the hydrated page build identical URLs.
 */

/** Widths the server accepts (keep in sync with IMAGE_WIDTHS in server/src/lib/imageProxy.ts). */
export const IMAGE_WIDTHS = [160, 240, 320, 400, 480, 600, 640, 720, 800, 900, 960, 1000, 1200, 1280, 1600, 1920] as const;

const LOCAL = /^\/uploads\/\d{10,16}-[a-f0-9]{24}\.(?:webp|jpe?g|png|avif|gif)$/;

/** Whether a URL is served through the image cache. */
export const proxiable = (url: string) => {
  if (LOCAL.test(url)) return true;
  return url.startsWith('https://images.unsplash.com/');
};

/** Smallest preset ≥ width (the largest preset for anything bigger). */
export const snapWidth = (width: number) => IMAGE_WIDTHS.find((w) => w >= width) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];

const base64url = (s: string) => {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const sized = (url: string, width: number) => (url && proxiable(url) ? `/api/img/${snapWidth(width)}/${base64url(url)}.webp` : url);

/** srcSet for responsive <img>: browser picks the smallest that is sharp on the current screen. */
export const srcSet = (url: string, widths: number[]) =>
  url && proxiable(url) ? [...new Set(widths.map(snapWidth))].map((w) => `${sized(url, w)} ${w}w`).join(', ') : undefined;
