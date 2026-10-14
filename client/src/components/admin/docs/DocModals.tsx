import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Building2, ChevronRight, CornerLeftUp, Folder, ShieldCheck } from 'lucide-react';
import i18n from '@/i18n';
import { api } from '@/lib/api';
import type { DocAccess, DocCompany, DocDir, DocDirListing, DocFile, DocGrantsResponse, DocStructure } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { docGrantOptions, fmtRelative, fullName, roleLabel, toastError } from '@/components/admin/labels';
import { EmptyState, LoadingBlock } from '@/components/admin/ui';
import { invalidateAllDirs, invalidateDocs } from '@/components/admin/docs/queries';

/** Characters the server rejects in a file or directory name (see docs.ts checkSegment). */
// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/;
export const nameProblem = (name: string) => {
  const n = name.normalize('NFC');
  const msg = (k: string) => String(i18n.t(`admin.docs.name.${k}`));
  if (!n.trim()) return msg('empty');
  if (n.length > 150) return msg('tooLong');
  if (n !== n.trim()) return msg('spaces');
  if (n.startsWith('.') || n.endsWith('.')) return msg('dots');
  if (BAD_CHARS.test(n)) return msg('badChars');
  return null;
};

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i).toLowerCase();
};

export const joinPath = (parent: string, name: string) => (parent ? `${parent}/${name}` : name);
export const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');


// ─── New directory ─────────────────────────────────────────────────────

export const NewDirModal = ({ folderId, path, open, onClose }: { folderId: string; path: string; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  useEffect(() => {
    if (open) setName('');
  }, [open]);
  const problem = name ? nameProblem(name) : null;
  const m = useMutation({
    mutationFn: () => api.post<{ dir: DocDir }>(`/docs/folders/${folderId}/dirs`, { path, name: name.trim() }),
    onSuccess: () => {
      invalidateDocs(qc, folderId, path);
      toast.success(t('admin.docs.dirCreated'));
      onClose();
    },
    onError: (err) => toastError(err),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('admin.docs.newFolder')}
      description={path ? t('admin.docs.location', { path }) : t('admin.docs.locationRoot')}
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
            {t('admin.common.cancel')}
          </button>
          <button type="submit" form="new-dir" className="btn-primary btn-sm" disabled={!name.trim() || !!problem || m.isPending}>
            {m.isPending && <Spinner className="size-3.5" />} {t('admin.common.create')}
          </button>
        </>
      }
    >
      <form
        id="new-dir"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !problem) m.mutate();
        }}
      >
        <label className="label" htmlFor="nd-name">
          {t('admin.docs.dirName')}
        </label>
        <input id="nd-name" className={clsx('input', problem && 'border-danger')} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} />
        {problem && <p className="mt-1 text-[11px] text-danger">{problem}</p>}
      </form>
    </Modal>
  );
};

// ─── Rename (directory or file) ────────────────────────────────────────

export type RenameTarget = { kind: 'dir'; dir: DocDir } | { kind: 'file'; file: DocFile };

