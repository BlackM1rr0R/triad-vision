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
import { resolveMime } from './fileCheck.js';

/**
 * Vacancy cover + gallery images (Vacancy.images = [{ url, alt?, w?, h? }], first = cover).
 *
 * Upload (admin and employer portal): one photo per request, JPEG / PNG / WebP / AVIF up to 8 MB (no SVG:
 * employers are not trusted). The bytes are decoded and re-encoded by sharp, so EXIF (GPS, camera) and any
 * non-image payload are dropped: `<hex>.webp` (long side ≤ 1600 px) plus width variants `<hex>-480.webp` and
 * `<hex>-960.webp` for srcset, all in /uploads/vacancies/. Employer images only reach the public board through
 * the vacancy review (an employer edit of a live vacancy sends it back to PENDING).
 */

export const VACANCY_IMAGE_MAX = 8;
export const VACANCY_IMAGE_WIDTHS = [480, 960] as const;
const MAIN_WIDTH = 1600;
const DIR = () => path.join(config.uploads.publicDir, 'vacancies');
const URL_RE = /^\/uploads\/vacancies\/[a-f0-9]{32}\.webp$/;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export const vacancyImageSchema = z.object({
  url: z.string().max(200).regex(URL_RE, 'INVALID_IMAGE_URL'),
  alt: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => v || undefined),
  w: z.number().int().min(1).max(10_000).optional(),
  h: z.number().int().min(1).max(10_000).optional(),
});
export const vacancyImagesField = z
  .array(vacancyImageSchema)
  .max(VACANCY_IMAGE_MAX, 'TOO_MANY_IMAGES')
  .refine((list) => new Set(list.map((i) => i.url)).size === list.length, 'DUPLICATE_IMAGE')
  .nullable()
  .optional();

export type VacancyImage = z.infer<typeof vacancyImageSchema>;

/** The stored JSON, read defensively (unknown shapes are dropped). */
export const vacancyImagesOf = (value: unknown): VacancyImage[] => {
  if (!Array.isArray(value)) return [];
  const out: VacancyImage[] = [];
  for (const item of value) {
    const r = vacancyImageSchema.safeParse(item);
    if (r.success) out.push(r.data);
    if (out.length >= VACANCY_IMAGE_MAX) break;
  }
  return out;
};

/** URL of a width variant ("/uploads/vacancies/<hex>-480.webp"). */
export const variantUrl = (url: string, width: number) => url.replace(/\.webp$/, `-${width}.webp`);

const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
    if (mime && ACCEPTED.has(mime)) cb(null, true);
    else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

/** multer (memory, one `file`) with readable error codes. */
export const singleVacancyImage = (req: Request, res: Response, next: NextFunction) =>
  memory.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) return next(badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'IMAGE_TOO_LARGE' : 'INVALID_IMAGE'));
    next(err as Error | undefined);
  });

/** Re-encodes and stores one photo. Returns the main URL and its size. */
export const storeVacancyImage = async (buf: Buffer): Promise<{ url: string; w: number; h: number }> => {
  let main: { data: Buffer; info: sharp.OutputInfo };
  let variants: Buffer[];
  try {
    const base = () => sharp(buf, { limitInputPixels: 40_000_000 }).rotate();
    main = await base().resize({ width: MAIN_WIDTH, height: MAIN_WIDTH, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    if (main.info.width < 200 || main.info.height < 120) throw new Error('small');
    variants = await Promise.all(
      VACANCY_IMAGE_WIDTHS.map((w) => base().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()),
    );
  } catch (err) {
    throw badRequest((err as Error)?.message === 'small' ? 'IMAGE_TOO_SMALL' : 'INVALID_IMAGE');
  }
  await fs.mkdir(DIR(), { recursive: true });
  const id = crypto.randomBytes(16).toString('hex');
  await fs.writeFile(path.join(DIR(), `${id}.webp`), main.data);
  await Promise.all(VACANCY_IMAGE_WIDTHS.map((w, i) => fs.writeFile(path.join(DIR(), `${id}-${w}.webp`), variants[i])));
  return { url: `/uploads/vacancies/${id}.webp`, w: main.info.width, h: main.info.height };
};
