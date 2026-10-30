import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { config } from '../config.js';
import { badRequest } from './http.js';
import { decodeOriginalName } from '../middleware/upload.js';
import { IMAGE_MIME, bufferMatches, resolveMime } from './fileCheck.js';

/**
 * Public images (served from /uploads, cached for 7 days): one pipeline for every upload that reaches the public site.
 *
 * The bytes are decoded and re-encoded by sharp: EXIF (GPS, camera, owner) and any non-image payload are dropped,
 * the photo is auto-rotated by its EXIF orientation first, then shrunk to the preset's long side. Transparency is kept
 * (WebP has an alpha channel). SVG is never re-encoded: it is accepted only where a preset explicitly allows it
 * (CMS logos / icons) and only after the content sniff (no <script>, no on…= handlers); /uploads also has a
 * `default-src 'none'` CSP.
 *
 * Presets:
 *  - vacancy  /uploads/vacancies/<hex32>.webp, long side ≤ 1600 px + `-480` / `-960` width variants (srcset)
 *  - logo     /uploads/logos/<hex32>.webp, employer logo, fits 512 × 512, alpha kept
 *  - photo    /uploads/<stamp>-<hex24>.webp, CMS photos (covers, heroes, housing, posters), long side ≤ 2400 px
 *  - cmsLogo  same folder, ≤ 1024 px, SVG allowed (partner logos, icons)
 *  - avatar   same folder, ≤ 640 px (testimonial author photo)
 *  - og       same folder, JPEG (social crawlers do not all read WebP), ≤ 1600 px, flattened on white, never SVG
 */

export type PublicImagePreset = 'vacancy' | 'logo' | 'photo' | 'cmsLogo' | 'avatar' | 'og';

interface PresetDef {
  /** Folder under the public uploads dir ('' = the CMS root folder). */
  dir: '' | 'vacancies' | 'logos';
  max: number;
  widths: readonly number[];
  min: readonly [number, number];
  format: 'webp' | 'jpeg';
  quality: number;
  svg: boolean;
}

export const PRESETS: Record<PublicImagePreset, PresetDef> = {
  vacancy: { dir: 'vacancies', max: 1600, widths: [480, 960], min: [200, 120], format: 'webp', quality: 80, svg: false },
  logo: { dir: 'logos', max: 512, widths: [], min: [32, 32], format: 'webp', quality: 90, svg: false },
  photo: { dir: '', max: 2400, widths: [], min: [1, 1], format: 'webp', quality: 82, svg: false },
  cmsLogo: { dir: '', max: 1024, widths: [], min: [1, 1], format: 'webp', quality: 90, svg: true },
  avatar: { dir: '', max: 640, widths: [], min: [1, 1], format: 'webp', quality: 82, svg: false },
  og: { dir: '', max: 1600, widths: [], min: [1, 1], format: 'jpeg', quality: 82, svg: false },
};

export const publicDir = () => config.uploads.publicDir;

/** File names this pipeline (and the older CMS upload) writes, per folder: nothing else is ever deleted. */
export const STORED_NAME = {
  vacancies: /^[a-f0-9]{32}(?:-\d{2,4})?\.webp$/,
  logos: /^[a-f0-9]{32}\.webp$/,
  // CMS root: `<ms timestamp>-<24 hex>.<ext>` (images and the story videos of /admin/site-features/video-upload).
  root: /^\d{10,16}-[a-f0-9]{24}\.(?:webp|jpe?g|png|avif|gif|svg|mp4|webm)$/,
} as const;

export const COMPANY_LOGO_URL = /^\/uploads\/logos\/[a-f0-9]{32}\.webp$/;

// ─── Company logo JSON ({ url, w?, h? }) ────────────────────────────────

export const companyLogoSchema = z.object({
  url: z.string().max(200).regex(COMPANY_LOGO_URL),
  w: z.number().int().min(1).max(10_000).optional(),
  h: z.number().int().min(1).max(10_000).optional(),
});
export type CompanyLogo = z.infer<typeof companyLogoSchema>;

/** The stored Company.logo, read defensively (unknown shapes → null). */
export const companyLogoOf = (value: unknown): CompanyLogo | null => {
  const r = companyLogoSchema.safeParse(value);
  return r.success ? r.data : null;
};

// ─── Upload middleware ──────────────────────────────────────────────────

const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const memory = (accepted: Set<string>) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
      if (mime && accepted.has(mime)) {
        file.mimetype = mime;
        cb(null, true);
      } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
    },
  });

const rasterMemory = memory(RASTER);
const anyImageMemory = memory(IMAGE_MIME);

/** multer (memory, one raster `file`: JPEG / PNG / WebP / AVIF ≤ 8 MB) with readable error codes. No SVG. */
export const singleRasterImage = (req: Request, res: Response, next: NextFunction) =>
  rasterMemory.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) return next(badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'IMAGE_TOO_LARGE' : 'INVALID_IMAGE'));
    next(err as Error | undefined);
  });

/** multer (memory, one `file`, any public image type incl. SVG; the route decides whether SVG is allowed). */
export const singleAnyImage = anyImageMemory.single('file');

// ─── Re-encode + store ──────────────────────────────────────────────────

const newName = (def: PresetDef, ext: string) =>
  def.dir ? `${crypto.randomBytes(16).toString('hex')}.${ext}` : `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.${ext}`;

const urlFor = (def: PresetDef, name: string) => (def.dir ? `/uploads/${def.dir}/${name}` : `/uploads/${name}`);

