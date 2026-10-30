import { useId, useRef, useState, type DragEvent } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { UploadCloud } from 'lucide-react';
import { optimizeImage } from '@/lib/imageCompress';

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
const EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx'];
/** iPhone photos: client document uploads (case documents, vault) take them; the server stores a JPEG. */
const HEIC_EXTENSIONS = ['heic', 'heif'];
const MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const HEIC_MIME = new Set(['image/heic', 'image/heif']);
/** Types without HEIC (uploads whose server side does not convert it, e.g. translations). */
export const ACCEPT_NO_HEIC = EXTENSIONS.map((e) => `.${e}`).join(',');
/** Client document uploads: the case-document types plus HEIC/HEIF. */
export const ACCEPT = [...EXTENSIONS, ...HEIC_EXTENSIONS].map((e) => `.${e}`).join(',');

export interface ValidateOptions {
  /** Accept HEIC/HEIF (default true: client document uploads convert them on the server). */
  heic?: boolean;
}

/** i18n key when the type is not acceptable, else null (the size is checked after compression: prepareFile). */
export const validateType = (file: File, opts: ValidateOptions = {}): string | null => {
  const heic = opts.heic ?? true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const extOk = EXTENSIONS.includes(ext) || (heic && HEIC_EXTENSIONS.includes(ext));
  // Phones often send HEIC as octet-stream / an empty type: the extension decides then.
  const typeOk = !file.type || file.type === 'application/octet-stream' || MIME.has(file.type) || (heic && HEIC_MIME.has(file.type));
  return extOk && typeOk ? null : 'portal.docs.badType';
};

/** Returns an i18n key describing why the file is not acceptable, or null when it is fine (type and size as is). */
export const validateFile = (file: File, opts: ValidateOptions = {}): string | null =>
  validateType(file, opts) ?? (file.size > MAX_FILE_SIZE ? 'portal.docs.tooLarge' : null);

/**
 * Type check, then images are compressed in the browser (a 9 MB phone photo becomes ~1 MB) and only then the
 * 5 MB limit applies — a big photo is not refused for a size it will not have. Other files keep the limit as is.
 */
export const prepareFile = async (file: File, opts: ValidateOptions = {}): Promise<{ file: File; problem: string | null }> => {
  const typeProblem = validateType(file, opts);
  if (typeProblem) return { file, problem: typeProblem };
  const out = file.type.startsWith('image/') ? await optimizeImage(file) : file;
  return { file: out, problem: out.size > MAX_FILE_SIZE ? 'portal.docs.tooLarge' : null };
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
  const [preparing, setPreparing] = useState(false);
  const uploading = progress !== null;
  const blocked = disabled || uploading || preparing;

  const pick = async (files: FileList | null) => {
    const picked = files?.[0];
    if (!picked) return;
    setPreparing(true);
    try {
      // onFile gets the already compressed image (callers must not compress again).
      const { file, problem } = await prepareFile(picked);
      if (problem) {
        toast.error(t(problem));
        return;
      }
      onFile(file);
    } finally {
      setPreparing(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (!blocked) void pick(e.dataTransfer.files);
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
        'relative overflow-hidden rounded-2xl border-2 border-dashed transition-colors [&:has(input:focus-visible)]:border-primary [&:has(input:focus-visible)]:ring-4 [&:has(input:focus-visible)]:ring-focus/30',
        over ? 'border-primary bg-highlight-bg' : 'border-line-strong bg-sunken hover:border-primary hover:bg-highlight-bg/60',
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
          void pick(e.target.files); // reads the File before its first await
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
        <span className={clsx('grid shrink-0 place-items-center rounded-full chip-sky', compact ? 'size-9' : 'size-12')}>
          <UploadCloud className={compact ? 'size-4.5' : 'size-6'} aria-hidden />
        </span>
        <span className={clsx('min-w-0', compact && 'flex-1')}>
          <span className="block text-sm font-semibold text-ink">
            {uploading ? `${t('portal.docs.uploading')} ${Math.round((progress ?? 0) * 100)}%` : (label ?? t('portal.docs.upload'))}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{uploading ? '' : t('portal.docs.drop')}</span>
          {!compact && !uploading && <span className="mt-1 block text-[11px] text-muted">{t('portal.docs.formats')}</span>}
        </span>
      </label>
      {uploading && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-sunken" role="progressbar" aria-label={t('ui.uploadProgress')} aria-valuenow={Math.round((progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
          <motion.div className="h-full bg-primary" animate={{ width: `${Math.round((progress ?? 0) * 100)}%` }} transition={{ ease: 'easeOut' }} />
        </div>
      )}
    </div>
  );
};

export default FileDrop;
