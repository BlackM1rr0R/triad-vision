import { useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ImageOff, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from './labels';
import { optimizeImage } from '@/lib/imageCompress';
import { registerCopy } from '@/i18n';
import { pagesPublicImages } from '@/i18n/pagesPublicImages';

registerCopy(pagesPublicImages);

/**
 * What the image is for: sets the server preset (POST /admin/upload?purpose=…, server/src/lib/publicImages.ts),
 * the hint, the preview shape and the recommended aspect ratio.
 *  photo  free-form photo (housing, samples, e-book covers)   cover  16:9 card / hero image
 *  logo   1:1, transparency kept, SVG allowed                  avatar 1:1 round portrait
 *  og     social preview 1.91:1, JPEG, never SVG
 */
export type ImageKind = 'photo' | 'cover' | 'logo' | 'avatar' | 'og';

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const RASTER = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const PURPOSE: Record<ImageKind, string> = { photo: 'photo', cover: 'photo', logo: 'logo', avatar: 'avatar', og: 'og' };
const RATIO: Partial<Record<ImageKind, { value: number; label: string }>> = {
  cover: { value: 16 / 9, label: '16:9' },
  logo: { value: 1, label: '1:1' },
  avatar: { value: 1, label: '1:1' },
  og: { value: 1.91, label: '1.91:1' },
};

/** "4:3"-style label of a size (nearest simple ratio, else one decimal). */
const ratioLabel = (w: number, h: number) => {
  for (const [a, b] of [[1, 1], [4, 3], [3, 2], [16, 9], [2, 1], [3, 4], [2, 3], [9, 16]] as const) if (Math.abs(w / h - a / b) < 0.03) return `${a}:${b}`;
  return `${(w / h).toFixed(2)}:1`;
};

/** Client-side check before the upload (the server checks again). Returns an i18n key or null. */
export const checkImageFile = (file: File, kind: ImageKind): string | null => {
  const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (svg) return kind === 'logo' ? null : 'publicImages.svgNotAllowed';
  if (!RASTER.includes(file.type)) return 'publicImages.badType';
  if (file.size > IMAGE_MAX_BYTES) return 'publicImages.tooLarge';
  return null;
};

/**
 * Image URL input with upload (POST /admin/upload), live preview, size / format / aspect hints and an optional alt
 * text input (`onAltChange`: only where the model can store it; `altFallback` shows what the public site uses
 * when it stays empty).
 */
export const ImageField = ({
  label,
  value,
  onChange,
  required = false,
  kind = 'photo',
  alt,
  onAltChange,
  altFallback,
  uploadUrl = '/admin/upload',
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  required?: boolean;
  kind?: ImageKind;
  alt?: string;
  onAltChange?: (alt: string) => void;
  altFallback?: string;
  /** Upload endpoint (same response): '/admin/upload' (CMS, ADMIN) or '/admin/marketing/upload' (landing pages, STAFF). */
  uploadUrl?: string;
}) => {
  const { t } = useTranslation();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [broken, setBroken] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const upload = async (file: File) => {
    const problem = checkImageFile(file, kind);
    if (problem) {
      toast.error(t(problem));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      // Logos keep their transparency: no client-side JPEG compression (the server re-encodes anyway).
      fd.append('file', kind === 'logo' || file.type === 'image/svg+xml' ? file : await optimizeImage(file));
      const { data } = await api.post<{ url: string; w?: number; h?: number }>(`${uploadUrl}?purpose=${PURPOSE[kind]}`, fd);
      setBroken(false);
      setSize(data.w && data.h ? { w: data.w, h: data.h } : null);
      onChange(data.url);
    } catch (err) {
      toastError(err, t('admin.image.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const expected = RATIO[kind];
  const off = expected && size ? Math.abs(size.w / size.h - expected.value) / expected.value > 0.15 : false;
  const hintId = `${id}-hint`;

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="text-danger-fg"> *</span>}
      </label>
      <div className="flex gap-3">
        <div
          className={clsx(
            'grid shrink-0 place-items-center overflow-hidden border border-line bg-sunken',
            kind === 'avatar' ? 'size-20 rounded-full' : kind === 'cover' || kind === 'og' ? 'h-20 w-32 rounded-lg' : 'size-20 rounded-lg',
          )}
        >
          {value && !broken ? (
            <img
              src={value}
              alt=""
              className={clsx('size-full', kind === 'logo' ? 'object-contain p-1' : 'object-cover')}
              onError={() => setBroken(true)}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) setSize({ w: img.naturalWidth, h: img.naturalHeight });
              }}
            />
          ) : (
            <ImageOff className="size-5 text-subtle" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="relative">
            <input
              id={id}
              className="input pr-9"
              value={value}
              placeholder={t('admin.image.placeholder')}
              required={required}
              aria-describedby={hintId}
              onChange={(e) => {
                setBroken(false);
                setSize(null);
                onChange(e.target.value);
              }}
            />
            {value && (
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-danger-fg"
                onClick={() => {
                  setSize(null);
                  onChange('');
                }}
                aria-label={t('admin.image.clear')}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={kind === 'logo' ? [...RASTER, 'image/svg+xml'].join(',') : RASTER.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            aria-label={t('admin.image.upload')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />}
              {t('admin.image.upload')}
            </button>
            {value && size && <span className="text-xs text-muted tabular-nums">{t('publicImages.size', { w: size.w, h: size.h })}</span>}
          </div>
        </div>
      </div>
      <p id={hintId} className="mt-1.5 text-xs text-muted">
        {t(`publicImages.hint.${kind}`)}
      </p>
      {off && expected && size && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-warning-fg" role="status">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {t('publicImages.ratio', { actual: ratioLabel(size.w, size.h), expected: expected.label })}
        </p>
      )}
      {onAltChange && (
        <div className="mt-2">
          <label htmlFor={`${id}-alt`} className="label">
            {t('publicImages.alt')}
          </label>
          <input
            id={`${id}-alt`}
            className="input"
            value={alt ?? ''}
            maxLength={200}
            placeholder={t('publicImages.altPlaceholder')}
            onChange={(e) => onAltChange(e.target.value)}
          />
          {altFallback && !alt?.trim() && <p className="mt-1 text-xs text-muted">{t('publicImages.altFallback', { fallback: altFallback })}</p>}
        </div>
      )}
    </div>
  );
};