export const RenameModal = ({ folderId, target, onClose }: { folderId: string; target: RenameTarget | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const current = target ? (target.kind === 'dir' ? target.dir.name : target.file.name) : '';
  const [name, setName] = useState(current);
  useEffect(() => setName(current), [current, target]);
  const ext = target?.kind === 'file' ? extOf(target.file.name) : '';
  const problem = name ? (nameProblem(name) ?? (ext && extOf(name) !== ext ? t('admin.docs.extChange', { ext }) : null)) : null;

  const m = useMutation({
    mutationFn: async () => {
      if (!target) return;
      if (target.kind === 'dir') {
        await api.patch(`/docs/folders/${folderId}/dirs`, { path: target.dir.path, name: name.trim() });
        invalidateAllDirs(qc, folderId);
      } else {
        await api.patch(`/docs/files/${target.file.id}`, { name: name.trim() });
        invalidateDocs(qc, folderId, target.file.path);
      }
    },
    onSuccess: () => {
      toast.success(t('admin.docs.renamed'));
      onClose();
    },
    onError: (err) => toastError(err),
  });

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      size="sm"
      title={target?.kind === 'dir' ? t('admin.docs.renameDir') : t('admin.docs.renameFile')}
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
            {t('admin.common.cancel')}
          </button>
          <button type="submit" form="rename" className="btn-primary btn-sm" disabled={!name.trim() || !!problem || name.trim() === current || m.isPending}>
            {m.isPending && <Spinner className="size-3.5" />} {t('admin.common.save')}
          </button>
        </>
      }
    >
      <form
        id="rename"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !problem && name.trim() !== current) m.mutate();
        }}
      >
        <label className="label" htmlFor="rn-name">
          {t('admin.docs.newName')}
        </label>
        <input id="rn-name" className={clsx('input', problem && 'border-danger')} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} />
        {problem ? (
          <p className="mt-1 text-[11px] text-danger">{problem}</p>
        ) : (
          ext && <p className="mt-1 text-[11px] text-muted">{t('admin.docs.keepExt', { ext })}</p>
        )}
      </form>
    </Modal>
  );
};

// ─── Directory browser (shared by "move" and "upload target") ──────────

export type CrumbLabel = (segments: string[], index: number) => string;

/** A quick pick shown above the directory list (e.g. a company's documents folder). */
export interface QuickDir {
  label: string;
  path: string;
}

/**
 * Compact breadcrumb + list browser over a workspace's directories. `value` is the directory being
 * viewed (and selected); `crumbLabel` lets callers render fixed folders with friendly names.
 */
