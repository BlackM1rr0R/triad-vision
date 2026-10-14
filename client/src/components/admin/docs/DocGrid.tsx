import { useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Download,
  Eye,
  File as FileIcon,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderLock,
  Lock,
  MoreHorizontal,
  Pencil,
  Presentation,
  Trash2,
} from 'lucide-react';
import { docFileUrl, formatBytes } from '@/lib/api';
import type { DocDir, DocFile } from '@/lib/types';
import { fmtDateTime, fmtRelative, fullName } from '@/components/admin/labels';
import type { MenuPosition } from '@/components/admin/docs/ContextMenu';
import { endFileDrag, startFileDrag, useDropTarget } from '@/components/admin/docs/useDocDnD';

// ─── File kinds ────────────────────────────────────────────────────────

export type FileKind = 'pdf' | 'excel' | 'word' | 'ppt' | 'image' | 'zip' | 'text' | 'code' | 'other';

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
};

export const fileKind = (mime: string, name: string): FileKind => {
  const ext = extOf(name);
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv' || ['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'excel';
  if (mime.includes('presentation') || mime.includes('powerpoint') || ['ppt', 'pptx'].includes(ext)) return 'ppt';
  if (mime.includes('word') || mime.includes('opendocument.text') || mime.includes('rtf') || ['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'word';
  if (mime.includes('zip') || ext === 'zip') return 'zip';
  if (['md', 'log', 'json', 'xml', 'yml', 'yaml'].includes(ext)) return 'code';
  if (mime.startsWith('text/') || ext === 'txt') return 'text';
  return 'other';
};

/** Icon + colours per kind (icon colour / tile background). */
export const FILE_KIND_STYLE: Record<FileKind, { icon: LucideIcon; text: string; bg: string }> = {
  pdf: { icon: FileText, text: 'text-red-600', bg: 'bg-red-50' },
  excel: { icon: FileSpreadsheet, text: 'text-emerald-600', bg: 'bg-emerald-50' },
  word: { icon: FileText, text: 'text-blue-600', bg: 'bg-blue-50' },
  ppt: { icon: Presentation, text: 'text-orange-600', bg: 'bg-orange-50' },
  image: { icon: FileImage, text: 'text-violet-600', bg: 'bg-violet-50' },
  zip: { icon: FileArchive, text: 'text-amber-700', bg: 'bg-amber-50' },
  text: { icon: FileText, text: 'text-slate-600', bg: 'bg-slate-50' },
  code: { icon: FileCode, text: 'text-slate-600', bg: 'bg-slate-50' },
  other: { icon: FileIcon, text: 'text-slate-500', bg: 'bg-slate-50' },
};

export const FileKindIcon = ({ file, className }: { file: DocFile; className?: string }) => {
  const { icon: Icon, text } = FILE_KIND_STYLE[fileKind(file.mimeType, file.name)];
  return <Icon className={clsx(text, className)} aria-hidden />;
};

// ─── Items ─────────────────────────────────────────────────────────────

export type ExplorerItem =
  | {
      kind: 'dir';
      key: string;
      dir: DocDir;
      label: string;
      fixed: boolean;
      company: boolean;
      /** Files including sub-directories (from the tree). */
      files: number;
      bytes: number;
      lastUploadAt: string | null;
    }
  | { kind: 'file'; key: string; file: DocFile };

export type ItemAction = 'open' | 'preview' | 'download' | 'rename' | 'move' | 'delete';

export interface SelectModifiers {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface ItemsViewProps {
  folderId: string;
  items: ExplorerItem[];
  selected: Set<string>;
  canEdit: boolean;
  canDownload: boolean;
  /** Plain / Ctrl / Shift click on an item. */
  onSelectClick: (item: ExplorerItem, mods: SelectModifiers) => void;
  onToggle: (item: ExplorerItem) => void;
  onOpen: (item: ExplorerItem) => void;
  onMenu: (item: ExplorerItem, at: MenuPosition) => void;
  onAction: (action: ItemAction, item: ExplorerItem) => void;
  /** Files that travel with `item` when it is dragged (the selection, or just the item). */
  dragFiles: (item: ExplorerItem) => DocFile[];
  onDropMove: (files: DocFile[], target: string) => void;
  onDropUpload: (files: File[], target: string) => void;
}

/** Touch devices have no hover / double-click: a tap opens, selection goes through the checkbox. */
const isCoarse = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: none)').matches;

const itemName = (item: ExplorerItem) => (item.kind === 'dir' ? item.label : item.file.name);

const useItemHandlers = (item: ExplorerItem, p: ItemsViewProps) => {
  const onClick = (e: MouseEvent) => {
    if (isCoarse()) p.onOpen(item);
    else p.onSelectClick(item, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey });
  };
  const onDoubleClick = (e: MouseEvent) => {
    e.preventDefault();
    p.onOpen(item);
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    p.onMenu(item, { x: e.clientX, y: e.clientY });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      p.onOpen(item);
    } else if (e.key === ' ') {
      e.preventDefault();
      p.onToggle(item);
    } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      p.onMenu(item, { x: r.left + 24, y: r.top + 24 });
    }
  };
  const draggable = p.canEdit && item.kind === 'file';
  const onDragStart = (e: DragEvent) => {
    if (!draggable) return;
    startFileDrag(e, p.folderId, p.dragFiles(item));
  };
  const menuFromButton = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    p.onMenu(item, { x: r.left, y: r.bottom + 4 });
  };
  return { onClick, onDoubleClick, onContextMenu, onKeyDown, draggable, onDragStart, onDragEnd: endFileDrag, menuFromButton };
};

