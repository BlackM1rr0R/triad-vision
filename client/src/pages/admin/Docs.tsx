import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  Archive,
  Building2,
  CheckSquare,
  ChevronRight,
  Download,
  Eye,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderTree,
  LayoutGrid,
  List,
  ListChecks,
  Pencil,
  Plus,
  ScrollText,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { api, docExportUrl, docFileUrl, errorCode, formatBytes } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { docAllows, hasMinRole, type DocDir, type DocDirListing, type DocFile, type DocFolderSummary, type DocFoldersResponse, type DocStructure } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Drawer } from '@/components/admin/Drawer';
import { DOC_ACCESS_TONE, docAccessLabel, fmtRelative, fullName, toastError } from '@/components/admin/labels';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { GrantsModal, MoveFilesModal, NewCompanyModal, NewDirModal, RenameModal, parentOf, type CrumbLabel, type QuickDir, type RenameTarget } from '@/components/admin/docs/DocModals';
import { ACCEPT_ATTR, MAX_UPLOAD_BYTES, useUpload, type UploadItem } from '@/components/admin/docs/useUpload';
import { ContextMenu, type MenuEntry, type MenuPosition } from '@/components/admin/docs/ContextMenu';
import { DocTree, WorkspacePicker } from '@/components/admin/docs/DocTree';
import { DocGrid, DocList, type ExplorerItem, type ItemAction, type SelectModifiers } from '@/components/admin/docs/DocGrid';
import { ancestorsOf, useDocTree, type TreeNode } from '@/components/admin/docs/useDocTree';
import { useDropTarget } from '@/components/admin/docs/useDocDnD';
import { docsKeys, invalidateDocs } from '@/components/admin/docs/queries';

/** Used until `/docs/folders` answers (or when an older server omits `structure`). */
const DEFAULT_STRUCTURE: DocStructure = { rootDir: 'senedleri', companyDocsDir: 'senedler', maxFileBytes: MAX_UPLOAD_BYTES };

type View = 'grid' | 'list';
type Target = RenameTarget;

const storageKey = (folderId: string) => `tv.docs.tree.${folderId}`;

