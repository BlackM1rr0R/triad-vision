import type { VacancyImage } from './types';

/** Same limit as the server (lib/vacancyImages.ts). */
export const VACANCY_IMAGE_MAX = 8;

const STORED = /^\/uploads\/vacancies\/[a-f0-9]{32}\.webp$/;

/**
 * srcset of a stored vacancy photo: the server writes `<id>-480.webp`, `<id>-960.webp` and `<id>.webp`
 * (long side ≤ 1600 px). Other URLs get no srcset.
 */
export const vacancyImageSrcSet = (img: Pick<VacancyImage, 'url' | 'w'>) => {
  if (!STORED.test(img.url)) return undefined;
  const v = (w: number) => img.url.replace(/\.webp$/, `-${w}.webp`);
  const full = img.w ?? 1600;
  return [...[480, 960].filter((w) => w < full).map((w) => `${v(w)} ${w}w`), `${img.url} ${full}w`].join(', ');
};

/** The list from the API, without empty entries. */
export const vacancyImages = (v: { images?: VacancyImage[] | null }) => (v.images ?? []).filter((i) => i && i.url);
