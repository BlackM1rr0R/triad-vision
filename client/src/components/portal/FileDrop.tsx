import { useId, useRef, useState, type DragEvent } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { UploadCloud } from 'lucide-react';

export const MAX_FILE_SIZE = 15 * 1024 * 1024;
const EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx'];
const MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
export const ACCEPT = EXTENSIONS.map((e) => `.${e}`).join(',');

/** Returns an i18n key describing why the file is not acceptable, or null when it is fine. */
export const validateFile = (file: File): string | null => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!EXTENSIONS.includes(ext) || (file.type && !MIME.has(file.type))) return 'portal.docs.badType';
  if (file.size > MAX_FILE_SIZE) return 'portal.docs.tooLarge';
  return null;
};

/**
 * Drag & drop / click-to-choose upload zone with client-side validation and a progress bar.
 * `progress` is 0..1 while uploading, null otherwise.
 */
export const FileDrop = ({
  onFile,
  progress,
  disabled,
  compact,
  label,
}: {
  onFile: (file: File) => void;
  progress: number | null;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [over, setOver] = useState(false);
  const uploading = progress !== null;
  const blocked = disabled || uploading;

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const problem = validateFile(file);
    if (problem) {
      toast.error(t(problem));
      return;
    }
    onFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (!blocked) pick(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!blocked) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={clsx(
        'relative overflow-hidden rounded-xl border-2 border-dashed transition-colors [&:has(input:focus-visible)]:border-brand-600 [&:has(input:focus-visible)]:ring-4 [&:has(input:focus-visible)]:ring-brand-500/20',
        over ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface/60 hover:border-brand-400 hover:bg-brand-50/50',
        blocked && 'pointer-events-none opacity-80',
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={blocked}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      <label
        htmlFor={id}
        className={clsx(
          'flex cursor-pointer items-center gap-3 focus-within:outline-none',
          compact ? 'min-h-14 px-3 py-2.5 sm:px-4' : 'flex-col justify-center px-4 py-6 text-center',
        )}
      >
        <span className={clsx('grid shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600', compact ? 'size-9' : 'size-12')}>
          <UploadCloud className={compact ? 'size-4.5' : 'size-6'} aria-hidden />
        </span>
        <span className={clsx('min-w-0', compact && 'flex-1')}>
          <span className="block text-sm font-semibold text-navy-900">
            {uploading ? `${t('portal.docs.uploading')} ${Math.round((progress ?? 0) * 100)}%` : (label ?? t('portal.docs.upload'))}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{uploading ? '' : t('portal.docs.drop')}</span>
          {!compact && !uploading && <span className="mt-1 block text-[11px] text-muted/80">{t('portal.docs.formats')}</span>}
        </span>
      </label>
      {uploading && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-brand-100" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
          <motion.div className="h-full bg-brand-600" animate={{ width: `${Math.round((progress ?? 0) * 100)}%` }} transition={{ ease: 'easeOut' }} />
        </div>
      )}
    </div>
  );
};

export default FileDrop;
