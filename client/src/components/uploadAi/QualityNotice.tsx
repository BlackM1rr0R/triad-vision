import { useRef } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Camera, X, XCircle } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesUploadAi } from '@/i18n/pagesUploadAi';
import type { Quality } from './api';

registerCopy(pagesUploadAi);

/**
 * Instant scan-quality feedback right after a client upload (the server measured blur, darkness, glare,
 * cut-off edges … while storing the file). BAD: "please retake" with the photo tips and a one-click
 * "Choose another file"; WARN: a softer hint. The uploaded file stays (marked for staff).
 */
export const QualityNotice = ({
  quality,
  onRetake,
  onDismiss,
  accept,
  className,
}: {
  quality: Quality | null;
  onRetake?: (file: File) => void;
  onDismiss?: () => void;
  accept?: string;
  className?: string;
}) => {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  if (!quality || quality.level === 'OK' || !quality.reasons.length) return null;
  const bad = quality.level === 'BAD';
  const Icon = bad ? XCircle : AlertTriangle;
  const reasons = [...new Set(quality.reasons.map((r) => r.code))];
  return (
    <div
      role="status"
      className={clsx(
        'rounded-lg border px-3 py-2.5 text-sm',
        bad ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t(bad ? 'uploadAi.quality.titleBAD' : 'uploadAi.quality.titleWARN')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
            {reasons.map((c) => (
              <li key={c}>{t(`uploadAi.quality.reasons.${c}`, { defaultValue: c })}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs opacity-90">{t('uploadAi.quality.tips')}</p>
          {bad && <p className="mt-1 text-xs opacity-75">{t('uploadAi.quality.kept')}</p>}
          {onRetake && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                ref={input}
                type="file"
                accept={accept ?? 'application/pdf,image/jpeg,image/png,image/webp'}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) onRetake(f);
                }}
              />
              <button type="button" className="btn-white btn-sm border border-line" onClick={() => input.current?.click()}>
                <Camera className="size-4" aria-hidden />
                {t('uploadAi.quality.retake')}
              </button>
            </div>
          )}
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="grid size-8 shrink-0 place-items-center rounded-md opacity-70 hover:opacity-100" aria-label={t('uploadAi.quality.dismiss')} title={t('uploadAi.quality.dismiss')}>
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
};

export default QualityNotice;
