import { useId, useState, type DragEvent } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { UploadCloud } from 'lucide-react';
import { ACCEPT_NO_HEIC, prepareFile } from '@/components/portal/FileDrop';
import { ScanCameraButton } from '@/components/scanner/ScanCameraButton';
import { scanPagesToPdf } from '@/components/scanner/scanPdf';
import { registerCopy } from '@/i18n';
import { pagesPortalExtras } from '@/i18n/pagesPortalExtras';

registerCopy(pagesPortalExtras); // px.scan.*

/**
 * Drag & drop / pick zone for several files at once (same types and size limit as case documents).
 * Invalid files are reported and skipped; `progress` is 0..1 while uploading.
 */
export const MultiFileDrop = ({
  onFiles,
  progress,
  disabled,
  label,
  scan,
}: {
  onFiles: (files: File[]) => void;
  progress?: number | null;
  disabled?: boolean;
  label?: string;
  /** Also offer the camera scanner (multi-page → one PDF), named like this. */
  scan?: string;
}) => {
  const { t } = useTranslation();
  const id = useId();
  const [over, setOver] = useState(false);
  const uploading = progress != null;
  const blocked = disabled || uploading;

  // Images are compressed before the size check (prepareFile); translations take no HEIC.
  const pick = async (list: FileList | null) => {
    const ok: File[] = [];
    for (const f of Array.from(list ?? [])) {
      const { file, problem } = await prepareFile(f, { heic: false });
      if (problem) toast.error(`${f.name}: ${t(problem)}`);
      else ok.push(file);
    }
    if (ok.length) onFiles(ok);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (!blocked) void pick(e.dataTransfer.files);
  };

  return (
    <>
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!blocked) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={clsx(
        'relative overflow-hidden rounded-xl border-2 border-dashed transition-colors [&:has(input:focus-visible)]:border-brand-600 [&:has(input:focus-visible)]:ring-4 [&:has(input:focus-visible)]:ring-brand-500/20',
        over ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface/60 hover:border-brand-400',
        blocked && 'pointer-events-none opacity-80',
      )}
    >
      <input
        id={id}
        type="file"
        multiple
        accept={ACCEPT_NO_HEIC}
        className="sr-only"
        disabled={blocked}
        onChange={(e) => {
          void pick(e.target.files); // Array.from(list) runs before the first await
          e.target.value = '';
        }}
      />
      <label htmlFor={id} className="flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-brand-100 text-brand-600">
          <UploadCloud className="size-6" aria-hidden />
        </span>
        <span className="block text-sm font-semibold text-ink">
          {uploading ? `${t('portal.docs.uploading')} ${Math.round((progress ?? 0) * 100)}%` : (label ?? t('portal.docs.upload'))}
        </span>
        {!uploading && <span className="block text-xs text-muted">{t('portal.docs.drop')}</span>}
      </label>
      {uploading && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-brand-100" role="progressbar" aria-label={t('ui.uploadProgress')} aria-valuenow={Math.round((progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-brand-600 transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
        </div>
      )}
    </div>
    {scan !== undefined && (
      <div className="mt-2">
        <ScanCameraButton
          disabled={blocked}
          title={scan}
          onPages={async (pages) => {
            try {
              onFiles([await scanPagesToPdf(pages, scan)]);
              return true;
            } catch {
              toast.error(t('px.scan.failed'));
              return false;
            }
          }}
        />
      </div>
    )}
    </>
  );
};

export default MultiFileDrop;