const Checkbox = ({ item, checked, onToggle, className }: { item: ExplorerItem; checked: boolean; onToggle: () => void; className?: string }) => {
  const { t } = useTranslation();
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label={t('admin.docs.selectAria', { name: itemName(item) })}
      className={clsx('size-4 cursor-pointer rounded border-line accent-brand-600', className)}
    />
  );
};

const DirIcon = ({ item, className }: { item: Extract<ExplorerItem, { kind: 'dir' }>; className?: string }) => {
  if (item.company) return <Building2 className={clsx('text-brand-600', className)} aria-hidden />;
  if (item.fixed) return <FolderLock className={clsx('text-brand-500', className)} aria-hidden />;
  return <Folder className={clsx('text-amber-500', className)} aria-hidden />;
};

// ─── Grid view ─────────────────────────────────────────────────────────

const TILE =
  'group relative flex flex-col rounded-xl border bg-white p-3 text-left outline-none transition select-none focus-visible:ring-2 focus-visible:ring-brand-500/50';

const FolderTile = ({ item, p }: { item: Extract<ExplorerItem, { kind: 'dir' }>; p: ItemsViewProps }) => {
  const { t } = useTranslation();
  const h = useItemHandlers(item, p);
  const selected = p.selected.has(item.key);
  const { over, handlers } = useDropTarget({ path: item.dir.path, enabled: p.canEdit, onMove: p.onDropMove, onUpload: p.onDropUpload });
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={h.onClick}
      onDoubleClick={h.onDoubleClick}
      onContextMenu={h.onContextMenu}
      onKeyDown={h.onKeyDown}
      {...handlers}
      title={item.dir.path}
      className={clsx(
        TILE,
        selected ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-line hover:border-brand-400/60 hover:shadow-[0_8px_24px_-16px_rgba(11,31,68,0.35)]',
        over && 'border-brand-500 bg-brand-50 ring-4 ring-brand-500/20',
      )}
    >
      <TileChrome item={item} p={p} selected={selected} onMenu={h.menuFromButton} />
      <div className={clsx('grid h-20 place-items-center rounded-lg', item.company ? 'bg-brand-50' : item.fixed ? 'bg-brand-50/60' : 'bg-amber-50/70')}>
        <DirIcon item={item} className="size-11" />
      </div>
      {over && (
        <span className="pointer-events-none absolute inset-x-2 top-2 z-10 rounded-md bg-navy-900 px-2 py-1 text-center text-[11px] font-semibold text-white">
          {over === 'move' ? t('admin.docs.dropToMove') : t('admin.docs.dropToUpload')}
        </span>
      )}
      <p className="mt-2 line-clamp-2 text-xs font-semibold break-all text-navy-900">{item.label}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] text-muted tabular-nums">
        {item.company && <span className="badge bg-brand-100 text-[10px] text-brand-700">{t('admin.docs.company')}</span>}
        {item.fixed && !item.company && <span className="badge bg-brand-50 text-[10px] text-brand-700">{t('admin.docs.fixedHint')}</span>}
        <span>{t('admin.common.files', { count: item.files })}</span>
        {item.bytes > 0 && <span>· {formatBytes(item.bytes)}</span>}
      </p>
      {item.lastUploadAt && (
        <p className="text-[11px] text-muted/80" title={fmtDateTime(item.lastUploadAt)}>
          {t('admin.docs.lastUpload', { value: fmtRelative(item.lastUploadAt) })}
        </p>
      )}
    </div>
  );
};

