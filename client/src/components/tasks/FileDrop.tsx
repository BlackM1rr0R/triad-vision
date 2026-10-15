import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { File, FileImage, FileSpreadsheet, FileText, UploadCloud, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatBytes } from '@/lib/api';

/** Same limit as the company drive (DRIVE_MAX_FILE_MB on the server). */
export const TASK_FILE_MAX_BYTES = 50 * 1024 * 1024;

export const fileIcon = (mime: string | null | undefined): LucideIcon => {
  if (!mime) return File;
  if (mime.startsWith('image/')) return FileImage;
  if (mime.includes('sheet') || mime.includes('excel') || mime === 'text/csv') return FileSpreadsheet;
  if (mime === 'application/pdf' || mime.includes('word') || mime.startsWith('text/')) return FileText;
  return File;
};

/**
 * Drag & drop area + "Upload from computer" button. `onFiles` receives the chosen files; files over
 * the size limit are reported through `onTooLarge` and left out.
 */
export const FileDrop = ({
  onFiles,
  onTooLarge,
  disabled,
  compact,
  children,
}: {
  onFiles: (files: File[]) => void;
  onTooLarge?: (file: File) => void;
  disabled?: boolean;
  /** One-line button style (task panel) instead of the tall drop area (new-task dialog). */
  compact?: boolean;
  children?: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    if (!list?.length || disabled) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > TASK_FILE_MAX_BYTES) onTooLarge?.(f);
      else ok.push(f);
    }
    if (ok.length) onFiles(ok);
  };

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (disabled || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      setOver(false);
      take(e.dataTransfer.files);
    },
  };

  const picker = (
    <input
      ref={input}
      type="file"
      multiple
      hidden
      onChange={(e) => {
        take(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (compact) {
    return (
      <div {...dropProps} className={clsx('flex flex-wrap items-center gap-2 rounded-xl', over && 'ring-2 ring-brand-400 ring-offset-2 ring-offset-card')}>
        {picker}
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-sm font-semibold text-muted hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
        >
          <UploadCloud className="size-3.5" /> {t('tasks.actions.uploadFile')}
        </button>
        {children}
      </div>
    );
  }

  return (
    <div
      {...dropProps}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      className={clsx(
        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition',
        over ? 'border-brand-500 bg-brand-50' : 'border-line hover:border-brand-400 hover:bg-surface',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      {picker}
      <UploadCloud className={clsx('size-6', over ? 'text-brand-600' : 'text-muted')} aria-hidden />
      <span className="text-sm font-semibold text-ink">{over ? t('tasks.actions.dropHere') : t('tasks.actions.uploadFile')}</span>
      <span className="max-w-md text-xs text-muted">{t('tasks.actions.filesHint')}</span>
    </div>
  );
};

/** Files picked in the new-task dialog, before the task exists. */
export const PendingFiles = ({ files, onRemove, progress }: { files: File[]; onRemove?: (index: number) => void; progress?: Record<number, number> }) => {
  const { t } = useTranslation();
  if (!files.length) return null;
  return (
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {files.map((f, i) => {
        const Icon = fileIcon(f.type);
        const pct = progress?.[i];
        return (
          <li key={`${f.name}-${i}`} className="relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-line bg-card p-2 pr-1">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{f.name}</span>
              <span className="block text-xs text-muted">{pct != null ? `${pct}%` : formatBytes(f.size)}</span>
            </span>
            {onRemove && pct == null && (
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger"
                aria-label={`${t('tasks.actions.removeFile')}: ${f.name}`}
              >
                <X className="size-3.5" />
              </button>
            )}
            {pct != null && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-500 transition-all" style={{ width: `${pct}%` }} aria-hidden />}
          </li>
        );
      })}
    </ul>
  );
};
