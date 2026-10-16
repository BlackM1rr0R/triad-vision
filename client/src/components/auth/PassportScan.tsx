import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import clsx from 'clsx';
import { AlertTriangle, Camera, CheckCircle2, ImageUp, RotateCcw, ScanLine, ShieldCheck, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';

/** Fields POST /api/auth/passport-scan reads from the MRZ. */
export interface PassportScanFields {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  passportNumber: string;
  nationality: string | null;
  sex: 'M' | 'F' | 'X';
  expiryDate: string | null;
}
export type PassportScanWarning = 'EXPIRED' | 'EXPIRES_SOON' | 'CHECK_DIGIT';

interface ScanResponse {
  ok: true;
  fields: PassportScanFields;
  checks: { valid: boolean };
  warnings: PassportScanWarning[];
}

/** Long edge of the photo sent to the server: enough for the MRZ, small enough to upload fast. */
const MAX_EDGE = 2000;
const MAX_BYTES = 8 * 1024 * 1024;
const SERVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type ErrorKey = 'notFound' | 'unavailable' | 'tooMany' | 'badFile' | 'failed';

const decode = async (file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through to <img> (older Safari)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Re-encodes the photo as JPEG 0.9 with the long edge at most 2000 px (this also applies the EXIF
 * rotation and drops the EXIF metadata). Returns the original when the browser cannot decode it.
 */
export const downscaleImage = async (file: File): Promise<Blob> => {
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    const w = Math.max(1, Math.round(decoded.width * scale));
    const h = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(decoded.source, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return blob ?? file;
  } finally {
    decoded.close();
  }
};

const errorKeyOf = (err: unknown): ErrorKey => {
  if (!(err instanceof AxiosError) || !err.response) return 'failed';
  const { status } = err.response;
  if (status === 422 || status === 504) return 'notFound';
  if (status === 503) return 'unavailable';
  if (status === 429) return 'tooMany';
  if (status === 400 || status === 413) return 'badFile';
  return 'failed';
};

/** "2027-03-01" → "01.03.2027" */
const dmy = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : '');

/**
 * Registration helper card: the candidate photographs (or picks) the passport photo page, the MRZ is
 * read on the server and `onFilled` receives the fields. The photo only lives in this component's
 * memory (and an object URL for the preview); the server does not keep it either.
 */
export function PassportScan({ onFilled, onCleared }: { onFilled: (fields: PassportScanFields) => void; onCleared?: () => void }) {
  const { t } = useTranslation();
  const uid = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const reset = () => {
    setPreview(null);
    setError(null);
    setResult(null);
    onCleared?.();
  };

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setResult(null);
    if (!file.type.startsWith('image/')) {
      setError('badFile');
      return;
    }
    setBusy(true);
    try {
      const image = await downscaleImage(file);
      if (!SERVER_TYPES.includes(image.type) || image.size > MAX_BYTES) {
        setError('badFile');
        return;
      }
      setPreview(URL.createObjectURL(image));
      const form = new FormData();
      form.append('image', image, image.type === 'image/jpeg' ? 'passport.jpg' : file.name || 'passport');
      const { data } = await api.post<ScanResponse>('/auth/passport-scan', form, { timeout: 60_000 });
      setResult(data);
      onFilled(data.fields);
    } catch (err) {
      setError(errorKeyOf(err));
    } finally {
      setBusy(false);
    }
  };

  const status = `${uid}-status`;

  return (
    <section
      aria-labelledby={`${uid}-title`}
      aria-describedby={status}
      aria-busy={busy || undefined}
      className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/60 p-4 sm:p-5 dark:border-brand-500/30"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
          <ScanLine className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id={`${uid}-title`} className="font-display text-base leading-snug font-bold text-ink sm:text-lg">
            {t('registerPage.scan.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('registerPage.scan.text')}</p>
        </div>
      </div>

      {preview && (
        <div className="relative mt-4 overflow-hidden rounded-xl border border-line bg-card">
          <img src={preview} alt={t('registerPage.scan.previewAlt')} className={clsx('max-h-56 w-full object-contain', busy && 'opacity-60')} />
          {busy && (
            <div className="absolute inset-0 grid place-items-center">
              <span className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-semibold text-ink shadow">
                <Spinner className="size-4" /> {t('registerPage.scan.reading')}
              </span>
            </div>
          )}
          {!busy && (
            <button
              type="button"
              onClick={reset}
              aria-label={t('registerPage.scan.remove')}
              className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-card text-muted shadow transition hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="btn-primary h-11" disabled={busy} onClick={() => cameraRef.current?.click()}>
          {busy && !preview ? <Spinner className="size-4" /> : result || error ? <RotateCcw className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
          {result || error ? t('registerPage.scan.retake') : t('registerPage.scan.takePhoto')}
        </button>
        <button type="button" className="btn-ghost h-11 border border-line bg-card" disabled={busy} onClick={() => fileRef.current?.click()}>
          <ImageUp className="size-4" aria-hidden /> {t('registerPage.scan.chooseFile')}
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />

      <div id={status} aria-live="polite" className="mt-3 space-y-2 text-sm">
        {busy && !preview && <p className="text-muted">{t('registerPage.scan.reading')}</p>}
        {result && (
          <p className="flex items-start gap-2 text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{t('registerPage.scan.done')}</span>
          </p>
        )}
        {result?.warnings.map((w) => (
          <p
            key={w}
            className={clsx(
              'flex items-start gap-2 rounded-lg border px-3 py-2',
              w === 'EXPIRED' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-warning/30 bg-warning/10 text-ink',
            )}
          >
            <AlertTriangle className={clsx('mt-0.5 size-4 shrink-0', w === 'EXPIRED' ? 'text-danger' : 'text-warning')} aria-hidden />
            <span>{t(`registerPage.scan.warn.${w}`, { date: dmy(result.fields.expiryDate) })}</span>
          </p>
        ))}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              {t(`registerPage.scan.errors.${error}`)}
              {error === 'notFound' && <> {t('registerPage.scan.tips')}</>}
            </span>
          </div>
        )}
      </div>

      <p className="mt-3 flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>{t('registerPage.scan.privacy')}</span>
      </p>
    </section>
  );
}