const FileTile = ({ item, p }: { item: Extract<ExplorerItem, { kind: 'file' }>; p: ItemsViewProps }) => {
  const { t } = useTranslation();
  const h = useItemHandlers(item, p);
  const selected = p.selected.has(item.key);
  const f = item.file;
  const kind = fileKind(f.mimeType, f.name);
  const style = FILE_KIND_STYLE[kind];
  const Icon = style.icon;
  const [imgFailed, setImgFailed] = useState(false);
  const thumb = kind === 'image' && f.previewable && !imgFailed;
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      draggable={h.draggable}
      onDragStart={h.onDragStart}
      onDragEnd={h.onDragEnd}
      onClick={h.onClick}
      onDoubleClick={h.onDoubleClick}
      onContextMenu={h.onContextMenu}
      onKeyDown={h.onKeyDown}
      title={`${f.name} · ${t(`admin.docs.kind.${kind}`)} · v${f.version}${p.canEdit ? ` · ${t('admin.docs.dragHint')}` : ''}`}
      className={clsx(
        TILE,
        h.draggable && 'cursor-grab active:cursor-grabbing',
        selected ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-line hover:border-brand-400/60 hover:shadow-[0_8px_24px_-16px_rgba(11,31,68,0.35)]',
      )}
    >
      <TileChrome item={item} p={p} selected={selected} onMenu={h.menuFromButton} />
      <div className={clsx('grid h-20 place-items-center overflow-hidden rounded-lg', style.bg)}>
        {thumb ? (
          <img src={docFileUrl(f.id)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setImgFailed(true)} className="h-full w-full object-cover" />
        ) : (
          <span className="relative">
            <Icon className={clsx('size-11', style.text)} aria-hidden />
            <span className={clsx('absolute -right-3 -bottom-1 rounded px-1 text-[9px] font-bold tracking-wide uppercase', style.text, 'bg-white/90 shadow-sm')}>
              {extOf(f.name).slice(0, 4)}
            </span>
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-xs font-semibold break-all text-navy-900">{f.name}</p>
      <p className="mt-0.5 text-[11px] text-muted tabular-nums">
        {formatBytes(f.size)} ·{' '}
        <span title={fmtDateTime(f.updatedAt)}>{fmtRelative(f.updatedAt)}</span>
      </p>
    </div>
  );
};

/** Checkbox (top-left) and "⋯" (top-right), visible on hover / selection / touch. */
const TileChrome = ({ item, p, selected, onMenu }: { item: ExplorerItem; p: ItemsViewProps; selected: boolean; onMenu: (e: MouseEvent<HTMLButtonElement>) => void }) => {
  const { t } = useTranslation();
  const reveal = clsx('opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100', selected && 'opacity-100');
  return (
    <>
      <span className={clsx('absolute top-2 left-2 z-10 grid size-6 place-items-center rounded-md bg-white/90', reveal)}>
        <Checkbox item={item} checked={selected} onToggle={() => p.onToggle(item)} />
      </span>
      <button
        type="button"
        tabIndex={-1}
        onClick={onMenu}
        onDoubleClick={(e) => e.stopPropagation()}
        aria-label={t('admin.docs.itemMenu', { name: itemName(item) })}
        className={clsx('absolute top-2 right-2 z-10 grid size-6 place-items-center rounded-md bg-white/90 text-muted hover:bg-white hover:text-navy-900', reveal)}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
    </>
  );
};

export const DocGrid = (p: ItemsViewProps) => {
  const { t } = useTranslation();
  return (
    <div role="listbox" aria-multiselectable aria-label={t('admin.docs.listAria')} className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {p.items.map((item) => (item.kind === 'dir' ? <FolderTile key={item.key} item={item} p={p} /> : <FileTile key={item.key} item={item} p={p} />))}
    </div>
  );
};

// ─── List view ─────────────────────────────────────────────────────────

const ICON_BTN = 'inline-grid size-8 place-items-center rounded-md text-ink/60 transition hover:bg-surface hover:text-navy-900 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent';

const IconBtn = ({ icon: Icon, label, onClick, danger, disabled }: { icon: LucideIcon; label: string; onClick?: () => void; danger?: boolean; disabled?: boolean }) => (
  <button
    type="button"
    className={clsx(ICON_BTN, danger && 'hover:bg-red-50 hover:text-danger')}
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      onClick?.();
    }}
    onDoubleClick={(e) => e.stopPropagation()}
  >
    <Icon className="size-4" aria-hidden />
  </button>
);

