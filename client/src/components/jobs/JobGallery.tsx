import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { vacancyImageSrcSet } from './images';
import type { VacancyImage } from './types';

/**
 * Photo gallery of a vacancy page: the cover large, the others as thumbnails. Every photo opens an accessible
 * lightbox (Modal: focus trap, Escape, focus return) with previous / next buttons and ← → keys.
 */
export const JobGallery = ({ images, title }: { images: VacancyImage[]; title: string }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(null);
  const total = images.length;
  const go = (d: number) => setOpen((i) => (i === null ? i : (i + d + total) % total));

  useEffect(() => {
    if (open === null || total < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, total]);

  if (!total) return null;
  const altOf = (img: VacancyImage, i: number) => img.alt || `${title} — ${t('jobsArea.detail.galleryPhoto', { n: i + 1, total })}`;
  const current = open !== null ? images[open] : null;

  return (
    <section aria-label={t('jobsArea.detail.gallery')} className="space-y-3">
      <ul className={total > 1 ? 'grid grid-cols-4 gap-2 sm:gap-3' : ''}>
        {images.map((img, i) => (
          <li key={img.url} className={i === 0 ? 'col-span-4' : ''}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group relative block w-full overflow-hidden rounded-2xl bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={t('jobsArea.detail.galleryOpen', { n: i + 1, total })}
            >
              <img
                src={img.url}
                srcSet={vacancyImageSrcSet(img)}
                sizes={i === 0 ? '(min-width: 1024px) 720px, 100vw' : '(min-width: 1024px) 180px, 25vw'}
                width={img.w ?? 1600}
                height={img.h ?? 900}
                alt={altOf(img, i)}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className={`w-full object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none ${i === 0 ? 'aspect-[16/9]' : 'aspect-square'}`}
              />
              {i === 0 && (
                <span className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-card/90 text-ink shadow-[var(--tv-shadow-card)]" aria-hidden>
                  <Expand className="size-4" />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <Modal
        open={current !== null}
        onClose={() => setOpen(null)}
        title={open !== null ? t('jobsArea.detail.galleryPhoto', { n: open + 1, total }) : ''}
        description={total > 1 ? t('jobsArea.detail.galleryHint') : undefined}
        size="2xl"
        mobile="full"
      >
        {current && open !== null && (
          <figure className="space-y-3">
            <div className="relative grid place-items-center rounded-xl bg-sunken">
              <img
                src={current.url}
                srcSet={vacancyImageSrcSet(current)}
                sizes="(min-width: 1152px) 1100px, 100vw"
                width={current.w ?? 1600}
                height={current.h ?? 900}
                alt={altOf(current, open)}
                className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain"
              />
              {total > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    className="absolute top-1/2 left-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-ink shadow-[var(--tv-shadow-card)] hover:bg-card"
                    aria-label={t('jobsArea.detail.galleryPrev')}
                  >
                    <ChevronLeft className="size-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-ink shadow-[var(--tv-shadow-card)] hover:bg-card"
                    aria-label={t('jobsArea.detail.galleryNext')}
                  >
                    <ChevronRight className="size-5" aria-hidden />
                  </button>
                </>
              )}
            </div>
            {current.alt && <figcaption className="text-sm text-muted">{current.alt}</figcaption>}
            <p className="sr-only" aria-live="polite">
              {t('jobsArea.detail.galleryPhoto', { n: open + 1, total })}
            </p>
          </figure>
        )}
      </Modal>
    </section>
  );
};
