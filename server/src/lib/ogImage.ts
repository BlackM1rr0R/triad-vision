import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import sharp from 'sharp';
import { config } from '../config.js';
import { SITE_NAME, STATIC_PAGES, textIn, type SeoLocale } from './seoCatalogue.js';
import { collapse, liveJobs, pick, type OgKind, type SeoData } from './seo.js';

/*
 * Dynamic Open Graph images: a 1200×630 PNG title card per page (visas, services, news, jobs, events, guides)
 * used as og:image when the page has no image of its own.
 *
 * The text is drawn as vector outlines (DejaVu Sans via fontkit — the same fonts the PDF features ship), so
 * the image looks the same everywhere and needs no system fonts in the container: Azerbaijani (ə, ğ, ı),
 * Turkish, Cyrillic and German all render. sharp turns the SVG into a PNG; results are cached on disk next to
 * the uploads (keyed by the text, so an edited title gets a new card) and in Cloudflare/browsers for a day.
 */

const require = createRequire(import.meta.url);
const W = 1200;
const H = 630;
const CACHE_DIR = path.join(path.dirname(config.uploads.publicDir), 'og-cache');
const VERSION = 'v2';

export type Font = ReturnType<typeof fontkit.create>;
let fonts: Promise<{ bold: Font; regular: Font }> | null = null;
export const loadFonts = () =>
  (fonts ??= Promise.all([
    fs.readFile(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf')),
    fs.readFile(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf')),
  ]).then(([b, r]) => ({ bold: fontkit.create(b), regular: fontkit.create(r) })));

export const widthOf = (font: Font, text: string, size: number) => {
  const run = font.layout(text);
  return (run.positions.reduce((w, p) => w + p.xAdvance, 0) * size) / font.unitsPerEm;
};

/** SVG path data of a text line at (x, baseline). */
export const textPath = (font: Font, text: string, size: number, x: number, baseline: number) => {
  const run = font.layout(text);
  const scale = size / font.unitsPerEm;
  let cx = 0;
  const parts: string[] = [];
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i];
    const d = g.path.toSVG();
    if (d) {
      const tx = x + (cx + pos.xOffset) * scale;
      const ty = baseline - pos.yOffset * scale;
      parts.push(`<path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})" d="${d}"/>`);
    }
    cx += pos.xAdvance;
  });
  return parts.join('');
};

/** Greedy word wrap into at most `maxLines` lines (the last one gets an ellipsis if text remains). */
export const wrap = (font: Font, text: string, size: number, maxWidth: number, maxLines: number) => {
  const words = collapse(text).split(' ');
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const next = current ? `${current} ${words[i]}` : words[i];
    if (widthOf(font, next, size) <= maxWidth || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = words[i];
    if (lines.length === maxLines) {
      current = '';
      const last = lines[maxLines - 1];
      let cut = last;
      while (cut.length > 1 && widthOf(font, `${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
      lines[maxLines - 1] = `${cut.replace(/[\s,.;:—–-]+$/, '')}…`;
      break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
};

/** The card as SVG (exported for tests). */
export const ogCardSvg = async (title: string, kicker: string, lang = 'en') => {
  const { bold, regular } = await loadFonts();
  let size = 64;
  let lines = wrap(bold, title, size, W - 160, 3);
  if (lines.length === 3) {
    size = 54;
    lines = wrap(bold, title, size, W - 160, 3);
  }
  const lineHeight = size * 1.22;
  const blockTop = 300 - (lines.length * lineHeight) / 2 + size * 0.4;
  const titlePaths = lines.map((l, i) => textPath(bold, l, size, 80, blockTop + i * lineHeight)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1f44"/><stop offset="1" stop-color="#173a7a"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<circle cx="1080" cy="90" r="220" fill="#ffffff" fill-opacity="0.04"/>
<circle cx="1140" cy="560" r="160" fill="#3b82f6" fill-opacity="0.10"/>
<rect x="80" y="72" width="56" height="8" rx="4" fill="#3b82f6"/>
<g fill="#93c5fd">${textPath(bold, kicker.toLocaleUpperCase(lang), 26, 80, 130)}</g>
<g fill="#ffffff">${titlePaths}</g>
<rect x="0" y="${H - 96}" width="${W}" height="96" fill="#000000" fill-opacity="0.18"/>
<g fill="#ffffff">${textPath(bold, SITE_NAME, 34, 80, H - 36)}</g>
<g fill="#cbd5e1">${textPath(regular, 'triad-vision.de', 26, W - 80 - widthOf(regular, 'triad-vision.de', 26), H - 38)}</g>
<g transform="translate(1048 72)"><rect width="16" height="44" rx="2" fill="#00b5e2"/><rect x="20" width="16" height="44" rx="2" fill="#ef3340"/><rect x="40" width="16" height="44" rx="2" fill="#509e2f"/><rect x="60" width="16" height="44" rx="2" fill="#ffce00"/></g>
</svg>`;
};

/** Title and kicker (section name) of the page an OG card is requested for, or null if it does not exist. */
export const ogCardText = (data: SeoData, kind: OgKind, slug: string, lng: SeoLocale): { title: string; kicker: string } | null => {
  const section = (p: string) => (STATIC_PAGES[p] ? textIn(STATIC_PAGES[p].name, lng) : SITE_NAME);
  switch (kind) {
    case 'visas': {
      const v = data.visas.find((x) => x.slug === slug);
      return v ? { title: collapse(pick(v.title, lng)), kicker: `${section('/visas')}${v.visaLabel ? ` · ${v.visaLabel}` : ''}` } : null;
    }
    case 'services': {
      const s = data.services.find((x) => x.slug === slug);
      return s ? { title: collapse(pick(s.title, lng)), kicker: section('/services') } : null;
    }
    case 'news': {
      const p = data.posts.find((x) => x.slug === slug);
      return p ? { title: collapse(pick(p.title, lng)), kicker: section('/news') } : null;
    }
    case 'jobs': {
      const j = liveJobs(data).find((x) => x.slug === slug);
      return j ? { title: collapse(pick(j.title, lng)) + (j.city ? ` — ${j.city}` : ''), kicker: section('/jobs') } : null;
    }
    case 'events': {
      const e = (data.events ?? []).find((x) => x.slug === slug);
      return e ? { title: collapse(pick(e.title, lng)), kicker: section('/events') } : null;
    }
    case 'guides': {
      const g = (data.guides ?? []).find((x) => x.slug === slug && x.locale === lng);
      return g ? { title: g.title, kicker: section('/guides') } : null;
    }
  }
};

const inflight = new Map<string, Promise<Buffer>>();

/** PNG bytes of a card (disk cache; concurrent requests for the same card render once). */
export const ogCardPng = async (title: string, kicker: string, lang = 'en'): Promise<Buffer> => {
  const key = createHash('sha256').update(`${VERSION}\n${lang}\n${kicker}\n${title}`).digest('hex').slice(0, 32);
  const file = path.join(CACHE_DIR, `${key}.png`);
  try {
    return await fs.readFile(file);
  } catch {
    /* not cached yet */
  }
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = (async () => {
    const png = await sharp(Buffer.from(await ogCardSvg(title, kicker, lang)))
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer();
    await fs
      .mkdir(CACHE_DIR, { recursive: true })
      .then(() => fs.writeFile(file, png))
      .catch((err) => console.warn('[og] cache write failed', err instanceof Error ? err.message : err));
    return png;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
};