const DirRow = ({ item, p }: { item: Extract<ExplorerItem, { kind: 'dir' }>; p: ItemsViewProps }) => {
  const { t } = useTranslation();
  const h = useItemHandlers(item, p);
  const selected = p.selected.has(item.key);
  const { over, handlers } = useDropTarget({ path: item.dir.path, enabled: p.canEdit, onMove: p.onDropMove, onUpload: p.onDropUpload });
  return (
    <tr
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={h.onClick}
      onDoubleClick={h.onDoubleClick}
      onContextMenu={h.onContextMenu}
      onKeyDown={h.onKeyDown}
      {...handlers}
      className={clsx('group outline-none transition select-none focus-visible:bg-surface', selected ? 'bg-brand-50' : 'hover:bg-surface/60', over && 'bg-brand-50 ring-2 ring-brand-500 ring-inset')}
    >
      <td className="w-8 py-2 pl-3">
        <Checkbox item={item} checked={selected} onToggle={() => p.onToggle(item)} className={clsx('opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100', selected && 'opacity-100')} />
      </td>
      <td className="px-2 py-2">
        <span className="flex min-h-8 max-w-full items-center gap-2 font-semibold text-navy-900">
          <DirIcon item={item} className="size-4.5 shrink-0" />
          <span className="truncate">{item.label}</span>
          {item.label !== item.dir.name && <span className="truncate font-mono text-[11px] font-normal text-muted">{item.dir.name}</span>}
          {item.company && <span className="badge shrink-0 bg-brand-100 text-[10px] text-brand-700">{t('admin.docs.company')}</span>}
          {item.fixed && !item.company && <span className="badge shrink-0 bg-brand-50 text-[10px] text-brand-700">{t('admin.docs.fixedHint')}</span>}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-xs whitespace-nowrap text-muted tabular-nums">
        {t('admin.common.files', { count: item.files })}
        {item.bytes > 0 && ` · ${formatBytes(item.bytes)}`}
      </td>
      <td className="hidden px-3 py-2 text-center text-xs text-muted md:table-cell">—</td>
      <td className="hidden px-3 py-2 text-xs whitespace-nowrap text-muted lg:table-cell" title={fmtDateTime(item.dir.createdAt)}>
        {item.lastUploadAt ? fmtRelative(item.lastUploadAt) : fmtRelative(item.dir.createdAt)}
      </td>
      <td className="hidden px-3 py-2 text-xs text-muted xl:table-cell">—</td>
      <td className="px-2 py-2">
        <span className="flex items-center justify-end gap-0.5">
          <IconBtn icon={FolderInput} label={t('admin.common.open')} onClick={() => p.onOpen(item)} />
          {p.canEdit &&
            (item.fixed ? (
              <span className={clsx(ICON_BTN, 'cursor-default opacity-50 hover:bg-transparent')} title={t('admin.docs.fixedLocked')} aria-label={t('admin.docs.fixedHint')}>
                <Lock className="size-4" aria-hidden />
              </span>
            ) : (
              <>
                <IconBtn icon={Pencil} label={t('admin.docs.rename')} onClick={() => p.onAction('rename', item)} />
                <IconBtn icon={Trash2} label={t('admin.common.delete')} danger disabled={item.files > 0} onClick={() => p.onAction('delete', item)} />
              </>
            ))}
          <button type="button" className={ICON_BTN} title={t('admin.docs.itemMenu', { name: item.label })} aria-label={t('admin.docs.itemMenu', { name: item.label })} onClick={h.menuFromButton} onDoubleClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        </span>
      </td>
    </tr>
  );
};

