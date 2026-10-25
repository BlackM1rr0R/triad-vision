import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../../config.js';
import { badRequest } from '../http.js';

/**
 * Brand images (System → Brand): logos and the PWA / favicon icon set. Every upload is decoded and
 * re-encoded as PNG by sharp, so whatever arrives (PNG, JPEG, WebP, SVG) is stored as plain pixels without
 * metadata, scripts or external references — an uploaded SVG never reaches a browser as SVG. Files live in
 * <UPLOADS_DIR>/public/brand/ and are served by the API's /uploads static handler.
 */

export const BRAND_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(['png', 'jpeg', 'webp', 'svg']);
const brandDir = () => path.join(config.uploads.publicDir, 'brand');

const decode = async (buf: Buffer) => {
  if (!buf.length || buf.length > BRAND_IMAGE_MAX_BYTES) throw badRequest('BRAND_IMAGE_TOO_LARGE');
  let meta: sharp.Metadata;
  try {
    // limitInputPixels: a tiny file must not decompress into a gigapixel bitmap.
    meta = await sharp(buf, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw badRequest('BRAND_IMAGE_INVALID');
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format) || !meta.width || !meta.height) throw badRequest('BRAND_IMAGE_INVALID');
  return { meta, img: () => sharp(buf, { limitInputPixels: 40_000_000, density: meta.format === 'svg' ? 300 : undefined }) };
};

const hash = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

/** Logo for the header / documents: PNG, at most 1200 × 400 px, aspect kept. Returns its public URL. */
export const storeLogo = async (buf: Buffer, kind: 'light' | 'dark') => {
  const { img } = await decode(buf);
  const png = await img().resize({ width: 1200, height: 400, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  await fs.mkdir(brandDir(), { recursive: true });
  const name = `logo-${kind}-${hash(png)}`;
  await fs.writeFile(path.join(brandDir(), `${name}.png`), png);
  return `/uploads/brand/${name}.png`;
};

const hexToRgb = (hex: string) => {
  const h = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '0b1f44';
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), alpha: 1 };
};

/**
 * PWA / favicon icon set from a square logo: icon-192/512 (transparent), maskable-192/512 (logo in the 80 %
 * safe zone on the brand colour), apple-touch-icon (180, opaque), favicon-48 and badge-96.
 * Returns the folder name stored in Setting brand.iconSet.
 */
export const storeIconSet = async (buf: Buffer, background: string) => {
  const { meta, img } = await decode(buf);
  const ratio = meta.width! / meta.height!;
  if (ratio < 0.8 || ratio > 1.25) throw badRequest('BRAND_ICON_NOT_SQUARE');
  if (Math.min(meta.width!, meta.height!) < 64 && meta.format !== 'svg') throw badRequest('BRAND_ICON_TOO_SMALL');
  const bg = hexToRgb(background);
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  const plain = (size: number) => img().resize(size, size, { fit: 'contain', background: transparent }).png().toBuffer();
  const padded = async (size: number, inner: number, fill: typeof bg) => {
    const logo = await img().resize(inner, inner, { fit: 'contain', background: transparent }).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: fill } })
      .composite([{ input: logo, gravity: 'centre' }])
      .png()
      .toBuffer();
  };
  const files: Record<string, Buffer> = {
    'icon-192': await plain(192),
    'icon-512': await plain(512),
    'icon-maskable-192': await padded(192, 154, bg),
    'icon-maskable-512': await padded(512, 410, bg),
    'apple-touch-icon': await padded(180, 150, { r: 255, g: 255, b: 255, alpha: 1 }),
    'favicon-48': await plain(48),
    'badge-96': await plain(96),
  };
  const set = `icons-${hash(files['icon-512'])}`;
  const dir = path.join(brandDir(), set);
  await fs.mkdir(dir, { recursive: true });
  for (const [name, png] of Object.entries(files)) await fs.writeFile(path.join(dir, `${name}.png`), png);
  return set;
};
