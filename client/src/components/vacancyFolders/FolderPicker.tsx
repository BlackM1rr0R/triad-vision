import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ChevronRight, ExternalLink, Folder, FolderOpen, FolderPlus, HardDrive } from 'lucide-react';
import i18n, { registerCopy } from '@/i18n';
import { api, errorCode } from '@/lib/api';
import { vacancyFolders } from '@/i18n/vacancyFolders';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { driveKeys, fetchChildren, fetchRoots } from '@/components/drive/api';
import { can, type DriveItem } from '@/components/drive/types';

registerCopy(vacancyFolders);

/** A drive folder as the server describes it for vacancies, applications and cases. */
export interface FolderInfo {
  id: string;
  name: string;
  /** "Gemeinsame Dokumente / Stellenangebote / …" */
  path: string;
}

export const driveFolderHref = (id: string) => `/workspace/drive/f/${encodeURIComponent(id)}`;

/** Error text for a server code (folder picker / vacancy folder actions). */
export const folderErrorText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`vacFolders.errors.${code}`) ? String(i18n.t(`vacFolders.errors.${code}`)) : String(i18n.t('vacFolders.errors.generic'));
};
export const toastFolderError = (err: unknown) => toast.error(folderErrorText(err));

/**
 * Browse the team drive and pick a folder the user may write to; a new folder can be created right where the
 * user is (the drive's own "new folder" endpoint). Staff only, like the drive.
 */
export const FolderPickerModal = ({ open, onClose, onPick, title }: { open: boolean; onClose: () => void; onPick: (f: FolderInfo) => void; title?: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [at, setAt] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setAt(null);
      setNewName(null);
    }
  }, [open]);
  const roots = useQuery({ queryKey: driveKeys.roots, queryFn: fetchRoots, enabled: open, staleTime: 30_000 });
  const q = useQuery({ queryKey: driveKeys.children(at ?? '', 'FOLDER'), queryFn: () => fetchChildren(at!, 'FOLDER'), enabled: open && !!at });
  const top = roots.data?.shared ? [roots.data.shared] : [];
  const folder = q.data?.folder;
  const writable = !!folder && can(folder.myAccess, 'EDIT');
  const children = (q.data?.items ?? []).filter((i: DriveItem) => i.kind === 'FOLDER');
  const pathOf = () => (q.data ? [...q.data.path.map((c) => c.name)].join(' / ') : '');

  const create = async () => {
    if (!at || !newName?.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ item: DriveItem }>(`/drive/nodes/${encodeURIComponent(at)}/folders`, { name: newName.trim() });
      await qc.invalidateQueries({ queryKey: driveKeys.children(at, 'FOLDER') });
      setNewName(null);
      setAt(res.data.item.id);
    } catch (err) {
      toastFolderError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="md"
      zIndex={95}
      title={title ?? t('vacFolders.picker.title')}
      description={t('vacFolders.picker.pickHint')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            {t('vacFolders.picker.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={!writable || busy}
            onClick={() => folder && onPick({ id: folder.id, name: folder.name, path: pathOf() || folder.name })}
          >
            {t('vacFolders.picker.chooseHere')}
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => setAt(null)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-link hover:bg-primary/[0.06]">
          <HardDrive className="size-3.5" aria-hidden /> {t('vacFolders.picker.top')}
        </button>
        {at &&
          q.data?.path.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted" aria-hidden />
              <button type="button" onClick={() => setAt(c.id)} className="rounded-md px-1.5 py-0.5 font-medium text-ink hover:bg-sunken">
                {c.name}
              </button>
            </span>
          ))}
      </div>
      <ul className="max-h-72 min-h-40 overflow-y-auto rounded-xl border border-line">
        {!at ? (
          roots.isLoading ? (
            <li className="grid place-items-center py-8">
              <Spinner />
            </li>
          ) : (
            top.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setAt(r.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-sunken">
                  <HardDrive className="size-5 text-link" aria-hidden />
                  <span className="truncate font-medium text-ink">{r.name}</span>
                  <ChevronRight className="ml-auto size-4 text-muted" aria-hidden />
                </button>
              </li>
            ))
          )
        ) : q.isLoading ? (
          <li className="grid place-items-center py-8">
            <Spinner />
          </li>
        ) : children.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-muted">{t('vacFolders.picker.empty')}</li>
        ) : (
          children.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setAt(f.id)} className={clsx('flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-sunken', !can(f.myAccess, 'EDIT') && 'opacity-60')}>
                <Folder className="size-5 text-link" aria-hidden />
                <span className="truncate font-medium text-ink">{f.name}</span>
                <ChevronRight className="ml-auto size-4 text-muted" aria-hidden />
              </button>
            </li>
          ))
        )}
      </ul>
      {at && folder && !writable && <p className="mt-2 text-xs text-warning-fg">{t('vacFolders.picker.noEdit')}</p>}
      {at && writable && (
        <div className="mt-3">
          {newName === null ? (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setNewName('')}>
              <FolderPlus className="size-3.5" aria-hidden /> {t('vacFolders.picker.newFolder')}
            </button>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <label className="label" htmlFor="vf-new-name">
                  {t('vacFolders.picker.newName')}
                </label>
                <input
                  id="vf-new-name"
                  className="input"
                  maxLength={200}
                  value={newName}
                  autoFocus
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void create();
                    }
                  }}
                />
              </div>
              <button type="button" className="btn-primary btn-sm" disabled={busy || !newName.trim()} onClick={() => void create()}>
                {busy && <Spinner className="size-3.5" />} {t('vacFolders.picker.create')}
              </button>
              <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => setNewName(null)}>
                {t('vacFolders.picker.cancel')}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

