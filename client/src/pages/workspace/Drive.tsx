import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  Briefcase,
  Clipboard,
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileArchive,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderUp,
  History,
  Info,
  Palette,
  Pencil,
  RefreshCw,
  RotateCcw,
  Scissors,
  SearchX,
  Shield,
  Star,
  StarOff,
  Trash2,
  Upload,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import { registerCopy } from '@/i18n';
import { statusLabel } from '@/components/admin/labels';
import type { CaseStatus } from '@/lib/types';
import { adminCopy } from '@/i18n/admin';
import { driveCopy } from '@/i18n/pagesDrive';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { AccessOverview } from '@/components/drive/AccessOverview';
import { ContextMenu, type MenuEntry, type MenuPosition } from '@/components/drive/ContextMenu';
import { ConflictDialog, FolderPicker, ImagePreview, NameDialog } from '@/components/drive/Dialogs';
import { DetailsPanel } from '@/components/drive/DetailsPanel';
import { ItemsView, type ListMode, type SortKey, type ViewMode } from '@/components/drive/ItemsView';
import { ShareDialog } from '@/components/drive/ShareDialog';
import { Sidebar } from '@/components/drive/Sidebar';
import { Toolbar, type CrumbView, type ToolAction } from '@/components/drive/Toolbar';
import { UploadPanel } from '@/components/drive/UploadPanel';
import { useDropTarget, type PickedFile } from '@/components/drive/dnd';
import { FOLDER_SWATCH } from '@/components/drive/fileIcons';
import { crumbLabel, rootLabel } from '@/components/drive/labels';
import {
  batchCall,
  contentUrl,
  driveKeys,
  exportUrl,
  fetchChildren,
  fetchRoots,
  invalidateDrive,
  isVirtual,
  reportBatch,
  startDownload,
  toastDriveError,
} from '@/components/drive/api';
import { ACCEPT_ATTR, useUploads, type ConflictChoice } from '@/components/drive/useUploads';
import { FOLDER_COLORS, can, type DriveItem, type DriveLocation, type FolderColor, type StatsResponse, type VersionRow } from '@/components/drive/types';

registerCopy(adminCopy);
registerCopy(driveCopy);

const BASE = '/workspace/drive';
const folderHref = (id: string) => `${BASE}/f/${encodeURIComponent(id)}`;

const readPref = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
};

const parseLocation = (splat: string, params: URLSearchParams): DriveLocation => {
  const [head, ...rest] = splat.split('/').filter(Boolean);
  if (head === 'f' && rest[0]) return { kind: 'folder', id: decodeURIComponent(rest.join('/')) };
  if (head === 'cases') return { kind: 'cases' };
  if (head === 'shared' || head === 'recent' || head === 'starred' || head === 'trash' || head === 'access') return { kind: head };
  if (head === 'search') return { kind: 'search', q: params.get('q') ?? '', type: params.get('type') ?? '', after: params.get('after') ?? '' };
  return { kind: 'home' };
};

const CASE_STATUSES: CaseStatus[] = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

const TYPE_FILTERS = ['folder', 'pdf', 'word', 'excel', 'presentation', 'image', 'archive', 'text'] as const;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

interface FlatResponse {
  items: DriveItem[];
  trashDays?: number;
}

type Confirm =
  | { kind: 'trash'; items: DriveItem[] }
  | { kind: 'purge'; items: DriveItem[] }
  | { kind: 'empty' }
  | { kind: 'version'; item: DriveItem; v: VersionRow };

/**
 * Team drive: a full-screen, Explorer-like document environment (folder tree, address bar, large icons
 * or details, multi-select, keyboard, context menu, drag & drop, uploads, sharing, recycle bin).
 */