export const DirBrowser = ({
  folderId,
  rootLabel,
  value,
  onChange,
  enabled = true,
  crumbLabel,
  quick,
}: {
  folderId: string;
  rootLabel: string;
  value: string;
  onChange: (path: string) => void;
  enabled?: boolean;
  crumbLabel?: CrumbLabel;
  quick?: QuickDir[];
}) => {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['docs-dir', folderId, value],
    queryFn: async () => (await api.get<DocDirListing>(`/docs/folders/${folderId}`, { params: { path: value || undefined } })).data,
    enabled,
  });
  const crumbs = value ? value.split('/') : [];
  const labelOf = (i: number) => (crumbLabel ? crumbLabel(crumbs, i) : crumbs[i]);

  return (
    <div>
      {quick && quick.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">{t('admin.docs.companyDocs')}</p>
          <div className="flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q.path}
                type="button"
                aria-pressed={q.path === value}
                className={clsx(
                  'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition',
                  q.path === value ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-ink/75 hover:border-brand-400 hover:text-navy-900',
                )}
                onClick={() => onChange(q.path)}
              >
                <Building2 className="size-3.5" aria-hidden /> {q.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs" aria-label={t('admin.docs.targetDir')}>
        <button type="button" className={clsx('rounded px-1.5 py-0.5 font-semibold hover:bg-surface', !value ? 'text-navy-900' : 'text-brand-600')} onClick={() => onChange('')}>
          {rootLabel}
        </button>
        {crumbs.map((c, i) => {
          const p = crumbs.slice(0, i + 1).join('/');
          return (
            <span key={p} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-muted" aria-hidden />
              <button type="button" className={clsx('rounded px-1.5 py-0.5 font-semibold hover:bg-surface', p === value ? 'text-navy-900' : 'text-brand-600')} onClick={() => onChange(p)} title={c}>
                {labelOf(i)}
              </button>
            </span>
          );
        })}
      </nav>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {value && (
          <li>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink/80 hover:bg-surface" onClick={() => onChange(parentOf(value))}>
              <CornerLeftUp className="size-4 text-muted" aria-hidden /> {t('admin.common.up')}
            </button>
          </li>
        )}
        {isLoading ? (
          <li className="grid place-items-center py-6">
            <Spinner className="size-5 text-brand-600" />
          </li>
        ) : (
          (data?.dirs ?? []).map((d) => {
            const segs = d.path.split('/');
            const label = crumbLabel ? crumbLabel(segs, segs.length - 1) : d.name;
            return (
              <li key={d.path}>
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-900 hover:bg-surface" onClick={() => onChange(d.path)}>
                  <Folder className="size-4 shrink-0 text-amber-500" aria-hidden />
                  <span className="truncate">{label}</span>
                  {label !== d.name && <span className="truncate text-[11px] text-muted">{d.name}</span>}
                  <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted" aria-hidden />
                </button>
              </li>
            );
          })
        )}
        {!isLoading && data && data.dirs.length === 0 && <li className="px-3 py-4 text-center text-xs text-muted">{t('admin.docs.noSubdirs')}</li>}
      </ul>
    </div>
  );
};

// ─── Move files to another directory ───────────────────────────────────

/** Moves `files` (one or many) into a directory chosen in the browser; requests run one after another. */
export const MoveFilesModal = ({
  folderId,
  rootLabel,
  files,
  onClose,
  onMoved,
  crumbLabel,
  quick,
}: {
  folderId: string;
  rootLabel: string;
  /** Files to move; an empty list keeps the modal closed. */
  files: DocFile[];
  onClose: () => void;
  onMoved?: (target: string, moved: number) => void;
  crumbLabel?: CrumbLabel;
  quick?: QuickDir[];
}) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const open = files.length > 0;
  const [target, setTarget] = useState('');
  useEffect(() => {
    if (files.length > 0) setTarget(files[0].path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const m = useMutation({
    mutationFn: async () => {
      let moved = 0;
      let failed: unknown = null;
      for (const f of files) {
        if (f.path === target) continue;
        try {
          await api.patch(`/docs/files/${f.id}`, { path: target });
          moved++;
        } catch (err) {
          failed = err;
        }
      }
      invalidateDocs(qc, folderId, target, ...files.map((f) => f.path));
      return { moved, failed };
    },
    onSuccess: ({ moved, failed }) => {
      if (moved > 0) toast.success(files.length === 1 ? t('admin.docs.fileMoved') : t('admin.docs.movedCount', { count: moved }));
      if (failed) toastError(failed);
      onMoved?.(target, moved);
      onClose();
    },
    onError: (err) => toastError(err),
  });
  const same = open && files.every((f) => f.path === target);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={files.length === 1 ? t('admin.docs.moveFile') : t('admin.docs.moveFiles', { count: files.length })}
      description={files.length === 1 ? files[0].name : files.map((f) => f.name).join(', ')}
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
            {t('admin.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={same || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Spinner className="size-3.5" />} {t('admin.docs.moveHere')}
          </button>
        </>
      }
    >
      <DirBrowser folderId={folderId} rootLabel={rootLabel} value={target} onChange={setTarget} enabled={open} crumbLabel={crumbLabel} quick={quick} />
      {same && <p className="mt-2 text-[11px] text-muted">{t('admin.docs.alreadyHere')}</p>}
    </Modal>
  );
};

// ─── New company (firm) folder ─────────────────────────────────────────

export const NewCompanyModal = ({
  folderId,
  structure,
  open,
  onClose,
  onCreated,
}: {
  folderId: string;
  structure: DocStructure;
  open: boolean;
  onClose: () => void;
  onCreated: (company: DocCompany) => void;
}) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  useEffect(() => {
    if (open) setName('');
  }, [open]);
  const trimmed = name.trim();
  const problem = name ? nameProblem(name) : null;
  const preview = `${structure.rootDir}/${trimmed || t('admin.docs.namePlaceholder')}/${structure.companyDocsDir}`;
  const m = useMutation({
    mutationFn: async () => (await api.post<{ company: DocCompany }>(`/docs/folders/${folderId}/companies`, { name: trimmed })).data.company,
    onSuccess: (company) => {
      invalidateAllDirs(qc, folderId);
      toast.success(t('admin.docs.companyCreated', { name: company.name }));
      onClose();
      onCreated(company);
    },
    onError: (err) => toastError(err),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <Building2 className="size-4 text-brand-600" aria-hidden /> {t('admin.docs.newCompany')}
        </span>
      }
      description={t('admin.docs.newCompanyDesc', { root: structure.rootDir, dir: structure.companyDocsDir })}
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
            {t('admin.common.cancel')}
          </button>
          <button type="submit" form="new-company" className="btn-primary btn-sm" disabled={!trimmed || !!problem || m.isPending}>
            {m.isPending && <Spinner className="size-3.5" />} {t('admin.common.create')}
          </button>
        </>
      }
    >
      <form
        id="new-company"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && !problem) m.mutate();
        }}
      >
        <label className="label" htmlFor="nc-name">
          {t('admin.docs.companyName')}
        </label>
        <input id="nc-name" className={clsx('input', problem && 'border-danger')} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('admin.docs.companyPlaceholder')} autoComplete="off" />
        {problem ? <p className="mt-1 text-[11px] text-danger">{problem}</p> : <p className="mt-1 text-[11px] text-muted">{t('admin.docs.nameRules')}</p>}
        <p className="mt-3 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('admin.docs.pathPreview')}</p>
        <p className="mt-1 rounded-md bg-surface px-2.5 py-1.5 font-mono text-xs break-all text-navy-900">{preview}</p>
      </form>
    </Modal>
  );
};