const FileRow = ({ item, p }: { item: Extract<ExplorerItem, { kind: 'file' }>; p: ItemsViewProps }) => {
  const { t } = useTranslation();
  const h = useItemHandlers(item, p);
  const selected = p.selected.has(item.key);
  const f = item.file;
  const openable = f.previewable || p.canDownload;
  return (
    <tr
      role="option"
      aria-selected={selected}
      tabIndex={0}
      draggable={h.draggable}
      onDragStart={h.onDragStart}
      onDragEnd={h.onDragEnd}
      onClick={h.onClick}
      onDoubleClick={h.onDoubleClick}
      onContextMenu={h.onContextMenu}
      onKeyDown={h.onKeyDown}
      className={clsx('group outline-none transition select-none focus-visible:bg-surface', selected ? 'bg-brand-50' : 'hover:bg-surface/60', h.draggable && 'cursor-grab active:cursor-grabbing')}
    >
      <td className="w-8 py-2 pl-3">
        <Checkbox item={item} checked={selected} onToggle={() => p.onToggle(item)} className={clsx('opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100', selected && 'opacity-100')} />
      </td>
      <td className="px-2 py-2">
        <span
          className={clsx('flex min-h-8 max-w-full items-center gap-2 font-medium text-navy-900', !openable && 'opacity-60')}
          title={openable ? (f.previewable ? t('admin.docs.previewNew') : t('admin.common.download')) : t('admin.docs.cantPreviewNoDownload')}
        >
          <FileKindIcon file={f} className="size-4.5 shrink-0" />
          <span className="truncate">{f.name}</span>
        </span>
      </td>
      <td className="px-3 py-2 text-right text-xs whitespace-nowrap text-muted tabular-nums">{formatBytes(f.size)}</td>
      <td className="hidden px-3 py-2 text-center text-xs text-muted tabular-nums md:table-cell">v{f.version}</td>
      <td className="hidden px-3 py-2 text-xs whitespace-nowrap text-muted lg:table-cell" title={fmtDateTime(f.updatedAt)}>
        {fmtRelative(f.updatedAt)}
      </td>
      <td className="hidden px-3 py-2 text-xs whitespace-nowrap text-muted xl:table-cell">{fullName(f.uploadedBy)}</td>
      <td className="px-2 py-2">
        <span className="flex items-center justify-end gap-0.5">
          {f.previewable ? <IconBtn icon={Eye} label={t('admin.docs.preview')} onClick={() => p.onAction('preview', item)} /> : <IconBtn icon={Eye} label={t('admin.docs.cantPreview')} disabled />}
          {p.canDownload ? (
            <IconBtn icon={Download} label={t('admin.docs.downloadAria', { name: f.name })} onClick={() => p.onAction('download', item)} />
          ) : (
            <IconBtn icon={Download} label={t('admin.docs.noDownload')} disabled />
          )}
          {p.canEdit && (
            <>
              <IconBtn icon={Pencil} label={t('admin.docs.rename')} onClick={() => p.onAction('rename', item)} />
              <IconBtn icon={FolderInput} label={t('admin.docs.move')} onClick={() => p.onAction('move', item)} />
              <IconBtn icon={Trash2} label={t('admin.common.delete')} danger onClick={() => p.onAction('delete', item)} />
            </>
          )}
        </span>
      </td>
    </tr>
  );
};

export const DocList = (p: ItemsViewProps & { before?: ReactNode }) => {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm" role="listbox" aria-multiselectable aria-label={t('admin.docs.listAria')}>
        <thead className="border-b border-line bg-surface/70 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
          <tr>
            <th className="w-8 py-2.5 pl-3">
              <span className="sr-only">{t('admin.docs.selectAll')}</span>
            </th>
            <th className="px-2 py-2.5">{t('admin.docs.th.name')}</th>
            <th className="px-3 py-2.5 text-right">{t('admin.docs.th.size')}</th>
            <th className="hidden px-3 py-2.5 text-center md:table-cell">{t('admin.docs.th.version')}</th>
            <th className="hidden px-3 py-2.5 lg:table-cell">{t('admin.docs.th.updated')}</th>
            <th className="hidden px-3 py-2.5 xl:table-cell">{t('admin.docs.th.uploader')}</th>
            <th className="px-3 py-2.5 text-right">
              <span className="sr-only">{t('admin.docs.th.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {p.before}
          {p.items.map((item) => (item.kind === 'dir' ? <DirRow key={item.key} item={item} p={p} /> : <FileRow key={item.key} item={item} p={p} />))}
        </tbody>
      </table>
    </div>
  );
};
