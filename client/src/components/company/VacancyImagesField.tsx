import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { optimizeImage } from '@/lib/imageCompress';
import { Spinner } from '@/components/ui/Spinner';
import { jobsError } from '@/components/jobs/labels';
import { VACANCY_IMAGE_MAX, vacancyImageSrcSet } from '@/components/jobs/images';
import type { VacancyImage } from '@/components/jobs/types';

/**
 * Cover + gallery editor of a vacancy (admin and employer portal): upload (several at once, up to 8 in all),
 * reorder with buttons (the first image is the cover), alt text per image, remove. Uploads go to
 * `uploadUrl` (POST multipart `file` → { url, w, h }, re-encoded to WebP on the server); the list is saved
 * with the vacancy. Employer images reach the public board only through the vacancy review.
 */
export const VacancyImagesField = ({
  value,
  onChange,
  uploadUrl,
}: {
  value: VacancyImage[];
  onChange: (next: VacancyImage[]) => void;
  uploadUrl: string;
}) => {
  const { t } = useTranslation();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  // Latest list for the sequential upload loop (the prop updates between files).
  const latest = useRef(value);
  latest.current = value;
  const free = VACANCY_IMAGE_MAX - value.length;

  const upload = async (files: File[]) => {
    const take = files.slice(0, Math.max(0, VACANCY_IMAGE_MAX - latest.current.length));
    if (take.length < files.length) toast.error(t('jobsArea.errors.TOO_MANY_IMAGES'));
    for (const file of take) {
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append('file', await optimizeImage(file));
        const { data } = await api.post<{ url: string; w: number; h: number }>(uploadUrl, fd);
        const next = [...latest.current, { url: data.url, w: data.w, h: data.h }];
        latest.current = next;
        onChange(next);
      } catch (err) {
        toast.error(jobsError(err));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  const patch = (i: number, p: Partial<VacancyImage>) => onChange(value.map((img, j) => (j === i ? { ...img, ...p } : img)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <section className="space-y-3" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p id={`${id}-title`} className="text-sm font-bold text-ink">
            {t('jobsArea.form.images')}
          </p>
          <p className="text-xs text-muted">{t('jobsArea.form.imagesHint')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted tabular-nums">{t('jobsArea.form.imagesLimit', { count: value.length })}</span>
          <input
            ref={fileRef}
            id={`${id}-file`}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) void upload(files);
            }}
          />
          <button type="button" className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={free <= 0 || uploading > 0}>
            {uploading > 0 ? <Spinner className="size-3.5" /> : <ImagePlus className="size-3.5" aria-hidden />}
            {uploading > 0 ? t('jobsArea.form.imagesUploading') : t('jobsArea.form.imagesAdd')}
          </button>
        </div>
      </div>

      {value.length > 0 && (
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {value.map((img, i) => (
            <li key={img.url} className="overflow-hidden rounded-xl border border-line bg-card">
              <div className="relative aspect-[4/3] bg-sunken">
                <img
                  src={img.url}
                  srcSet={vacancyImageSrcSet(img)}
                  sizes="(min-width: 1024px) 220px, (min-width: 640px) 45vw, 90vw"
                  alt={img.alt ?? ''}
                  width={img.w}
                  height={img.h}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
                {i === 0 && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-contrast">
                    <Star className="size-3" aria-hidden /> {t('jobsArea.form.imagesCover')}
                  </span>
                )}
              </div>
              <div className="space-y-2 p-2.5">
                <label className="sr-only" htmlFor={`${id}-alt-${i}`}>
                  {t('jobsArea.form.imagesAlt')} ({i + 1})
                </label>
                <input
                  id={`${id}-alt-${i}`}
                  className="input h-9 text-xs"
                  maxLength={200}
                  value={img.alt ?? ''}
                  placeholder={t('jobsArea.form.imagesAltPlaceholder')}
                  onChange={(e) => patch(i, { alt: e.target.value })}
                />
                <div className="flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <button type="button" className="btn-ghost btn-sm px-2" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`${t('jobsArea.form.imagesMoveLeft')} (${i + 1})`} title={t('jobsArea.form.imagesMoveLeft')}>
                      <ArrowLeft className="size-3.5" aria-hidden />
                    </button>
                    <button type="button" className="btn-ghost btn-sm px-2" onClick={() => move(i, i + 1)} disabled={i === value.length - 1} aria-label={`${t('jobsArea.form.imagesMoveRight')} (${i + 1})`} title={t('jobsArea.form.imagesMoveRight')}>
                      <ArrowRight className="size-3.5" aria-hidden />
                    </button>
                    {i > 0 && (
                      <button type="button" className="btn-ghost btn-sm px-2" onClick={() => move(i, 0)} aria-label={`${t('jobsArea.form.imagesMakeCover')} (${i + 1})`} title={t('jobsArea.form.imagesMakeCover')}>
                        <Star className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                  <button type="button" className="btn-ghost btn-sm px-2 text-danger-fg" onClick={() => remove(i)} aria-label={`${t('jobsArea.form.imagesRemove')} (${i + 1})`} title={t('jobsArea.form.imagesRemove')}>
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