/** Triggers browser downloads one after another (several at once get blocked). */
const downloadFiles = (files: DocFile[]) => {
  files.forEach((f, i) => {
    window.setTimeout(() => {
      const a = document.createElement('a');
      a.href = docFileUrl(f.id, true);
      a.download = f.name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 400);
  });
};

// ─── Upload progress ───────────────────────────────────────────────────

const UploadList = ({ items, busy, target, onClear }: { items: UploadItem[]; busy: boolean; target: string; onClear: () => void }) => {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  const stateLabel = (it: UploadItem) =>
    it.status === 'uploading' ? `${it.progress}%` : t(`admin.docs.st.${it.status === 'done' ? 'done' : it.status === 'error' ? 'error' : it.status === 'skipped' ? 'skipped' : 'queued'}`);
  return (
    <div className="mb-3 rounded-xl border border-line bg-white" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <p className="min-w-0 truncate text-xs font-semibold text-navy-900">
          {busy ? t('admin.docs.uploadProgress', { done: items.filter((x) => x.status === 'done').length, total: items.length }) : t('admin.docs.uploadDone')}
          <span className="ml-1.5 font-normal text-muted">→ {target}</span>
        </p>
        {!busy && (
          <button type="button" className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-muted hover:bg-surface hover:text-navy-900" onClick={onClear}>
            <X className="size-3.5" /> {t('admin.docs.clear')}
          </button>
        )}
      </div>
      <ul className="max-h-48 divide-y divide-line overflow-y-auto">
        {items.map((it) => (
          <li key={it.id} className="px-4 py-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate font-medium text-navy-900">{it.file.name}</span>
              <span className={clsx('shrink-0 tabular-nums', it.status === 'error' ? 'text-danger' : it.status === 'done' ? 'text-success' : 'text-muted')}>{stateLabel(it)}</span>
            </div>
            {(it.status === 'uploading' || it.status === 'queued') && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${it.progress}%` }} />
              </div>
            )}
            {it.error && <p className="mt-0.5 text-[11px] text-muted">{it.error}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

export default function Docs() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const isSuper = hasMinRole(me?.role, 'SUPER_ADMIN');
  const [params, setParams] = useSearchParams();
  const fileInput = useRef<HTMLInputElement>(null);
  /** Directory the next file-chooser pick goes to (context menu "upload here"); null = current directory. */
  const uploadTargetRef = useRef<string | null>(null);

  const fixedLabel = t('admin.docs.fixed');
  const fixedHint = t('admin.docs.fixedHint');
  const folderLabel = useCallback((f: DocFolderSummary) => (f.owner.id === me?.id ? t('admin.docs.own') : fullName(f.owner)), [me?.id, t]);

  // ─── Workspaces ───
  const foldersQ = useQuery({
    queryKey: docsKeys.folders,
    queryFn: async () => (await api.get<DocFoldersResponse>('/docs/folders')).data,
  });
  const structure = foldersQ.data?.structure ?? DEFAULT_STRUCTURE;
  const folders = useMemo(() => {
    const list = foldersQ.data?.folders ?? [];
    const own = list.filter((f) => f.owner.id === me?.id);
    const rest = list.filter((f) => f.owner.id !== me?.id).sort((a, b) => fullName(a.owner).localeCompare(fullName(b.owner)));
    return [...own, ...rest];
  }, [foldersQ.data, me?.id]);

  const folderParam = params.get('folder');
  const folderId = folderParam && folders.some((f) => f.id === folderParam) ? folderParam : (folders[0]?.id ?? null);
  const folder = folders.find((f) => f.id === folderId) ?? null;
  const path = (params.get('path') ?? '').replace(/^\/+|\/+$/g, '');
  const view: View = params.get('view') === 'list' ? 'list' : 'grid';

  const go = useCallback(
    (next: { folder?: string; path?: string; view?: View }) => {
      const p = new URLSearchParams(params);
      const fid = next.folder ?? folderId;
      if (fid) p.set('folder', fid);
      else p.delete('folder');
      const np = next.path ?? (next.folder && next.folder !== folderId ? '' : path);
      if (np) p.set('path', np);
      else p.delete('path');
      const nv = next.view ?? view;
      if (nv === 'list') p.set('view', 'list');
      else p.delete('view');
      setParams(p);
    },
    [params, setParams, folderId, path, view],
  );
  // Toast actions fire long after the render that created them; always navigate with the latest `go`.
  const goRef = useRef(go);
  goRef.current = go;

  // ─── Tree + current directory ───
  const { query: treeQ, model } = useDocTree(folderId, structure, fixedLabel);
  const dirQ = useQuery({
    queryKey: docsKeys.dir(folderId ?? '', path),
    queryFn: async () => (await api.get<DocDirListing>(`/docs/folders/${folderId}`, { params: { path: path || undefined } })).data,
    enabled: !!folderId,
  });
  const listing = dirQ.data;
  const access = model?.access ?? listing?.access ?? folder?.access ?? null;
  const canEdit = docAllows(access, 'EDIT');
  const canDownload = docAllows(access, 'DOWNLOAD');
  const slug = folder?.slug ?? model?.slug ?? '';
  const rootLabel = slug ? `/docs/${slug}` : t('admin.nav.docs');
  const dirNotFound = dirQ.error && errorCode(dirQ.error) === 'DIR_NOT_FOUND';
  const inRootDir = path === structure.rootDir;
  const maxMb = Math.round(structure.maxFileBytes / 1024 / 1024);

  // ─── Fixed-structure helpers ───
  const crumbLabel = useCallback<CrumbLabel>(
    (segs, i) => {
      const seg = segs[i];
      if (segs[0] !== structure.rootDir) return seg;
      if (i === 0) return fixedLabel;
      if (i === 2 && seg === structure.companyDocsDir) return fixedLabel;
      return seg;
    },
    [structure, fixedLabel],
  );
  const pathLabel = useCallback(
    (p: string) => {
      if (!p) return rootLabel;
      const segs = p.split('/');
      return `${rootLabel} › ${segs.map((_, i) => crumbLabel(segs, i)).join(' › ')}`;
    },
    [rootLabel, crumbLabel],
  );
  const quickDirs = useMemo<QuickDir[]>(
    () => (model?.companies ?? []).map((c) => ({ label: `${c.name} → ${structure.companyDocsDir}`, path: `${c.path}/${structure.companyDocsDir}` })),
    [model, structure.companyDocsDir],
  );

  // ─── Expanded tree nodes (per workspace, remembered in localStorage) ───
  const [exp, setExp] = useState<{ id: string | null; set: Set<string> }>({ id: null, set: new Set(['']) });
  useEffect(() => {
    if (!folderId) return;
    let saved: string[] | null = null;
    try {
      const raw = localStorage.getItem(storageKey(folderId));
      saved = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      saved = null;
    }
    setExp({ id: folderId, set: new Set(Array.isArray(saved) ? saved : ['', structure.rootDir]) });
  }, [folderId, structure.rootDir]);
  useEffect(() => {
    // Reveal the directory being browsed.
    setExp((prev) => {
      if (prev.id !== folderId) return prev;
      const anc = ancestorsOf(path);
      if (anc.every((a) => prev.set.has(a))) return prev;
      return { ...prev, set: new Set([...prev.set, ...anc]) };
    });
  }, [path, folderId]);
  useEffect(() => {
    if (!folderId || exp.id !== folderId) return;
    try {
      localStorage.setItem(storageKey(folderId), JSON.stringify([...exp.set]));
    } catch {
      /* private mode / quota: forget the state */
    }
  }, [exp, folderId]);
  const expanded = exp.set;
  const setExpandedNode = useCallback((p: string, open: boolean) => {
    setExp((prev) => {
      const set = new Set(prev.set);
      if (open) set.add(p);
      else set.delete(p);
      return { ...prev, set };
    });
  }, []);
  const toggleNode = useCallback((p: string) => setExpandedNode(p, !expanded.has(p)), [expanded, setExpandedNode]);

  // ─── Upload (into the selected directory, or where a drop / "upload here" says) ───
  const [replaceAsk, setReplaceAsk] = useState<{ name: string; resolve: (yes: boolean) => void } | null>(null);
  const askReplace = useCallback((name: string) => new Promise<boolean>((resolve) => setReplaceAsk({ name, resolve })), []);
  const answerReplace = (yes: boolean) => {
    replaceAsk?.resolve(yes);
    setReplaceAsk(null);
  };
  const upload = useUpload(folderId, path, askReplace);
  const [uploadTarget, setUploadTarget] = useState(path);
  const runUpload = useCallback(
    async (files: File[], target: string) => {
      if (!canEdit) return;
      setUploadTarget(target);
      const res = await upload.enqueue(files, target);
      if (res.uploaded > 0 && res.path !== path) {
        toast.success(t('admin.docs.uploadedTo', { count: res.uploaded, path: pathLabel(res.path) }), {
          action: { label: t('admin.docs.goFolder'), onClick: () => goRef.current({ path: res.path }) },
        });
      }
    },
    [canEdit, upload, path, pathLabel, t],
  );
  const pickFiles = (target: string) => {
    uploadTargetRef.current = target;
    fileInput.current?.click();
  };

  // ─── Move files (drag & drop onto a folder) ───
  const moveM = useMutation({
    mutationFn: async ({ files, target }: { files: DocFile[]; target: string }) => {
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
      if (folderId) invalidateDocs(qc, folderId, target, ...files.map((f) => f.path));
      return { moved, failed, target };
    },
    onSuccess: ({ moved, failed, target }) => {
      if (moved > 0)
        toast.success(t('admin.docs.movedCount', { count: moved }), {
          action: { label: t('admin.docs.goFolder'), onClick: () => goRef.current({ path: target }) },
        });
      if (failed) toastError(failed);
      setSelected(new Set());
    },
    onError: (err) => toastError(err),
  });
  const moveFiles = useCallback((files: DocFile[], target: string) => moveM.mutate({ files, target }), [moveM]);

  // ─── Items of the current directory ───
  const [q, setQ] = useState('');
  useEffect(() => setQ(''), [folderId, path]);
  const items = useMemo<ExplorerItem[]>(() => {
    if (!listing) return [];
    const needle = q.trim().toLowerCase();
    const dirs: ExplorerItem[] = listing.dirs.map((d) => {
      const node = model?.byPath.get(d.path);
      const segs = d.path.split('/');
      const label = crumbLabel(segs, segs.length - 1);
      return {
        kind: 'dir',
        key: `d:${d.path}`,
        dir: d,
        label,
        fixed: node?.fixed ?? (segs[0] === structure.rootDir && (segs.length === 1 || (segs.length === 3 && segs[2] === structure.companyDocsDir))),
        company: node?.company ?? (segs.length === 2 && segs[0] === structure.rootDir),
        files: node?.totalFiles ?? 0,
        bytes: node?.totalBytes ?? 0,
        lastUploadAt: node?.lastUploadDeep ?? null,
      };
    });
    const files: ExplorerItem[] = listing.files.map((f) => ({ kind: 'file', key: `f:${f.id}`, file: f }));
    const all = [...dirs, ...files];
    if (!needle) return all;
    return all.filter((it) => (it.kind === 'dir' ? `${it.label} ${it.dir.name}` : it.file.name).toLowerCase().includes(needle));
  }, [listing, model, q, crumbLabel, structure]);
  const isEmptyDir = !!listing && listing.dirs.length === 0 && listing.files.length === 0;

  // ─── Selection ───
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  useEffect(() => {
    setSelected(new Set());
    anchor.current = null;
  }, [folderId, path]);
  const selectedItems = useMemo(() => items.filter((it) => selected.has(it.key)), [items, selected]);
  const selectedFiles = useMemo(() => selectedItems.flatMap((it) => (it.kind === 'file' ? [it.file] : [])), [selectedItems]);
  const selectedDirs = useMemo(() => selectedItems.flatMap((it) => (it.kind === 'dir' ? [it] : [])), [selectedItems]);

  const onSelectClick = (item: ExplorerItem, mods: SelectModifiers) => {
    setSelected((prev) => {
      if (mods.shiftKey && anchor.current) {
        const a = items.findIndex((x) => x.key === anchor.current);
        const b = items.findIndex((x) => x.key === item.key);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          const next = mods.ctrlKey || mods.metaKey ? new Set(prev) : new Set<string>();
          for (let i = lo; i <= hi; i++) next.add(items[i].key);
          return next;
        }
      }
      anchor.current = item.key;
      if (mods.ctrlKey || mods.metaKey) {
        const next = new Set(prev);
        if (next.has(item.key)) next.delete(item.key);
        else next.add(item.key);
        return next;
      }
      return prev.size === 1 && prev.has(item.key) ? new Set() : new Set([item.key]);
    });
  };
  const onToggle = (item: ExplorerItem) => {
    anchor.current = item.key;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(items.map((it) => it.key)));
  const clearSelection = () => setSelected(new Set());
  const onPaneKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectAll();
    } else if (e.key === 'Escape' && selected.size > 0) {
      e.preventDefault();
      clearSelection();
    } else if (e.key === 'Delete' && canEdit && selectedItems.length > 0) {
      e.preventDefault();
      askDeleteSelection();
    }
  };
  /** Files that travel with a dragged tile: the whole selection when it is part of it. */
  const dragFiles = (item: ExplorerItem): DocFile[] => {
    if (item.kind !== 'file') return [];
    return selected.has(item.key) && selectedFiles.length > 0 ? selectedFiles : [item.file];
  };

  // ─── Modals ───
  const [newDirAt, setNewDirAt] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState(false);
  const [rename, setRename] = useState<RenameTarget | null>(null);
  const [moving, setMoving] = useState<DocFile[]>([]);
  const [deleting, setDeleting] = useState<Target[]>([]);
  const [grants, setGrants] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [menu, setMenu] = useState<{ at: MenuPosition; entries: MenuEntry[] } | null>(null);

  const del = useMutation({
    mutationFn: async (targets: Target[]) => {
      if (!folderId) return { ok: 0, failed: 0, gonePaths: [] as string[] };
      let ok = 0;
      let failed = 0;
      let lastErr: unknown = null;
      const gonePaths: string[] = [];
      // Files first so that a selected folder containing selected files can be emptied and removed in one go.
      const ordered = [...targets].sort((a, b) => (a.kind === 'file' ? 0 : 1) - (b.kind === 'file' ? 0 : 1));
      for (const target of ordered) {
        try {
          if (target.kind === 'dir') {
            await api.delete(`/docs/folders/${folderId}/dirs`, { params: { path: target.dir.path } });
            gonePaths.push(target.dir.path);
          } else await api.delete(`/docs/files/${target.file.id}`);
          ok++;
        } catch (err) {
          failed++;
          lastErr = err;
        }
      }
      invalidateDocs(qc, folderId, path, ...targets.map((x) => (x.kind === 'dir' ? parentOf(x.dir.path) : x.file.path)));
      if (failed > 0 && ok === 0) throw lastErr;
      return { ok, failed, gonePaths, lastErr };
    },
    onSuccess: (r, targets) => {
      if (targets.length === 1) toast.success(targets[0].kind === 'dir' ? t('admin.docs.dirDeleted') : t('admin.docs.fileDeleted'));
      else {
        if (r.ok > 0) toast.success(t('admin.docs.deletedCount', { count: r.ok }));
        if (r.failed > 0) toastError(r.lastErr, t('admin.docs.deleteFailedCount', { count: r.failed }));
      }
      setDeleting([]);
      setSelected(new Set());
      // Browsing a directory that just disappeared? Go up.
      if (r.gonePaths.some((p) => path === p || path.startsWith(`${p}/`))) goRef.current({ path: parentOf(r.gonePaths[0]) });
    },
    onError: (err) => toastError(err),
  });
  const askDeleteSelection = () => {
    const targets = selectedItems.flatMap((it): Target[] => (it.kind === 'dir' ? (it.fixed ? [] : [{ kind: 'dir', dir: it.dir }]) : [{ kind: 'file', file: it.file }]));
    if (targets.length > 0) setDeleting(targets);
  };

  // ─── Opening ───
  const openFile = (f: DocFile) => {
    if (f.previewable) window.open(docFileUrl(f.id), '_blank', 'noopener');
    else if (canDownload) downloadFiles([f]);
  };
  const openItem = (item: ExplorerItem) => {
    if (item.kind === 'dir') go({ path: item.dir.path });
    else openFile(item.file);
  };
  const onAction = (action: ItemAction, item: ExplorerItem) => {
    if (action === 'open') openItem(item);
    else if (item.kind === 'file') {
      if (action === 'preview') window.open(docFileUrl(item.file.id), '_blank', 'noopener');
      else if (action === 'download') downloadFiles([item.file]);
      else if (action === 'rename') setRename({ kind: 'file', file: item.file });
      else if (action === 'move') setMoving(selected.has(item.key) && selectedFiles.length > 1 ? selectedFiles : [item.file]);
      else if (action === 'delete') setDeleting([{ kind: 'file', file: item.file }]);
    } else {
      if (action === 'rename') setRename({ kind: 'dir', dir: item.dir });
      else if (action === 'delete') setDeleting([{ kind: 'dir', dir: item.dir }]);
    }
  };

  // ─── Context menus ───
  const dirMenu = (dir: DocDir, opts: { fixed: boolean; isRoot: boolean; empty: boolean; label: string }): MenuEntry[] => {
    const entries: MenuEntry[] = [{ id: 'open', label: t('admin.common.open'), icon: FolderOpen, onSelect: () => go({ path: dir.path }) }];
    if (canEdit) {
      entries.push(
        { id: 'upload', label: t('admin.docs.uploadHere'), icon: Upload, onSelect: () => pickFiles(dir.path) },
        { id: 'newdir', label: t('admin.docs.newSubfolder'), icon: FolderPlus, onSelect: () => setNewDirAt(dir.path) },
      );
      if (dir.path === structure.rootDir) entries.push({ id: 'newco', label: t('admin.docs.newCompany'), icon: Building2, onSelect: () => setNewCompany(true) });
      if (!opts.isRoot) {
        entries.push({ kind: 'separator', id: 's1' });
        if (opts.fixed) entries.push({ id: 'locked', label: t('admin.docs.rename'), icon: Pencil, disabled: true, title: t('admin.docs.fixedLocked'), onSelect: () => undefined });
        else
          entries.push(
            { id: 'rename', label: t('admin.docs.rename'), icon: Pencil, onSelect: () => setRename({ kind: 'dir', dir }) },
            {
              id: 'delete',
              label: t('admin.common.delete'),
              icon: Trash2,
              danger: true,
              disabled: !opts.empty,
              title: opts.empty ? undefined : t('admin.docs.notEmpty'),
              onSelect: () => setDeleting([{ kind: 'dir', dir }]),
            },
          );
      }
    }
    if (canDownload && folderId) {
      entries.push({ kind: 'separator', id: 's2' });
      entries.push({ id: 'zip', label: t('admin.docs.zip'), icon: Archive, onSelect: () => window.open(docExportUrl(folderId, dir.path), '_blank', 'noopener') });
    }
    return entries;
  };
  const fileMenu = (f: DocFile): MenuEntry[] => {
    const many = selected.has(`f:${f.id}`) && selectedFiles.length > 1 ? selectedFiles : [f];
    const entries: MenuEntry[] = [];
    if (f.previewable) entries.push({ id: 'preview', label: t('admin.docs.preview'), icon: Eye, onSelect: () => window.open(docFileUrl(f.id), '_blank', 'noopener') });
    if (canDownload)
      entries.push({
        id: 'download',
        label: many.length > 1 ? `${t('admin.common.download')} (${many.length})` : t('admin.common.download'),
        icon: Download,
        onSelect: () => downloadFiles(many),
      });
    if (canEdit) {
      if (entries.length > 0) entries.push({ kind: 'separator', id: 's1' });
      entries.push(
        { id: 'rename', label: t('admin.docs.rename'), icon: Pencil, onSelect: () => setRename({ kind: 'file', file: f }) },
        { id: 'move', label: many.length > 1 ? t('admin.docs.moveFiles', { count: many.length }) : t('admin.docs.move'), icon: FolderInput, onSelect: () => setMoving(many) },
        {
          id: 'delete',
          label: many.length > 1 ? `${t('admin.common.delete')} (${many.length})` : t('admin.common.delete'),
          icon: Trash2,
          danger: true,
          onSelect: () => setDeleting(many.map((x) => ({ kind: 'file' as const, file: x }))),
        },
      );
    }
    if (entries.length === 0) entries.push({ id: 'none', label: t('admin.docs.viewOnly'), disabled: true, onSelect: () => undefined });
    return entries;
  };
  const openTreeMenu = (node: TreeNode, at: MenuPosition) => {
    const dir: DocDir = { name: node.name, path: node.path, createdAt: node.createdAt ?? '' };
    setMenu({ at, entries: dirMenu(dir, { fixed: node.fixed, isRoot: node.isRoot, empty: node.children.length === 0 && node.files === 0, label: node.label }) });
  };
  const openItemMenu = (item: ExplorerItem, at: MenuPosition) => {
    if (item.kind === 'file') setMenu({ at, entries: fileMenu(item.file) });
    else {
      const node = model?.byPath.get(item.dir.path);
      setMenu({ at, entries: dirMenu(item.dir, { fixed: item.fixed, isRoot: false, empty: node ? node.children.length === 0 && node.files === 0 : item.files === 0, label: item.label }) });
    }
  };

  // ─── Drop zone (whole content pane) ───
  const pane = useDropTarget({ path, enabled: canEdit && !dirNotFound, onUpload: runUpload, onMove: moveFiles });

  const crumbs = path ? path.split('/') : [];
  const selectNode = (p: string) => {
    go({ path: p });
    setTreeOpen(false);
  };

  const treePane = model ? (
    <DocTree
      model={model}
      selectedPath={path}
      expanded={expanded}
      canEdit={canEdit}
      onToggle={toggleNode}
      onExpand={setExpandedNode}
      onSelect={selectNode}
      onMenu={openTreeMenu}
      onDropMove={moveFiles}
      onDropUpload={runUpload}
    />
  ) : treeQ.isLoading ? (
    <LoadingBlock className="min-h-32" />
  ) : treeQ.error ? (
    <div className="p-3">
      <ErrorBlock error={treeQ.error} onRetry={() => treeQ.refetch()} />
    </div>
  ) : null;

  const viewProps = {
    folderId: folderId ?? '',
    items,
    selected,
    canEdit,
    canDownload,
    onSelectClick,
    onToggle,
    onOpen: openItem,
    onMenu: openItemMenu,
    onAction,
    dragFiles,
    onDropMove: moveFiles,
    onDropUpload: runUpload,
  };

  return (
    <div>
      <PageHead
        title={t('admin.nav.docs')}
        subtitle={t('admin.docs.subtitle')}
        actions={
          <>
            {(foldersQ.isFetching || treeQ.isFetching) && !foldersQ.isLoading && <Spinner className="size-4 text-brand-600" />}
            {isSuper && (
              <Link to="/admin/docs/audit" className="btn-white btn-sm border border-line">
                <ScrollText className="size-3.5" /> {t('admin.layout.audit')}
              </Link>
            )}
          </>
        }
      />

      {foldersQ.isLoading ? (
        <LoadingBlock />
      ) : foldersQ.error ? (
        <ErrorBlock error={foldersQ.error} onRetry={() => foldersQ.refetch()} />
      ) : folders.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={FolderOpen} title={t('admin.docs.noFolders')} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)] lg:items-start xl:grid-cols-[320px_minmax(0,1fr)]">
          {/* Left pane: workspace + tree (desktop) */}
          <aside className="hidden overflow-hidden rounded-xl border border-line bg-white lg:sticky lg:top-24 lg:block">
            <div className="border-b border-line p-2">
              <WorkspacePicker folders={folders} selectedId={folderId} meId={me?.id} folderLabel={folderLabel} onSelect={(id) => go({ folder: id, path: '' })} />
            </div>
            <div className="max-h-[calc(100vh-15rem)] overflow-y-auto">{treePane}</div>
          </aside>

          {/* Right pane */}
          <section className="min-w-0" aria-label={rootLabel} onKeyDown={onPaneKeyDown}>
            {/* Mobile: workspace + tree button */}
            <div className="mb-3 flex items-center gap-2 lg:hidden">
              <div className="min-w-0 flex-1">
                <WorkspacePicker folders={folders} selectedId={folderId} meId={me?.id} folderLabel={folderLabel} onSelect={(id) => go({ folder: id, path: '' })} />
              </div>
              <button type="button" className="btn-white btn-sm shrink-0 border border-line" onClick={() => setTreeOpen(true)} aria-haspopup="dialog">
                <FolderTree className="size-3.5" /> {t('admin.docs.folders')}
              </button>
            </div>

            {/* Breadcrumb + access */}
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              <nav aria-label={t('admin.docs.pathAria')} className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => go({ path: '' })}
                  className={clsx('max-w-[14rem] truncate rounded px-1.5 py-0.5 font-mono text-[13px] font-semibold hover:bg-surface', crumbs.length === 0 ? 'text-navy-900' : 'text-brand-600')}
                  title={t('admin.docs.rootDir')}
                >
                  {rootLabel}
                </button>
                {crumbs.map((c, i) => {
                  const p = crumbs.slice(0, i + 1).join('/');
                  const last = i === crumbs.length - 1;
                  const label = crumbLabel(crumbs, i);
                  return (
                    <span key={p} className="flex items-center gap-1">
                      <ChevronRight className="size-3.5 text-muted" aria-hidden />
                      <button
                        type="button"
                        onClick={() => go({ path: p })}
                        aria-current={last ? 'location' : undefined}
                        title={label !== c ? `${fixedHint}: ${c}` : undefined}
                        className={clsx('max-w-[12rem] truncate rounded px-1.5 py-0.5 font-semibold hover:bg-surface', last ? 'text-navy-900' : 'text-brand-600')}
                      >
                        {label}
                      </button>
                    </span>
                  );
                })}
              </nav>
              {access && (
                <span className={clsx('badge text-[10px]', DOC_ACCESS_TONE[access])} title={t('admin.docs.accessTitle')}>
                  {docAccessLabel(access)}
                </span>
              )}
            </div>

            {/* Toolbar */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {canEdit && (
                <>
                  <button type="button" className="btn-primary btn-sm" onClick={() => pickFiles(path)} disabled={!folderId || !!dirNotFound}>
                    <Upload className="size-3.5" /> {t('admin.common.uploadFile')}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept={ACCEPT_ATTR}
                    className="hidden"
                    onChange={(e) => {
                      const target = uploadTargetRef.current ?? path;
                      uploadTargetRef.current = null;
                      void runUpload(Array.from(e.target.files ?? []), target);
                      e.target.value = '';
                    }}
                  />
                  <button type="button" className="btn-white btn-sm border border-line" onClick={() => setNewDirAt(path)} disabled={!folderId || !!dirNotFound}>
                    <FolderPlus className="size-3.5" /> {t('admin.docs.newFolder')}
                  </button>
                  {(inRootDir || path === '') && (
                    <button type="button" className="btn-white btn-sm border border-line" onClick={() => setNewCompany(true)} disabled={!folderId}>
                      <Building2 className="size-3.5" /> {t('admin.docs.newCompany')}
                    </button>
                  )}
                </>
              )}
              {canDownload && folderId && (
                <a href={docExportUrl(folderId, path)} download className="btn-white btn-sm border border-line">
                  <Archive className="size-3.5" /> {t('admin.docs.zip')}
                </a>
              )}
              {isSuper && folderId && (
                <button type="button" className="btn-white btn-sm border border-line" onClick={() => setGrants(true)}>
                  <ShieldCheck className="size-3.5" /> {t('admin.docs.permissions')}
                </button>
              )}
              {!canEdit && access && <span className="text-xs text-muted">{canDownload ? t('admin.docs.downloadOnly') : t('admin.docs.viewOnly')}</span>}

              <div className="ml-auto flex items-center gap-2">
                <label className="relative block">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t('admin.docs.searchPlaceholder')}
                    aria-label={t('admin.docs.searchPlaceholder')}
                    className="input min-h-9 w-44 py-1 pl-8 text-xs sm:w-56"
                  />
                  {q && (
                    <button type="button" onClick={() => setQ('')} aria-label={t('admin.docs.clearSearch')} className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-muted hover:bg-surface hover:text-navy-900">
                      <X className="size-3.5" aria-hidden />
                    </button>
                  )}
                </label>
                <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label={t('admin.docs.view')}>
                  <button
                    type="button"
                    aria-pressed={view === 'grid'}
                    aria-label={t('admin.docs.viewGrid')}
                    title={t('admin.docs.viewGrid')}
                    onClick={() => go({ view: 'grid' })}
                    className={clsx('grid size-8 place-items-center rounded-md transition', view === 'grid' ? 'bg-navy-900 text-white' : 'text-muted hover:bg-surface hover:text-navy-900')}
                  >
                    <LayoutGrid className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === 'list'}
                    aria-label={t('admin.docs.viewList')}
                    title={t('admin.docs.viewList')}
                    onClick={() => go({ view: 'list' })}
                    className={clsx('grid size-8 place-items-center rounded-md transition', view === 'list' ? 'bg-navy-900 text-white' : 'text-muted hover:bg-surface hover:text-navy-900')}
                  >
                    <List className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            </div>

            <UploadList items={upload.items} busy={upload.busy} target={pathLabel(uploadTarget)} onClear={upload.clearFinished} />

            {/* Bulk bar */}
            {selected.size > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs" role="toolbar" aria-label={t('admin.docs.bulkAria')}>
                <CheckSquare className="size-4 text-brand-700" aria-hidden />
                <span className="font-semibold text-brand-800">{t('admin.docs.selectedCount', { count: selected.size })}</span>
                <span className="mx-1 h-4 border-l border-brand-200" aria-hidden />
                {canDownload && (
                  <button
                    type="button"
                    className="btn-white btn-sm border border-line"
                    disabled={selectedFiles.length === 0}
                    title={selectedFiles.length === 0 ? t('admin.docs.onlyFilesDownload') : undefined}
                    onClick={() => {
                      downloadFiles(selectedFiles);
                      if (selectedFiles.length > 1) toast.message(t('admin.docs.multiDownloadHint'));
                    }}
                  >
                    <Download className="size-3.5" /> {t('admin.common.download')}
                    {selectedFiles.length > 0 && ` (${selectedFiles.length})`}
                  </button>
                )}
                {canEdit && (
                  <>
                    <button
                      type="button"
                      className="btn-white btn-sm border border-line"
                      disabled={selectedFiles.length === 0 || selectedDirs.length > 0}
                      title={selectedDirs.length > 0 || selectedFiles.length === 0 ? t('admin.docs.onlyFilesMove') : undefined}
                      onClick={() => setMoving(selectedFiles)}
                    >
                      <FolderInput className="size-3.5" /> {t('admin.docs.move')}
                    </button>
                    <button
                      type="button"
                      className="btn-white btn-sm border border-line text-danger hover:bg-red-50"
                      disabled={selectedItems.every((it) => it.kind === 'dir' && it.fixed)}
                      title={selectedDirs.some((d) => d.fixed) ? t('admin.docs.fixedLocked') : undefined}
                      onClick={askDeleteSelection}
                    >
                      <Trash2 className="size-3.5" /> {t('admin.common.delete')}
                    </button>
                  </>
                )}
                <span className="ml-auto flex items-center gap-1">
                  {selected.size < items.length && (
                    <button type="button" className="inline-flex min-h-8 items-center rounded-md px-2 font-semibold text-brand-700 hover:bg-white" onClick={selectAll}>
                      {t('admin.docs.selectAll')}
                    </button>
                  )}
                  <button type="button" className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 font-semibold text-muted hover:bg-white hover:text-navy-900" onClick={clearSelection}>
                    <X className="size-3.5" aria-hidden /> {t('admin.docs.clearSelection')}
                  </button>
                </span>
              </div>
            )}

            {/* Companies heading inside <rootDir> */}
            {inRootDir && listing && !dirNotFound && listing.dirs.length > 0 && (
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-navy-900">
                <Building2 className="size-4 text-brand-600" aria-hidden /> {t('admin.docs.companies')}
                <span className="badge bg-surface text-[10px] text-muted">{listing.dirs.length}</span>
              </div>
            )}

            {/* Listing */}
            <div
              className={clsx('relative rounded-xl border bg-white transition', pane.over ? 'border-brand-500 ring-4 ring-brand-500/15' : 'border-line')}
              {...pane.handlers}
              onClick={(e) => {
                // Clicking the empty background clears the selection.
                if (e.target === e.currentTarget) clearSelection();
              }}
            >
              {pane.over === 'files' && (
                <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl bg-brand-50/90 px-4 text-center text-brand-700">
                  <span className="flex flex-col items-center gap-1 text-sm font-semibold">
                    <span className="flex items-center gap-2">
                      <UploadCloud className="size-5" /> {t('admin.docs.dropHere')}
                    </span>
                    <span className="text-xs font-medium text-brand-700/80">{t('admin.docs.dropTarget', { path: pathLabel(path) })}</span>
                  </span>
                </div>
              )}
              {dirQ.isLoading ? (
                <LoadingBlock />
              ) : dirNotFound ? (
                <div className="p-4">
                  <EmptyState icon={FolderOpen} title={t('admin.docs.dirNotFound')}>
                    {t('admin.docs.pathGone')}
                    <div className="mt-3">
                      <button type="button" className="btn-white btn-sm border border-line" onClick={() => go({ path: '' })}>
                        {t('admin.docs.backToRoot')}
                      </button>
                    </div>
                  </EmptyState>
                </div>
              ) : dirQ.error ? (
                <div className="p-4">
                  <ErrorBlock error={dirQ.error} onRetry={() => dirQ.refetch()} />
                </div>
              ) : isEmptyDir && inRootDir ? (
                <EmptyState icon={Building2} title={t('admin.docs.noCompanies')}>
                  <p>
                    <Trans
                      i18nKey="admin.docs.noCompaniesText"
                      values={{ path: `${structure.rootDir}/<firma>/${structure.companyDocsDir}`, dir: structure.companyDocsDir }}
                      components={{ code: <code className="rounded bg-surface px-1 font-mono text-[11px]" /> }}
                    />
                  </p>
                  <p className="mt-1">{t('admin.docs.insideRoot')}</p>
                  {canEdit ? (
                    <div className="mt-3">
                      <button type="button" className="btn-primary btn-sm" onClick={() => setNewCompany(true)}>
                        <Plus className="size-3.5" /> {t('admin.docs.newCompany')}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs">{t('admin.docs.needEdit')}</p>
                  )}
                </EmptyState>
              ) : isEmptyDir ? (
                <EmptyState icon={FolderOpen} title={t('admin.docs.emptyDir')}>
                  {canEdit ? t('admin.docs.emptyDirEdit') : t('admin.docs.emptyDirView')}
                </EmptyState>
              ) : items.length === 0 ? (
                <EmptyState icon={Search} title={t('admin.docs.noMatches')}>
                  {t('admin.docs.noMatchesText', { q })}
                  <div className="mt-3">
                    <button type="button" className="btn-white btn-sm border border-line" onClick={() => setQ('')}>
                      {t('admin.docs.clearSearch')}
                    </button>
                  </div>
                </EmptyState>
              ) : view === 'grid' ? (
                <DocGrid {...viewProps} />
              ) : (
                <DocList
                  {...viewProps}
                  before={
                    path ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-1">
                          <button type="button" className="inline-flex min-h-8 items-center gap-2 rounded-md px-2 text-xs font-semibold text-muted hover:bg-surface hover:text-navy-900" onClick={() => go({ path: parentOf(path) })}>
                            <FolderInput className="size-4" aria-hidden /> {t('admin.docs.upDir')}
                          </button>
                        </td>
                      </tr>
                    ) : undefined
                  }
                />
              )}
            </div>
            {listing && !isEmptyDir && (
              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
                <ListChecks className="size-3.5" aria-hidden />
                {t('admin.docs.dirsCount', { count: listing.dirs.length })} · {t('admin.common.files', { count: listing.files.length })} · {formatBytes(listing.files.reduce((n, f) => n + f.size, 0))}
                {listing.files.length > 0 &&
                  (() => {
                    const newest = listing.files.reduce((m, f) => (f.updatedAt > m.updatedAt ? f : m));
                    return t('admin.docs.newest', { name: newest.name, time: fmtRelative(newest.updatedAt) });
                  })()}
                {canEdit && t('admin.docs.limits', { mb: maxMb })}
              </p>
            )}
          </section>
        </div>
      )}

      {/* Mobile tree drawer */}
      <Drawer open={treeOpen} onClose={() => setTreeOpen(false)} title={t('admin.docs.folders')}>
        <div className="-mx-5 -my-5 sm:-mx-6">
          <div className="border-b border-line p-3">
            <WorkspacePicker folders={folders} selectedId={folderId} meId={me?.id} folderLabel={folderLabel} onSelect={(id) => go({ folder: id, path: '' })} />
          </div>
          {treePane}
        </div>
      </Drawer>

      <ContextMenu open={!!menu} at={menu?.at ?? null} items={menu?.entries ?? []} onClose={() => setMenu(null)} label={t('admin.docs.menuAria')} />

      {folderId && (
        <>
          <NewDirModal folderId={folderId} path={newDirAt ?? ''} open={newDirAt !== null} onClose={() => setNewDirAt(null)} />
          <NewCompanyModal folderId={folderId} structure={structure} open={newCompany} onClose={() => setNewCompany(false)} onCreated={(c) => go({ path: c.docsPath })} />
          <RenameModal folderId={folderId} target={rename} onClose={() => setRename(null)} />
          <MoveFilesModal folderId={folderId} rootLabel={rootLabel} files={moving} onClose={() => setMoving([])} onMoved={() => setSelected(new Set())} crumbLabel={crumbLabel} quick={quickDirs} />
          {isSuper && <GrantsModal folderId={folderId} open={grants} onClose={() => setGrants(false)} />}
        </>
      )}

      <ConfirmDialog
        open={deleting.length > 0}
        onClose={() => setDeleting([])}
        onConfirm={() => deleting.length > 0 && del.mutate(deleting)}
        loading={del.isPending}
        title={deleting.length > 1 ? t('admin.docs.deleteMany') : deleting[0]?.kind === 'dir' ? t('admin.docs.deleteDir') : t('admin.docs.deleteFile')}
        confirmLabel={t('admin.common.delete')}
        message={
          deleting.length > 1
            ? t('admin.docs.deleteManyMsg', { count: deleting.length })
            : deleting[0]?.kind === 'dir'
              ? t('admin.docs.deleteDirMsg', { name: deleting[0].dir.name })
              : deleting[0]
                ? t('admin.docs.deleteFileMsg', { name: deleting[0].file.name })
                : undefined
        }
      >
        {deleting.length > 1 && (
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-line bg-surface/60 px-3 py-2 text-xs">
            {deleting.map((d) => (
              <li key={d.kind === 'dir' ? `d:${d.dir.path}` : `f:${d.file.id}`} className="truncate">
                {d.kind === 'dir' ? `${d.dir.name}/` : d.file.name}
              </li>
            ))}
          </ul>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!replaceAsk}
        onClose={() => answerReplace(false)}
        onConfirm={() => answerReplace(true)}
        tone="primary"
        title={t('admin.docs.fileExists')}
        confirmLabel={t('admin.docs.replace')}
        message={replaceAsk ? t('admin.docs.replaceMsg', { name: replaceAsk.name }) : undefined}
      />
    </div>
  );
}