// ─── Permissions (super admin) ─────────────────────────────────────────

export const GrantsModal = ({ folderId, open, onClose }: { folderId: string; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['docs-grants', folderId],
    queryFn: async () => (await api.get<DocGrantsResponse>(`/docs/folders/${folderId}/grants`)).data,
    enabled: open,
  });
  const m = useMutation({
    mutationFn: ({ userId, access }: { userId: string; access: DocAccess | null }) => api.put(`/docs/folders/${folderId}/grants/${userId}`, { access }),
    onMutate: ({ userId }) => setSaving(userId),
    onSettled: () => setSaving(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['docs-grants', folderId] });
      void qc.invalidateQueries({ queryKey: ['docs-folders'] });
      toast.success(t('admin.docs.grantUpdated'));
    },
    onError: (err) => toastError(err),
  });
  const grantOf = (userId: string) => data?.grants.find((g) => g.user.id === userId);
  const options = docGrantOptions();

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-brand-600" aria-hidden /> {t('admin.docs.permissions')}
        </span>
      }
      description={data ? t('admin.docs.grantsDesc', { owner: fullName(data.folder.owner), slug: data.folder.slug }) : undefined}
      footer={
        <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
          {t('admin.common.close')}
        </button>
      }
    >
      {isLoading || !data ? (
        <LoadingBlock className="min-h-32" />
      ) : data.candidates.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t('admin.docs.noCandidates')} />
      ) : (
        <ul className="divide-y divide-line">
          {data.candidates.map((u) => {
            const g = grantOf(u.id);
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy-900">
                    {fullName(u)} <span className="ml-1 text-[11px] font-normal text-muted">{roleLabel(u.role)}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {u.email}
                    {g && t('admin.docs.updatedAgo', { time: fmtRelative(g.updatedAt) })}
                  </p>
                </div>
                <label className="flex items-center gap-2">
                  <span className="sr-only">{t('admin.docs.grantAria', { name: fullName(u) })}</span>
                  {saving === u.id && <Spinner className="size-3.5 text-brand-600" />}
                  <select
                    className="input min-h-9 w-44 py-1 text-xs"
                    value={g?.access ?? ''}
                    disabled={m.isPending}
                    onChange={(e) => m.mutate({ userId: u.id, access: (e.target.value || null) as DocAccess | null })}
                  >
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
};
