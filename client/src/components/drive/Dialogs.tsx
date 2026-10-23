import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronRight, HardDrive } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { driveKeys, fetchChildren } from './api';
import { ItemIcon } from './fileIcons';
import { crumbLabel, displayName, rootLabel } from './labels';
import { can, type DriveItem, type RootsResponse } from './types';
import type { ConflictChoice } from './useUploads';

/** New folder / rename: one text field, Enter submits; for files the extension stays selected-out. */
export const NameDialog = ({
  open,
  title,
  label,
  initial,
  submitLabel,
  busy,
  isFile,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  initial: string;
  submitLabel: string;
  busy: boolean;
  isFile?: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setValue(initial);
    const id = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const dot = isFile ? initial.lastIndexOf('.') : -1;
      el.setSelectionRange(0, dot > 0 ? dot : initial.length);
    }, 60);
    return () => window.clearTimeout(id);
  }, [open, initial, isFile]);
  const submit = () => {
    const v = value.trim();
    if (v) onSubmit(v);
  };
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      size="sm"
      title={title}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            {t('drive.dialogs.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy || !value.trim()}>
            {busy && <Spinner className="size-3.5" />} {submitLabel}
          </button>
        </>
      }
    >
      <label className="label" htmlFor="drive-name">
        {label}
      </label>
      <input
        id="drive-name"
        ref={ref}
        className="input"
        value={value}
        maxLength={200}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
    </Modal>
  );
};

/** Folder picker for "Move to…" / "Copy to…": browse folders, choose one you can edit. */
export const FolderPicker = ({
  open,
  mode,
  count,
  roots,
  startId,
  exclude,
  myId,
  busy,
  onPick,
  onClose,
}: {
  open: boolean;
  mode: 'move' | 'copy';
  count: number;
  roots: RootsResponse | undefined;
  startId: string | null;
  exclude: string[];
  myId: string;
  busy: boolean;
  onPick: (targetId: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [at, setAt] = useState<string | null>(startId);
  useEffect(() => {
    if (open) setAt(startId);
  }, [open, startId]);
  const q = useQuery({ queryKey: driveKeys.children(at ?? '', 'FOLDER'), queryFn: () => fetchChildren(at!, 'FOLDER'), enabled: open && !!at });
  const top = [roots?.shared, roots?.cases, roots?.partners, roots?.staff, roots?.templates].filter((x): x is DriveItem => !!x);
  const folder = q.data?.folder;
  const usable = !!folder && can(folder.myAccess, 'EDIT') && !exclude.includes(folder.id);
  const children = (q.data?.items ?? []).filter((i) => i.kind === 'FOLDER' && !exclude.includes(i.id));
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      size="md"
      title={t(mode === 'move' ? 'drive.dialogs.moveTitle' : 'drive.dialogs.copyTitle', { count })}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            {t('drive.dialogs.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!usable || busy} onClick={() => folder && onPick(folder.id)}>
            {busy && <Spinner className="size-3.5" />} {t(mode === 'move' ? 'drive.dialogs.moveHere' : 'drive.dialogs.copyHere')}
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => setAt(null)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-brand-600 hover:bg-brand-50">
          <HardDrive className="size-3.5" /> {t('drive.dialogs.pickFolder')}
        </button>
        {at &&
          q.data?.path.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted" />
              <button type="button" onClick={() => setAt(c.id)} className="rounded-md px-1.5 py-0.5 font-medium text-ink hover:bg-surface">
                {crumbLabel(c, t, myId)}
              </button>
            </span>
          ))}
      </div>
      <ul className="max-h-80 min-h-40 overflow-y-auto rounded-xl border border-line">
        {!at
          ? top.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setAt(r.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface">
                  <ItemIcon item={r} className="size-5" />
                  <span className="truncate font-medium text-ink">{rootLabel(r, t, myId)}</span>
                </button>
              </li>
            ))
          : q.isLoading
            ? (
              <li className="grid place-items-center py-8">
                <Spinner />
              </li>
            )
            : children.length === 0
              ? <li className="px-3 py-6 text-center text-xs text-muted">{t('drive.dialogs.noSubfolders')}</li>
              : children.map((f) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => setAt(f.id)} className={clsx('flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface', !can(f.myAccess, 'EDIT') && 'opacity-60')}>
                      <ItemIcon item={f} className="size-5" />
                      <span className="truncate font-medium text-ink">{displayName(f, t, myId)}</span>
                      <ChevronRight className="ml-auto size-4 text-muted" />
                    </button>
                  </li>
                ))}
      </ul>
    </Modal>
  );
};

/** Asked when an uploaded file name already exists in the target folder. */
export const ConflictDialog = ({ name, onAnswer }: { name: string | null; onAnswer: (choice: ConflictChoice, all: boolean) => void }) => {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [name]);
  return (
    <Modal
      open={!!name}
      onClose={() => onAnswer('skip', false)}
      size="sm"
      title={t('drive.upload.conflictTitle', { name: name ?? '' })}
      description={t('drive.upload.conflictBody')}
    >
      <div className="space-y-2">
        <button type="button" data-autofocus className="btn-primary btn-sm w-full" onClick={() => onAnswer('replace', all)}>
          {t('drive.upload.replace')}
        </button>
        <button type="button" className="btn-white btn-sm w-full border border-line" onClick={() => onAnswer('rename', all)}>
          {t('drive.upload.keepBoth')}
        </button>
        <button type="button" className="btn-white btn-sm w-full border border-line" onClick={() => onAnswer('skip', all)}>
          {t('drive.upload.skip')}
        </button>
        <label className="flex items-center gap-2 pt-2 text-xs text-muted">
          <input type="checkbox" className="size-4 accent-brand-600" checked={all} onChange={(e) => setAll(e.target.checked)} />
          {t('drive.upload.applyAll')}
        </label>
      </div>
    </Modal>
  );
};

/** Full-size image preview (same-origin <img>, allowed by the site CSP). */
export const ImagePreview = ({ item, src, onClose }: { item: DriveItem | null; src: string; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <Modal open={!!item} onClose={onClose} size="lg" title={item?.name ?? t('drive.dialogs.previewTitle')}>
      {item && <img src={src} alt={item.name} className="mx-auto max-h-[70dvh] rounded-lg object-contain" />}
    </Modal>
  );
};
