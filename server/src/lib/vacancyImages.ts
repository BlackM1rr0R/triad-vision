import { z } from 'zod';
import { PRESETS, singleRasterImage, storePublicImage } from './publicImages.js';

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
export const VACANCY_IMAGE_WIDTHS = PRESETS.vacancy.widths;
const URL_RE = /^\/uploads\/vacancies\/[a-f0-9]{32}\.webp$/;

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

/** multer (memory, one `file`) with readable error codes (lib/publicImages.ts). */
export const singleVacancyImage = singleRasterImage;

/** Re-encodes and stores one photo (lib/publicImages.ts, preset "vacancy"). Returns the main URL and its size. */
export const storeVacancyImage = async (buf: Buffer): Promise<{ url: string; w: number; h: number }> => {
  const { url, w, h } = await storePublicImage(buf, 'vacancy');
  return { url, w, h };
};