export default function WorkspaceDrive() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { '*': splat = '' } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const myId = user?.id ?? '';
  const isSuper = user?.role === 'SUPER_ADMIN';
  const loc = useMemo(() => parseLocation(splat, params), [splat, params]);

  const roots = useQuery({ queryKey: driveKeys.roots, queryFn: fetchRoots, staleTime: 60_000 });
  const stats = useQuery({ queryKey: driveKeys.stats, queryFn: async () => (await api.get<StatsResponse>('/drive/stats')).data, staleTime: 60_000 });
  const maxBytes = roots.data?.limits.maxFileBytes ?? 50 * 1024 * 1024;
  const trashDays = roots.data?.limits.trashDays ?? 30;

  const folderId = loc.kind === 'folder' ? loc.id : loc.kind === 'cases' ? (roots.data?.cases?.id ?? null) : null;
  // The Cases root can be filtered by case status (?status=APPROVED).
  const caseStatus = folderId && folderId === roots.data?.cases?.id ? (params.get('status') ?? '') : '';
  const listing = useQuery({
    queryKey: driveKeys.children(folderId ?? '', undefined, caseStatus),
    queryFn: () => fetchChildren(folderId!, undefined, caseStatus),
    enabled: !!folderId,
    placeholderData: keepPreviousData,
    retry: (n, err) => n < 1 && (err as { response?: { status?: number } })?.response?.status !== 404,
  });
  const flatKind = loc.kind === 'shared' || loc.kind === 'recent' || loc.kind === 'starred' || loc.kind === 'trash' || loc.kind === 'search' ? loc.kind : null;
  const flatParams = loc.kind === 'search' ? { q: loc.q, type: loc.type || undefined, modifiedFrom: loc.after || undefined } : undefined;
  const flat = useQuery({
    queryKey: driveKeys.list(flatKind ?? '', flatParams),
    queryFn: async () => (await api.get<FlatResponse>(`/drive/${flatKind}`, { params: flatParams })).data,
    enabled: !!flatKind && (loc.kind !== 'search' || !!loc.q),
  });

  // ── view preferences ──
  const [view, setView] = useState<ViewMode>(() => readPref('tv-drive-view', ['grid', 'list'] as const, 'grid'));
  const [sortKey, setSortKey] = useState<SortKey>(() => readPref('tv-drive-sort', ['name', 'modified', 'size', 'type'] as const, 'name'));
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => readPref('tv-drive-dir', ['asc', 'desc'] as const, 'asc'));
  const [detailsOpen, setDetailsOpen] = useState(() => readPref('tv-drive-details', ['1', '0'] as const, '1') === '1');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => writePref('tv-drive-view', view), [view]);
  useEffect(() => writePref('tv-drive-sort', sortKey), [sortKey]);
  useEffect(() => writePref('tv-drive-dir', sortDir), [sortDir]);
  useEffect(() => writePref('tv-drive-details', detailsOpen ? '1' : '0'), [detailsOpen]);
  useEffect(() => setSidebarOpen(false), [routerLocation.pathname]);

  // ── data for the current view ──
  const folder = folderId ? listing.data?.folder : undefined;
  const rawItems: DriveItem[] = useMemo(() => (folderId ? (listing.data?.items ?? []) : flatKind ? (flat.data?.items ?? []) : []), [folderId, listing.data, flatKind, flat.data]);
  const items = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const keyed = [...rawItems];
    keyed.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'FOLDER' ? -1 : 1;
      let r = 0;
      if (sortKey === 'modified') r = new Date(loc.kind === 'trash' ? (a.deletedAt ?? a.updatedAt) : a.updatedAt).getTime() - new Date(loc.kind === 'trash' ? (b.deletedAt ?? b.updatedAt) : b.updatedAt).getTime();
      else if (sortKey === 'size') r = (a.size ?? a.childCount ?? 0) - (b.size ?? b.childCount ?? 0);
      else if (sortKey === 'type') r = collator.compare(a.mimeType ?? '', b.mimeType ?? '');
      if (r === 0) r = collator.compare(a.name, b.name);
      return r * dir;
    });
    return keyed;
  }, [rawItems, sortKey, sortDir, loc.kind]);
  const mode: ListMode = loc.kind === 'trash' ? 'trash' : folderId ? 'folder' : 'flat';

  // ── selection ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const viewKey = `${loc.kind}:${folderId ?? ''}:${loc.kind === 'search' ? loc.q : ''}`;
  useEffect(() => {
    setSelected(new Set());
    setFocusId(null);
    setAnchorId(null);
  }, [viewKey]);
  // Drop ids that disappeared (moved, deleted).
  useEffect(() => {
    setSelected((s) => {
      const ids = new Set(items.map((i) => i.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [items]);
  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);
  const select = useCallback((ids: Set<string>, focus: string | null, anchor?: string | null) => {
    setSelected(ids);
    setFocusId(focus);
    if (anchor !== undefined) setAnchorId(anchor);
  }, []);

  // ── history (back / forward) ──
  const navType = useNavigationType();
  const histIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const maxIdx = useRef(histIdx);
  useEffect(() => {
    // A new navigation drops the forward history; going back keeps it.
    maxIdx.current = navType === 'POP' ? Math.max(maxIdx.current, histIdx) : histIdx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.key]);

  // ── title ──
  const viewTitle =
    loc.kind === 'shared'
      ? t('drive.nav.sharedWithMe')
      : loc.kind === 'recent'
        ? t('drive.nav.recent')
        : loc.kind === 'starred'
          ? t('drive.nav.starred')
          : loc.kind === 'trash'
            ? t('drive.nav.trash')
            : loc.kind === 'search'
              ? t('drive.nav.search')
              : loc.kind === 'access'
                ? t('drive.nav.access')
                : folder
                  ? rootLabel(folder, t, myId)
                  : t('drive.title');
  usePageTitle(viewTitle);

  // ── uploads ──
  const [conflict, setConflict] = useState<{ name: string; resolve: (a: { choice: ConflictChoice; all: boolean }) => void } | null>(null);
  const askConflict = useCallback((name: string) => new Promise<{ choice: ConflictChoice; all: boolean }>((resolve) => setConflict({ name, resolve })), []);
  const uploads = useUploads(maxBytes, askConflict);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);

  const writable = (i: DriveItem | undefined | null) => !!i && i.kind === 'FOLDER' && can(i.myAccess, 'EDIT') && !isVirtual(i) && i.space !== 'CASES';
  const canCreateHere = writable(folder);

  const onFiles = useCallback((files: PickedFile[], targetId: string) => uploads.enqueue(files, targetId), [uploads]);

  // ── mutations ──
  const refresh = () => void invalidateDrive(qc);
  const clear = () => select(new Set(), null, null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toastDriveError(err);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const moveOrCopy = (list: DriveItem[], targetId: string, copy: boolean) =>
    run(async () => {
      const results = await batchCall(copy ? '/drive/copy' : '/drive/move', { ids: list.map((i) => i.id), targetId });
      reportBatch(results, copy ? 'drive.toasts.copied' : 'drive.toasts.moved');
      clear();
    });
  const onItems = useCallback((list: DriveItem[], targetId: string, copy: boolean) => void moveOrCopy(list, targetId, copy), // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const createFolder = useMutation({
    mutationFn: async (name: string) => (await api.post<{ item: DriveItem }>(`/drive/nodes/${encodeURIComponent(folderId!)}/folders`, { name })).data.item,
    onSuccess: (item) => {
      toast.success(t('drive.toasts.folderCreated'));
      setDialog(null);
      refresh();
      select(new Set([item.id]), item.id, item.id);
    },
    onError: toastDriveError,
  });
  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => api.patch(`/drive/nodes/${encodeURIComponent(id)}`, { name }),
    onSuccess: () => {
      toast.success(t('drive.toasts.renamed'));
      setDialog(null);
      refresh();
    },
    onError: toastDriveError,
  });
  const setColor = (item: DriveItem, color: FolderColor | null) =>
    run(async () => {
      await api.patch(`/drive/nodes/${encodeURIComponent(item.id)}`, { color });
      toast.success(t('drive.toasts.colorSaved'));
      setColorFor(null);
    });
  const star = (list: DriveItem[], on: boolean) =>
    run(async () => {
      for (const i of list) await (on ? api.put : api.delete)(`/drive/nodes/${encodeURIComponent(i.id)}/star`);
      toast.success(t(on ? 'drive.toasts.starred' : 'drive.toasts.unstarred'));
    });

  // ── dialogs ──
  const [dialog, setDialog] = useState<{ kind: 'newFolder' } | { kind: 'rename'; item: DriveItem } | null>(null);
  const [picker, setPicker] = useState<{ mode: 'move' | 'copy'; items: DriveItem[] } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [shareItem, setShareItem] = useState<DriveItem | null>(null);
  const [previewItem, setPreviewItem] = useState<DriveItem | null>(null);
  const [colorFor, setColorFor] = useState<DriveItem | null>(null);
  const [menu, setMenu] = useState<{ at: MenuPosition; items: DriveItem[] | null } | null>(null);
  const [clipboard, setClipboard] = useState<{ mode: 'cut' | 'copy'; items: DriveItem[] } | null>(null);

  const doConfirm = () => {
    const c = confirm;
    if (!c) return;
    void run(async () => {
      if (c.kind === 'trash') reportBatch(await batchCall('/drive/trash', { ids: c.items.map((i) => i.id) }), 'drive.toasts.trashed');
      else if (c.kind === 'purge') reportBatch(await batchCall('/drive/purge', { ids: c.items.map((i) => i.id) }), 'drive.toasts.purged');
      else if (c.kind === 'empty') {
        await api.delete('/drive/trash');
        toast.success(t('drive.toasts.emptied'));
      } else if (c.kind === 'version') {
        await api.post(`/drive/nodes/${encodeURIComponent(c.item.id)}/versions/${c.v.id}/restore`);
        toast.success(t('drive.toasts.versionRestored'));
      }
      setConfirm(null);
      if (c.kind !== 'version') clear();
    });
  };
  const restore = (list: DriveItem[]) =>
    run(async () => {
      reportBatch(await batchCall('/drive/restore', { ids: list.map((i) => i.id) }), 'drive.toasts.restored');
      clear();
    });

  // ── opening ──
  const go = useCallback((href: string) => navigate(href), [navigate]);
  const open = (item: DriveItem) => {
    if (loc.kind === 'trash') {
      select(new Set([item.id]), item.id, item.id);
      setDetailsOpen(true);
      return;
    }
    if (item.kind === 'FOLDER') {
      go(folderHref(item.id));
      return;
    }
    if (item.previewable && item.mimeType?.startsWith('image/')) setPreviewItem(item);
    else if (item.previewable) window.open(contentUrl(item.id), '_blank', 'noopener');
    else if (can(item.myAccess, 'DOWNLOAD')) startDownload(contentUrl(item.id, true));
    else {
      select(new Set([item.id]), item.id, item.id);
      setDetailsOpen(true);
    }
  };

  const up = () => {
    const path = listing.data?.path ?? [];
    if (folderId && path.length > 1) go(folderHref(path[path.length - 2].id));
    else if (folderId && listing.data?.truncated) go(`${BASE}/shared`);
  };
  const canUp = !!folderId && ((listing.data?.path.length ?? 0) > 1 || !!listing.data?.truncated);

  // ── action sets ──
  const editable = (list: DriveItem[]) => list.length > 0 && list.every((i) => can(i.myAccess, 'EDIT') && !i.system && !isVirtual(i));
  const copyable = (list: DriveItem[]) => list.length > 0 && list.every((i) => can(i.myAccess, i.kind === 'FILE' ? 'DOWNLOAD' : 'EXPORT'));
  const zippable = (list: DriveItem[]) => list.length > 0 && list.some((i) => can(i.myAccess, 'EXPORT'));
  const paste = (targetId: string) => {
    if (!clipboard) return;
    void moveOrCopy(clipboard.items, targetId, clipboard.mode === 'copy');
    if (clipboard.mode === 'cut') setClipboard(null);
  };
  const cut = (list: DriveItem[]) => {
    setClipboard({ mode: 'cut', items: list });
    toast(t('drive.toasts.cut', { count: list.length }));
  };
  const copyToClipboard = (list: DriveItem[]) => {
    setClipboard({ mode: 'copy', items: list });
    toast(t('drive.toasts.copiedClipboard', { count: list.length }));
  };
  const zip = (list: DriveItem[]) => {
    toast(t('drive.toasts.exportStarted'));
    startDownload(exportUrl(list.map((i) => i.id)));
  };

  const menuEntries = (list: DriveItem[] | null): MenuEntry[] => {
    if (!list || list.length === 0) {
      const out: MenuEntry[] = [];
      if (canCreateHere) {
        out.push(
          { id: 'new', label: t('drive.toolbar.newFolder'), icon: FolderPlus, onSelect: () => setDialog({ kind: 'newFolder' }) },
          { id: 'up', label: t('drive.toolbar.uploadFiles'), icon: Upload, onSelect: () => pickFiles(folderId!) },
          { id: 'updir', label: t('drive.toolbar.uploadFolder'), icon: FolderUp, onSelect: () => pickDir(folderId!) },
        );
        if (clipboard) out.push({ id: 'paste', label: t('drive.actions.pasteN', { count: clipboard.items.length }), icon: ClipboardPaste, onSelect: () => paste(folderId!) });
        out.push({ kind: 'separator', id: 's1' });
      }
      if (loc.kind === 'trash' && items.length) out.push({ id: 'empty', label: t('drive.actions.emptyTrash'), icon: Trash2, danger: true, onSelect: () => setConfirm({ kind: 'empty' }) });
      out.push({ id: 'refresh', label: t('drive.toolbar.refresh'), icon: RefreshCw, onSelect: refresh });
      if (items.length) out.push({ id: 'all', label: t('drive.actions.selectAll'), icon: Clipboard, onSelect: () => select(new Set(items.map((i) => i.id)), null, null) });
      if (folder) {
        out.push({ kind: 'separator', id: 's2' }, { id: 'share', label: t('drive.actions.share'), icon: Shield, onSelect: () => setShareItem(folder) });
        if (folder.kind === 'FOLDER' && zippable([folder])) out.push({ id: 'zip', label: t('drive.actions.downloadZip'), icon: FileArchive, onSelect: () => zip([folder]) });
      }
      return out;
    }
    const single = list.length === 1 ? list[0] : null;
    if (loc.kind === 'trash') {
      return [
        { id: 'restore', label: t('drive.actions.restore'), icon: RotateCcw, onSelect: () => restore(list), disabled: !list.every((i) => can(i.myAccess, 'EDIT')) },
        { id: 'props', label: t('drive.actions.properties'), icon: Info, onSelect: () => setDetailsOpen(true), disabled: !single },
        { kind: 'separator', id: 's' },
        { id: 'purge', label: t('drive.actions.deleteForever'), icon: XCircle, danger: true, onSelect: () => setConfirm({ kind: 'purge', items: list }) },
      ];
    }
    const out: MenuEntry[] = [];
    if (single) {
      out.push({ id: 'open', label: t('drive.actions.open'), icon: single.kind === 'FOLDER' ? FolderOpen : Eye, onSelect: () => open(single) });
      if (single.caseId) out.push({ id: 'case', label: t('drive.actions.openCase'), icon: Briefcase, onSelect: () => go(`/admin/cases/${single.caseId}`) });
      if (flatKind && single.location) out.push({ id: 'loc', label: t('drive.actions.openLocation'), icon: ExternalLink, onSelect: () => go(folderHref(single.location!.id)) });
      out.push({ kind: 'separator', id: 's0' });
    }
    if (single?.kind === 'FILE' && can(single.myAccess, 'DOWNLOAD')) out.push({ id: 'dl', label: t('drive.actions.download'), icon: Download, onSelect: () => startDownload(contentUrl(single.id, true)) });
    if (zippable(list) && (list.length > 1 || single?.kind === 'FOLDER')) out.push({ id: 'zip', label: t('drive.actions.downloadZip'), icon: FileArchive, onSelect: () => zip(list) });
    out.push({ kind: 'separator', id: 's1' });
    if (editable(list)) out.push({ id: 'cut', label: t('drive.actions.cut'), icon: Scissors, onSelect: () => cut(list) });
    if (copyable(list)) out.push({ id: 'copy', label: t('drive.actions.copy'), icon: Copy, onSelect: () => copyToClipboard(list) });
    if (single && clipboard && writable(single)) out.push({ id: 'paste', label: t('drive.actions.pasteN', { count: clipboard.items.length }), icon: ClipboardPaste, onSelect: () => paste(single.id) });
    if (editable(list)) out.push({ id: 'move', label: t('drive.actions.moveTo'), icon: FolderInput, onSelect: () => setPicker({ mode: 'move', items: list }) });
    if (copyable(list)) out.push({ id: 'copyto', label: t('drive.actions.copyTo'), icon: Copy, onSelect: () => setPicker({ mode: 'copy', items: list }) });
    if (single && editable([single])) out.push({ id: 'rename', label: t('drive.actions.rename'), icon: Pencil, onSelect: () => setDialog({ kind: 'rename', item: single }) });
    if (single?.kind === 'FOLDER' && can(single.myAccess, 'MANAGE') && !isVirtual(single)) out.push({ id: 'color', label: t('drive.actions.color'), icon: Palette, onSelect: () => setColorFor(single) });
    out.push({ kind: 'separator', id: 's2' });
    const real = list.filter((i) => !isVirtual(i));
    if (real.length) {
      const allStarred = real.every((i) => i.starred);
      out.push({ id: 'star', label: t(allStarred ? 'drive.actions.unstar' : 'drive.actions.star'), icon: allStarred ? StarOff : Star, onSelect: () => star(real, !allStarred) });
    }
    if (single) {
      out.push({ id: 'share', label: t('drive.actions.share'), icon: Shield, onSelect: () => setShareItem(single) });
      out.push({ id: 'props', label: t('drive.actions.properties'), icon: Info, onSelect: () => setDetailsOpen(true) });
      if (single.kind === 'FILE' && !isVirtual(single)) out.push({ id: 'versions', label: t('drive.actions.versions'), icon: History, onSelect: () => setDetailsOpen(true) });
    }
    if (editable(list)) {
      out.push({ kind: 'separator', id: 's3' }, { id: 'del', label: t('drive.actions.delete'), icon: Trash2, danger: true, onSelect: () => setConfirm({ kind: 'trash', items: list }) });
    }
    // No two separators in a row / at the ends.
    return out.filter((e, i, arr) => e.kind !== 'separator' || (i > 0 && i < arr.length - 1 && arr[i - 1].kind !== 'separator'));
  };

  const toolActions = (): ToolAction[] => {
    const list = selectedItems;
    if (!list.length) return [];
    if (loc.kind === 'trash') {
      return [
        { id: 'restore', icon: RotateCcw, label: t('drive.actions.restore'), onClick: () => restore(list), primary: true },
        { id: 'purge', icon: XCircle, label: t('drive.actions.deleteForever'), onClick: () => setConfirm({ kind: 'purge', items: list }), danger: true, primary: true },
      ];
    }
    const single = list.length === 1 ? list[0] : null;
    const out: ToolAction[] = [];
    if (single?.kind === 'FILE' && can(single.myAccess, 'DOWNLOAD')) out.push({ id: 'dl', icon: Download, label: t('drive.actions.download'), onClick: () => startDownload(contentUrl(single.id, true)), primary: true });
    if (zippable(list) && (list.length > 1 || single?.kind === 'FOLDER')) out.push({ id: 'zip', icon: FileArchive, label: t('drive.actions.downloadZip'), onClick: () => zip(list), primary: true });
    if (single && editable([single])) out.push({ id: 'rename', icon: Pencil, label: t('drive.actions.rename'), onClick: () => setDialog({ kind: 'rename', item: single }), primary: true });
    if (editable(list)) out.push({ id: 'move', icon: FolderInput, label: t('drive.actions.moveTo'), onClick: () => setPicker({ mode: 'move', items: list }), primary: true });
    if (copyable(list)) out.push({ id: 'copyto', icon: Copy, label: t('drive.actions.copyTo'), onClick: () => setPicker({ mode: 'copy', items: list }) });
    if (single) out.push({ id: 'share', icon: Shield, label: t('drive.actions.share'), onClick: () => setShareItem(single), primary: true });
    if (editable(list)) out.push({ id: 'del', icon: Trash2, label: t('drive.actions.delete'), onClick: () => setConfirm({ kind: 'trash', items: list }), danger: true, primary: true });
    return out;
  };

  // ── keyboard ──
  const onKey = (e: KeyboardEvent, { columns }: { columns: number }) => {
    const mod = e.ctrlKey || e.metaKey;
    const idx = focusId ? items.findIndex((i) => i.id === focusId) : -1;
    const moveTo = (n: number) => {
      if (!items.length) return;
      const next = Math.max(0, Math.min(items.length - 1, n));
      const id = items[next].id;
      if (e.shiftKey && anchorId) {
        const a = items.findIndex((i) => i.id === anchorId);
        const [from, to] = a < next ? [a, next] : [next, a];
        select(new Set(items.slice(from, to + 1).map((i) => i.id)), id);
      } else if (mod) setFocusId(id);
      else select(new Set([id]), id, id);
    };
    switch (e.key) {
      case 'ArrowRight':
        if (view === 'grid') moveTo(idx + 1);
        return view === 'grid';
      case 'ArrowLeft':
        if (view === 'grid') moveTo(idx - 1);
        return view === 'grid';
      case 'ArrowDown':
        moveTo(idx < 0 ? 0 : idx + (view === 'grid' ? columns : 1));
        return true;
      case 'ArrowUp':
        if (e.altKey) {
          up();
          return true;
        }
        moveTo(idx < 0 ? 0 : idx - (view === 'grid' ? columns : 1));
        return true;
      case 'Home':
        moveTo(0);
        return true;
      case 'End':
        moveTo(items.length - 1);
        return true;
      case 'Enter': {
        const target = selectedItems.length === 1 ? selectedItems[0] : items[idx];
        if (target) open(target);
        return true;
      }
      case 'Backspace':
        up();
        return true;
      case 'Delete':
        if (loc.kind === 'trash' && selectedItems.length) setConfirm({ kind: 'purge', items: selectedItems });
        else if (editable(selectedItems)) setConfirm({ kind: 'trash', items: selectedItems });
        return true;
      case 'F2':
        if (selectedItems.length === 1 && editable(selectedItems)) setDialog({ kind: 'rename', item: selectedItems[0] });
        return true;
      case 'Escape':
        clear();
        return true;
      default:
        break;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      select(new Set(items.map((i) => i.id)), focusId);
      return true;
    }
    if (mod && e.key.toLowerCase() === 'c' && copyable(selectedItems)) {
      copyToClipboard(selectedItems);
      return true;
    }
    if (mod && e.key.toLowerCase() === 'x' && editable(selectedItems)) {
      cut(selectedItems);
      return true;
    }
    if (mod && e.key.toLowerCase() === 'v' && clipboard && canCreateHere) {
      paste(folderId!);
      return true;
    }
    return false;
  };

  // ── file pickers ──
  const pickFiles = (targetId: string) => {
    uploadTarget.current = targetId;
    fileInput.current?.click();
  };
  const pickDir = (targetId: string) => {
    uploadTarget.current = targetId;
    dirInput.current?.click();
  };
  const onPicked = (list: FileList | null, folderMode: boolean) => {
    if (!list || !uploadTarget.current) return;
    const files: PickedFile[] = Array.from(list).map((file) => {
      const rel = folderMode ? ((file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '') : '';
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : undefined;
      return { file, relativeDir: dir };
    });
    uploads.enqueue(files, uploadTarget.current);
  };

  // OS files dropped anywhere on the main pane go into the current folder.
  const paneDrop = useDropTarget({ targetId: folderId ?? '', enabled: canCreateHere, onFiles, onItems });

  // ── breadcrumb ──
  const crumbs: CrumbView[] = useMemo(() => {
    if (folderId && listing.data) {
      return listing.data.path.map((c) => ({
        id: c.id,
        label: crumbLabel(c, t, myId),
        href: folderHref(c.id),
        droppable: !!c.myAccess && can(c.myAccess, 'EDIT') && c.space !== 'CASES',
      }));
    }
    return [{ id: `view:${loc.kind}`, label: viewTitle, href: routerLocation.pathname + routerLocation.search, droppable: false }];
  }, [folderId, listing.data, loc.kind, viewTitle, routerLocation.pathname, routerLocation.search, t, myId]);

  // ── redirects ──
  if (loc.kind === 'home') {
    if (roots.data?.personal) return <Navigate to={folderHref(roots.data.personal.id)} replace />;
    if (roots.data?.shared) return <Navigate to={folderHref(roots.data.shared.id)} replace />;
  }
  if (loc.kind === 'access' && user && !isSuper) return <Navigate to={BASE} replace />;

  const subject = selectedItems.length === 1 ? selectedItems[0] : selectedItems.length === 0 ? (folder ?? null) : null;
  const loading = folderId ? listing.isLoading : flatKind ? flat.isLoading && flat.fetchStatus !== 'idle' : roots.isLoading;
  const notFound = !!folderId && listing.isError;
  const emptyText =
    loc.kind === 'shared'
      ? t('drive.empty.shared')
      : loc.kind === 'recent'
        ? t('drive.empty.recent')
        : loc.kind === 'starred'
          ? t('drive.empty.starred')
          : loc.kind === 'trash'
            ? t('drive.empty.trash')
            : loc.kind === 'search'
              ? t('drive.empty.search')
              : folder?.purged
                ? t('drive.empty.purged')
                : folder?.space === 'CASES' && !folder.parentId
                  ? t('drive.empty.cases')
                  : canCreateHere
                    ? t('drive.empty.folder')
                    : t('drive.empty.readOnly');

  const sidebar = (
    <Sidebar
      roots={roots.data}
      stats={stats.data}
      activeId={folderId}
      activeView={loc.kind}
      trail={listing.data?.path.map((c) => c.id) ?? []}
      isSuper={isSuper}
      myId={myId}
      onOpen={go}
      onFiles={onFiles}
      onItems={onItems}
    />
  );

  const searchBar =
    loc.kind === 'search' ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface/60 px-3 py-2 text-xs sm:px-4">
        <span className="font-semibold text-ink">“{loc.q}”</span>
        <select
          value={loc.type}
          onChange={(e) => go(`${BASE}/search?${new URLSearchParams({ q: loc.q, ...(e.target.value ? { type: e.target.value } : {}), ...(loc.after ? { after: loc.after } : {}) })}`)}
          className="input !w-auto !py-1 !text-xs"
          aria-label={t('drive.toolbar.type')}
        >
          <option value="">{t('drive.toolbar.anyType')}</option>
          {TYPE_FILTERS.map((k) => (
            <option key={k} value={k}>
              {t(`drive.types.${k}`)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-muted">
          {t('drive.toolbar.modifiedAfter')}
          <input
            type="date"
            value={loc.after}
            onChange={(e) => go(`${BASE}/search?${new URLSearchParams({ q: loc.q, ...(loc.type ? { type: loc.type } : {}), ...(e.target.value ? { after: e.target.value } : {}) })}`)}
            className="input !w-auto !py-1 !text-xs"
          />
        </label>
        <Link to={BASE} className="ml-auto inline-flex items-center gap-1 text-muted hover:text-ink">
          <X className="size-3.5" /> {t('drive.toolbar.clearSearch')}
        </Link>
      </div>
    ) : loc.kind === 'trash' ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface/60 px-3 py-2 text-xs text-muted sm:px-4">
        <span>{t('drive.details.trashHint', { days: trashDays })}</span>
        {items.length > 0 && (
          <button type="button" onClick={() => setConfirm({ kind: 'empty' })} className="ml-auto inline-flex items-center gap-1 font-semibold text-danger hover:underline">
            <Trash2 className="size-3.5" /> {t('drive.actions.emptyTrash')}
          </button>
        )}
      </div>
    ) : folder?.virtual || (folder?.space === 'CASES' && folder) ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-violet-50/60 px-3 py-2 text-xs text-violet-800 sm:px-4">
        <Briefcase className="size-3.5" /> <span>{t('drive.details.readOnlyCases')}</span>
        {!folder.parentId && (
          <select
            value={caseStatus}
            onChange={(e) => go(`${routerLocation.pathname}${e.target.value ? `?status=${e.target.value}` : ''}`)}
            className="input ml-auto !w-auto !py-1 !text-xs"
            aria-label={t('drive.details.caseStatus')}
          >
            <option value="">{t('admin.common.all')}</option>
            {CASE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {statusLabel(st)}
              </option>
            ))}
          </select>
        )}
        {folder.caseId && (
          <Link to={`/admin/cases/${folder.caseId}`} className="ml-auto inline-flex items-center gap-1 font-semibold hover:underline">
            <ExternalLink className="size-3.5" /> {t('drive.actions.openCase')}
          </Link>
        )}
      </div>
    ) : null;

  return (
    <div className="flex h-full min-h-0 bg-surface">
      {/* Folder pane */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-card lg:block xl:w-72">{sidebar}</aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-navy-900/50" onClick={() => setSidebarOpen(false)} aria-label={t('drive.dialogs.close')} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-card shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {loc.kind === 'access' ? (
          <>
            <Toolbar
              canBack={histIdx > 0}
              canForward={maxIdx.current > histIdx}
              canUp={false}
              onBack={() => navigate(-1)}
              onForward={() => navigate(1)}
              onUp={up}
              onRefresh={refresh}
              crumbs={crumbs}
              onOpen={go}
              onFiles={onFiles}
              onItems={onItems}
              searchValue=""
              onSearch={(q) => go(`${BASE}/search?${new URLSearchParams({ q })}`)}
              view={view}
              onView={setView}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={() => undefined}
              canCreate={false}
              onNewFolder={() => undefined}
              onUploadFiles={() => undefined}
              onUploadFolder={() => undefined}
              selectionCount={0}
              onClearSelection={clear}
              actions={[]}
              detailsOpen={false}
              onToggleDetails={() => undefined}
              onToggleSidebar={() => setSidebarOpen(true)}
              minimal
            />
            <div className="min-h-0 flex-1 bg-card">
              <AccessOverview onOpenFolder={(id) => go(folderHref(id))} />
            </div>
          </>
        ) : (
          <>
            <Toolbar
              canBack={histIdx > 0}
              canForward={maxIdx.current > histIdx}
              canUp={canUp}
              onBack={() => navigate(-1)}
              onForward={() => navigate(1)}
              onUp={up}
              onRefresh={refresh}
              crumbs={crumbs}
              leading={listing.data?.truncated ? <span className="shrink-0 px-1.5 text-xs text-muted">{t('drive.nav.sharedWithMe')}</span> : undefined}
              onOpen={go}
              onFiles={onFiles}
              onItems={onItems}
              searchValue={loc.kind === 'search' ? loc.q : ''}
              onSearch={(q) => go(`${BASE}/search?${new URLSearchParams({ q })}`)}
              view={view}
              onView={setView}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={(k, dir) => {
                if (dir) setSortDir(dir);
                else if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                else {
                  setSortKey(k);
                  setSortDir(k === 'modified' || k === 'size' ? 'desc' : 'asc');
                }
              }}
              canCreate={canCreateHere}
              onNewFolder={() => setDialog({ kind: 'newFolder' })}
              onUploadFiles={() => folderId && pickFiles(folderId)}
              onUploadFolder={() => folderId && pickDir(folderId)}
              selectionCount={selectedItems.length}
              onClearSelection={clear}
              actions={toolActions()}
              detailsOpen={detailsOpen}
              onToggleDetails={() => setDetailsOpen((o) => !o)}
              onToggleSidebar={() => setSidebarOpen(true)}
            />
            {searchBar}
            <div className="flex min-h-0 flex-1">
              <main className="relative min-w-0 flex-1 bg-card" {...paneDrop.handlers}>
                {loading ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-2 p-4" aria-busy="true">
                    {Array.from({ length: 12 }, (_, i) => (
                      <div key={i} className="flex flex-col items-center gap-2 rounded-xl p-3">
                        <div className="size-16 animate-pulse rounded-xl bg-surface" />
                        <div className="h-3 w-20 animate-pulse rounded bg-surface" />
                      </div>
                    ))}
                  </div>
                ) : notFound ? (
                  <div className="grid h-full place-items-center p-6 text-center">
                    <div>
                      <SearchX className="mx-auto size-12 text-muted" strokeWidth={1.4} />
                      <h2 className="mt-3 text-lg font-bold text-ink">{t('drive.notFound.title')}</h2>
                      <p className="mt-1 text-sm text-muted">{t('drive.notFound.body')}</p>
                      <Link to={BASE} className="btn-primary btn-sm mt-4">
                        {t('drive.notFound.back')}
                      </Link>
                    </div>
                  </div>
                ) : items.length === 0 ? (
                  <div
                    className="grid h-full place-items-center p-6 text-center"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ at: { x: e.clientX, y: e.clientY }, items: null });
                    }}
                  >
                    <div>
                      <div className="mx-auto grid size-20 place-items-center rounded-3xl bg-surface">
                        {loc.kind === 'trash' ? <Trash2 className="size-9 text-muted" strokeWidth={1.4} /> : loc.kind === 'starred' ? <Star className="size-9 text-amber-400" strokeWidth={1.4} /> : <FolderOpen className="size-9 text-amber-400" strokeWidth={1.4} />}
                      </div>
                      <h2 className="mt-4 text-base font-bold text-ink">{emptyText}</h2>
                      {canCreateHere && <p className="mt-1 text-sm text-muted">{t('drive.empty.folderHint')}</p>}
                      {loc.kind === 'starred' && <p className="mt-1 text-sm text-muted">{t('drive.empty.starredHint')}</p>}
                      {canCreateHere && (
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                          <button type="button" className="btn-primary btn-sm" onClick={() => pickFiles(folderId!)}>
                            <Upload className="size-4" /> {t('drive.toolbar.uploadFiles')}
                          </button>
                          <button type="button" className="btn-white btn-sm border border-line" onClick={() => setDialog({ kind: 'newFolder' })}>
                            <FolderPlus className="size-4" /> {t('drive.toolbar.newFolder')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <ItemsView
                    items={items}
                    view={view}
                    mode={mode}
                    selected={selected}
                    focusId={focusId}
                    anchorId={anchorId}
                    myId={myId}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={(k) => {
                      if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      else {
                        setSortKey(k);
                        setSortDir('asc');
                      }
                    }}
                    onSelect={select}
                    onOpen={open}
                    onContext={(e: MouseEvent, item) =>
                      setMenu({ at: { x: e.clientX, y: e.clientY }, items: item ? (selected.has(item.id) ? selectedItems : [item]) : null })
                    }
                    onKey={onKey}
                    onFiles={onFiles}
                    onItems={onItems}
                    canDrag={(i) => loc.kind !== 'trash' && (can(i.myAccess, 'EDIT') && !i.system && !isVirtual(i) ? true : can(i.myAccess, i.kind === 'FILE' ? 'DOWNLOAD' : 'EXPORT'))}
                  />
                )}
                {paneDrop.over === 'files' && folder && (
                  <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-brand-500 bg-brand-50/90 dark:bg-navy-950/85">
                    <div className="text-center">
                      <UploadCloud className="mx-auto size-12 text-brand-600" strokeWidth={1.5} />
                      <p className="mt-2 text-base font-bold text-ink">{t('drive.drop.upload')}</p>
                      <p className="text-sm text-muted">{t('drive.drop.into', { name: rootLabel(folder, t, myId) })}</p>
                    </div>
                  </div>
                )}
                {busy && (
                  <div className="absolute top-3 right-3 z-20 rounded-full bg-card p-2 shadow">
                    <Spinner className="size-4" />
                  </div>
                )}
              </main>
              {detailsOpen && (
                <>
                  <aside className="hidden w-80 shrink-0 border-l border-line bg-card xl:block 2xl:w-96">
                    <DetailsPanel
                      subject={subject}
                      multi={selectedItems}
                      myId={myId}
                      trashDays={trashDays}
                      onClose={() => setDetailsOpen(false)}
                      onShare={setShareItem}
                      onRestoreVersion={(item, v) => setConfirm({ kind: 'version', item, v })}
                      onPreview={setPreviewItem}
                    />
                  </aside>
                  {selectedItems.length > 0 && (
                    <div className="fixed inset-0 z-40 xl:hidden">
                      <button type="button" className="absolute inset-0 bg-navy-900/40" onClick={() => setDetailsOpen(false)} aria-label={t('drive.dialogs.close')} />
                      <aside className="absolute inset-y-0 right-0 w-[22rem] max-w-[92vw] border-l border-line bg-card shadow-xl">
                        <DetailsPanel
                          subject={subject}
                          multi={selectedItems}
                          myId={myId}
                          trashDays={trashDays}
                          onClose={() => setDetailsOpen(false)}
                          onShare={setShareItem}
                          onRestoreVersion={(item, v) => setConfirm({ kind: 'version', item, v })}
                          onPreview={setPreviewItem}
                        />
                      </aside>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <input ref={fileInput} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => { onPicked(e.target.files, false); e.target.value = ''; }} />
      <input
        ref={(el) => {
          dirInput.current = el;
          if (el) el.setAttribute('webkitdirectory', '');
        }}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onPicked(e.target.files, true);
          e.target.value = '';
        }}
      />

      <ContextMenu open={!!menu} at={menu?.at ?? null} items={menu ? menuEntries(menu.items) : []} onClose={() => setMenu(null)} label={t('drive.toolbar.more')} />

      <NameDialog
        open={dialog?.kind === 'newFolder'}
        title={t('drive.dialogs.newFolder')}
        label={t('drive.dialogs.folderName')}
        initial={t('drive.dialogs.untitled')}
        submitLabel={t('drive.dialogs.create')}
        busy={createFolder.isPending}
        onSubmit={(name) => createFolder.mutate(name)}
        onClose={() => setDialog(null)}
      />
      <NameDialog
        open={dialog?.kind === 'rename'}
        title={t('drive.dialogs.rename')}
        label={t('drive.dialogs.newName')}
        initial={dialog?.kind === 'rename' ? dialog.item.name : ''}
        isFile={dialog?.kind === 'rename' && dialog.item.kind === 'FILE'}
        submitLabel={t('drive.dialogs.save')}
        busy={rename.isPending}
        onSubmit={(name) => dialog?.kind === 'rename' && rename.mutate({ id: dialog.item.id, name })}
        onClose={() => setDialog(null)}
      />
      <FolderPicker
        open={!!picker}
        mode={picker?.mode ?? 'move'}
        count={picker?.items.length ?? 0}
        roots={roots.data}
        startId={folderId}
        exclude={picker?.mode === 'move' ? (picker.items.filter((i) => i.kind === 'FOLDER').map((i) => i.id) ?? []) : []}
        myId={myId}
        busy={busy}
        onPick={(targetId) => {
          const p = picker!;
          setPicker(null);
          void moveOrCopy(p.items, targetId, p.mode === 'copy');
        }}
        onClose={() => setPicker(null)}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={doConfirm}
        loading={busy}
        tone={confirm?.kind === 'version' ? 'primary' : 'danger'}
        title={
          confirm?.kind === 'trash'
            ? t('drive.dialogs.deleteTitle')
            : confirm?.kind === 'purge'
              ? t('drive.dialogs.deleteForeverTitle')
              : confirm?.kind === 'empty'
                ? t('drive.dialogs.emptyTrashTitle')
                : confirm?.kind === 'version'
                  ? t('drive.dialogs.restoreVersionTitle', { version: confirm.v.version })
                  : ''
        }
        message={
          confirm?.kind === 'trash'
            ? t('drive.dialogs.deleteBody', { count: confirm.items.length, days: trashDays })
            : confirm?.kind === 'purge'
              ? t('drive.dialogs.deleteForeverBody', { count: confirm.items.length })
              : confirm?.kind === 'empty'
                ? t('drive.dialogs.emptyTrashBody')
                : confirm?.kind === 'version'
                  ? t('drive.dialogs.restoreVersionBody')
                  : undefined
        }
        confirmLabel={
          confirm?.kind === 'trash'
            ? t('drive.actions.delete')
            : confirm?.kind === 'purge'
              ? t('drive.actions.deleteForever')
              : confirm?.kind === 'empty'
                ? t('drive.actions.emptyTrash')
                : confirm?.kind === 'version'
                  ? t('drive.details.restoreVersion')
                  : undefined
        }
      />
      <ShareDialog item={shareItem} onClose={() => setShareItem(null)} myId={myId} />
      <ImagePreview item={previewItem} src={previewItem ? contentUrl(previewItem.id) : ''} onClose={() => setPreviewItem(null)} />
      <ConflictDialog
        name={conflict?.name ?? null}
        onAnswer={(choice, all) => {
          conflict?.resolve({ choice, all });
          setConflict(null);
        }}
      />
      <Modal open={!!colorFor} onClose={() => setColorFor(null)} size="sm" title={t('drive.actions.color')}>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => colorFor && setColor(colorFor, null)} className={clsx('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', !colorFor?.color ? 'border-brand-500' : 'border-line')}>
            <span className="size-4 rounded-full bg-amber-300" /> {t('drive.colors.none')}
          </button>
          {FOLDER_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => colorFor && setColor(colorFor, c)} className={clsx('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', colorFor?.color === c ? 'border-brand-500' : 'border-line')}>
              <span className={clsx('size-4 rounded-full', FOLDER_SWATCH[c])} /> {t(`drive.colors.${c}`)}
            </button>
          ))}
        </div>
      </Modal>
      <UploadPanel tasks={uploads.tasks} onCancel={uploads.cancel} onCancelAll={uploads.cancelAll} onClear={uploads.clearFinished} />
    </div>
  );
}

