import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, Ban, CheckCircle2, ChevronDown, ChevronUp, Loader2, SkipForward, UploadCloud, X } from 'lucide-react';
import { formatBytes } from '@/lib/api';
import type { UploadTask } from './useUploads';

/** Floating upload queue (bottom right): per-file progress, cancel, errors. */
export const UploadPanel = ({
  tasks,
  onCancel,
  onCancelAll,
  onClear,
}: {
  tasks: UploadTask[];
  onCancel: (id: number) => void;
  onCancelAll: () => void;
  onClear: () => void;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  if (tasks.length === 0) return null;
  const active = tasks.filter((x) => x.status === 'queued' || x.status === 'uploading').length;
  const done = tasks.filter((x) => x.status === 'done').length;
  const total = tasks.filter((x) => x.status !== 'cancelled' && x.status !== 'skipped').length;
  return (
    <div className="fixed right-3 bottom-3 z-[70] w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-card shadow-[0_18px_50px_-15px_rgba(11,31,68,0.45)]" role="status" aria-live="polite">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        {active ? <Loader2 className="size-4 animate-spin text-brand-600" /> : <UploadCloud className="size-4 text-brand-600" />}
        <span className="flex-1 truncate text-sm font-semibold text-ink">
          {t('drive.upload.title')} · {t('drive.upload.progress', { done, total })}
        </span>
        {active > 0 ? (
          <button type="button" onClick={onCancelAll} className="rounded-md px-2 py-1 text-xs font-semibold text-muted hover:bg-surface hover:text-danger">
            {t('drive.upload.cancelAll')}
          </button>
        ) : (
          <button type="button" onClick={onClear} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink" aria-label={t('drive.upload.close')}>
            <X className="size-4" />
          </button>
        )}
        <button type="button" onClick={() => setOpen((o) => !o)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink" aria-label={t('drive.upload.title')} aria-expanded={open}>
          {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </div>
      {open && (
        <ul className="max-h-72 overflow-y-auto overscroll-contain py-1">
          {tasks.map((x) => (
            <li key={x.id} className="px-3 py-1.5">
              <div className="flex items-center gap-2 text-xs">
                {x.status === 'done' ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                ) : x.status === 'error' ? (
                  <AlertCircle className="size-4 shrink-0 text-danger" />
                ) : x.status === 'cancelled' ? (
                  <Ban className="size-4 shrink-0 text-muted" />
                ) : x.status === 'skipped' ? (
                  <SkipForward className="size-4 shrink-0 text-muted" />
                ) : (
                  <Loader2 className={clsx('size-4 shrink-0 text-brand-600', x.status === 'uploading' && 'animate-spin')} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink" title={x.relativeDir ? `${x.relativeDir}/${x.file.name}` : x.file.name}>
                    {x.file.name}
                  </span>
                  <span className={clsx('block truncate', x.status === 'error' ? 'text-danger' : 'text-muted')}>
                    {x.status === 'error'
                      ? x.error
                      : x.status === 'uploading'
                        ? `${x.progress}% · ${formatBytes(x.file.size)}`
                        : `${t(`drive.upload.${x.status === 'queued' ? 'waiting' : x.status}`)} · ${formatBytes(x.file.size)}`}
                  </span>
                </span>
                {(x.status === 'queued' || x.status === 'uploading') && (
                  <button type="button" onClick={() => onCancel(x.id)} className="grid size-6 place-items-center rounded-md text-muted hover:bg-surface hover:text-danger" aria-label={t('drive.upload.cancel')}>
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {x.status === 'uploading' && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-brand-600 transition-[width] duration-200" style={{ width: `${x.progress}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