/** The folder (name, path, "open in drive") or a placeholder, with the actions next to it. */
export const FolderLine = ({ folder, empty, children, compact }: { folder: FolderInfo | null; empty?: ReactNode; children?: ReactNode; compact?: boolean }) => {
  const { t } = useTranslation();
  return (
    <div className={clsx('flex flex-wrap items-center gap-2', compact ? 'text-xs' : 'text-sm')}>
      {folder ? (
        <Link to={driveFolderHref(folder.id)} className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-link hover:underline" title={folder.path}>
          <FolderOpen className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{folder.name}</span>
          <ExternalLink className="size-3 shrink-0" aria-hidden />
          <span className="sr-only">{t('vacFolders.open')}</span>
        </Link>
      ) : (
        <span className="text-muted">{empty ?? t('vacFolders.none')}</span>
      )}
      {children}
      {folder && !compact && <span className="w-full truncate text-xs text-muted">{folder.path}</span>}
    </div>
  );
};

/** FolderLine + "choose" (picker) + optional "clear": for a value edited in a form or saved right away. */
export const FolderField = ({
  value,
  onChange,
  clearLabel,
  empty,
  busy,
  compact,
  extra,
}: {
  value: FolderInfo | null;
  onChange: (f: FolderInfo | null) => void;
  clearLabel?: string;
  empty?: ReactNode;
  busy?: boolean;
  compact?: boolean;
  extra?: ReactNode;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <FolderLine folder={value} empty={empty} compact={compact}>
        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => setOpen(true)}>
          <Folder className="size-3.5" aria-hidden /> {value ? t('vacFolders.change') : t('vacFolders.choose')}
        </button>
        {value && clearLabel && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => onChange(null)}>
            {clearLabel}
          </button>
        )}
        {extra}
        {busy && <Spinner className="size-3.5 text-link" />}
      </FolderLine>
      <FolderPickerModal
        open={open}
        onClose={() => setOpen(false)}
        onPick={(f) => {
          setOpen(false);
          onChange(f);
        }}
      />
    </>
  );
};