export interface StoredImage {
  url: string;
  w: number;
  h: number;
  format: 'webp' | 'jpeg' | 'svg';
}

/** Re-encodes and stores one raster image with the preset. Throws 400 INVALID_IMAGE / IMAGE_TOO_SMALL. */
export const storePublicImage = async (buf: Buffer, preset: PublicImagePreset): Promise<StoredImage> => {
  const def = PRESETS[preset];
  let main: { data: Buffer; info: sharp.OutputInfo };
  let variants: Buffer[];
  try {
    const base = () => sharp(buf, { limitInputPixels: 40_000_000 }).rotate();
    const encode = (img: sharp.Sharp, quality: number) =>
      def.format === 'jpeg' ? img.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }) : img.webp({ quality, alphaQuality: 90 });
    main = await encode(base().resize({ width: def.max, height: def.max, fit: 'inside', withoutEnlargement: true }), def.quality).toBuffer({ resolveWithObject: true });
    if (main.info.width < def.min[0] || main.info.height < def.min[1]) throw new Error('small');
    variants = await Promise.all(def.widths.map((w) => encode(base().resize({ width: w, withoutEnlargement: true }), def.quality - 2).toBuffer()));
  } catch (err) {
    throw badRequest((err as Error)?.message === 'small' ? 'IMAGE_TOO_SMALL' : 'INVALID_IMAGE');
  }
  const dir = path.join(publicDir(), def.dir);
  await fs.mkdir(dir, { recursive: true });
  const ext = def.format === 'jpeg' ? 'jpg' : 'webp';
  const name = newName(def, ext);
  await fs.writeFile(path.join(dir, name), main.data);
  await Promise.all(def.widths.map((w, i) => fs.writeFile(path.join(dir, name.replace(`.${ext}`, `-${w}.${ext}`)), variants[i])));
  return { url: urlFor(def, name), w: main.info.width, h: main.info.height, format: def.format };
};

/** Width / height an SVG declares (viewBox or width/height attributes), if any. */
const svgSize = async (buf: Buffer) => {
  try {
    const m = await sharp(buf).metadata();
    return m.width && m.height ? { w: m.width, h: m.height } : null;
  } catch {
    return null;
  }
};

/**
 * Stores one upload for a public CMS slot: raster → re-encoded with the preset; SVG → kept as sent (sniffed), only
 * when the preset allows SVG, else 400 SVG_NOT_ALLOWED.
 */
export const storeCmsUpload = async (file: { buffer: Buffer; mimetype: string }, preset: PublicImagePreset): Promise<StoredImage> => {
  const def = PRESETS[preset];
  if (file.mimetype !== 'image/svg+xml') return storePublicImage(file.buffer, preset);
  if (!def.svg) throw badRequest('SVG_NOT_ALLOWED');
  if (!bufferMatches(file.buffer, 'image/svg+xml')) throw badRequest('FILE_CONTENT_MISMATCH');
  const dir = path.join(publicDir(), def.dir);
  await fs.mkdir(dir, { recursive: true });
  const name = newName(def, 'svg');
  await fs.writeFile(path.join(dir, name), file.buffer);
  const size = await svgSize(file.buffer);
  return { url: urlFor(def, name), w: size?.w ?? 0, h: size?.h ?? 0, format: 'svg' };
};

/** `purpose` of an /admin/upload request (query or form field) → preset. Unknown values = photo. */
export const presetForPurpose = (purpose: unknown): PublicImagePreset => {
  switch (purpose) {
    case 'logo':
    case 'icon':
      return 'cmsLogo';
    case 'avatar':
      return 'avatar';
    case 'og':
      return 'og';
    default:
      return 'photo';
  }
};

/** OG / social images must be raster (crawlers ignore SVG): used by the SEO field validators. */
export const isSvgUrl = (url: string | null | undefined) => !!url && /\.svg(?:[?#].*)?$/i.test(url.trim());

// ─── File deletion (only our own files, inside our own folders) ─────────

/**
 * Local file path(s) of a stored public image URL: the main file plus its width variants. Only URLs of the
 * pipeline's own folders and names resolve; anything else (external URLs, brand assets, other folders) → [].
 */
export const filesOfUrl = (url: string): string[] => {
  const clean = url.trim().replace(/[?#].*$/, '');
  const root = publicDir();
  let m = /^\/uploads\/vacancies\/([a-f0-9]{32})\.webp$/.exec(clean);
  if (m) return [`${m[1]}.webp`, ...PRESETS.vacancy.widths.map((w) => `${m![1]}-${w}.webp`)].map((n) => path.join(root, 'vacancies', n));
  m = /^\/uploads\/logos\/([a-f0-9]{32})\.webp$/.exec(clean);
  if (m) return [path.join(root, 'logos', `${m[1]}.webp`)];
  m = /^\/uploads\/([^/]+)$/.exec(clean);
  if (m && STORED_NAME.root.test(m[1])) return [path.join(root, m[1])];
  return [];
};

/** Deletes one file if it is a regular file (never a symlink / directory) strictly inside the public folder. */
export const safeUnlink = async (file: string): Promise<boolean> => {
  const root = path.resolve(publicDir());
  const abs = path.resolve(file);
  if (!abs.startsWith(root + path.sep)) return false;
  try {
    const st = await fs.lstat(abs);
    if (!st.isFile() || st.isSymbolicLink()) return false;
    await fs.unlink(abs);
    return true;
  } catch {
    return false;
  }
};
