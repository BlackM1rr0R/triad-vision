import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, ChevronRight, HardDrive } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { driveKeys, fetchChildren, fetchRoots } from '@/components/drive/api';
import { ItemIcon } from '@/components/drive/fileIcons';
import { can, type DriveItem } from '@/components/drive/types';
import { formatSize, isImageItem, isPdfItem } from './api';

/** Browses the drive and picks files (PDFs and images by default) the user may download. */
export const FilePicker = ({
  open,
  startId,
  multiple = false,
  accept = (i) => isPdfItem(i) || isImageItem(i),
  exclude = [],
  onPick,
  onClose,
}: {
  open: boolean;
  startId?: string | null;
  multiple?: boolean;
  accept?: (i: DriveItem) => boolean;
  exclude?: string[];
  onPick: (items: DriveItem[]) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [at, setAt] = useState<string | null>(startId ?? null);
  const [picked, setPicked] = useState<DriveItem[]>([]);
  useEffect(() => {
    if (open) {
      setAt(startId ?? null);
      setPicked([]);
    }
  }, [open, startId]);
  const roots = useQuery({ queryKey: driveKeys.roots, queryFn: fetchRoots, enabled: open, staleTime: 60_000 });
  const q = useQuery({ queryKey: driveKeys.children(at ?? ''), queryFn: () => fetchChildren(at!), enabled: open && !!at });
  const top = [roots.data?.shared, roots.data?.cases, roots.data?.partners, roots.data?.staff, roots.data?.templates].filter((x): x is DriveItem => !!x);
  const list = (q.data?.items ?? []).filter((i) => !exclude.includes(i.id) && (i.kind === 'FOLDER' || (accept(i) && can(i.myAccess, 'DOWNLOAD'))));
  const toggle = (f: DriveItem) => {
    if (!multiple) {
      onPick([f]);
      return;
    }
    setPicked((p) => (p.some((x) => x.id === f.id) ? p.filter((x) => x.id !== f.id) : [...p, f]));
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('pdfTools.picker.title')}
      description={t('pdfTools.picker.onlyPdfImages')}
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
            {t('pdfTools.common.cancel')}
          </button>
          {multiple && (
            <button type="button" className="btn-primary btn-sm" disabled={!picked.length} onClick={() => onPick(picked)}>
              {t('pdfTools.picker.choose')} {picked.length > 0 && `(${picked.length})`}
            </button>
          )}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => setAt(null)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-brand-600 hover:bg-brand-50">
          <HardDrive className="size-3.5" aria-hidden />
        </button>
        {at &&
          q.data?.path.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted" aria-hidden />
              <button type="button" onClick={() => setAt(c.id)} className="rounded-md px-1.5 py-0.5 font-medium text-ink hover:bg-surface">
                {c.name}
              </button>
            </span>
          ))}
      </div>
      <ul className="max-h-80 min-h-40 overflow-y-auto rounded-xl border border-line">
        {!at ? (
          top.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setAt(r.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface">
                <ItemIcon item={r} className="size-5" />
                <span className="truncate font-medium text-ink">{r.name}</span>
              </button>
            </li>
          ))
        ) : q.isLoading ? (
          <li className="grid place-items-center py-8">
            <Spinner />
          </li>
        ) : list.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-muted">{t('pdfTools.picker.empty')}</li>
        ) : (
          list.map((f) => {
            const on = picked.some((p) => p.id === f.id);
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => (f.kind === 'FOLDER' ? setAt(f.id) : toggle(f))}
                  className={clsx('flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface', on && 'bg-brand-50 dark:bg-brand-500/10')}
                >
                  <ItemIcon item={f} className="size-5" />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{f.name}</span>
                  {f.kind === 'FILE' && f.size != null && <span className="text-xs text-muted">{formatSize(f.size)}</span>}
                  {f.kind === 'FOLDER' ? <ChevronRight className="size-4 text-muted" aria-hidden /> : on ? <Check className="size-4 text-brand-600" aria-hidden /> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </Modal>
  );
};

export default FilePicker;
