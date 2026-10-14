import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Building2, ChevronDown, ChevronRight, Folder, FolderLock, FolderOpen, FolderTree, MoreHorizontal } from 'lucide-react';
import { formatBytes } from '@/lib/api';
import type { DocFile, DocFolderSummary } from '@/lib/types';
import { DOC_ACCESS_TONE, docAccessLabel, fmtDateTime, fmtRelative } from '@/components/admin/labels';
import { ContextMenu, type MenuEntry, type MenuPosition } from '@/components/admin/docs/ContextMenu';
import { useDropTarget } from '@/components/admin/docs/useDocDnD';
import type { TreeModel, TreeNode } from '@/components/admin/docs/useDocTree';

// ─── Workspace picker ──────────────────────────────────────────────────

export const WorkspacePicker = ({
  folders,
  selectedId,
  meId,
  folderLabel,
  onSelect,
}: {
  folders: DocFolderSummary[];
  selectedId: string | null;
  meId?: string;
  folderLabel: (f: DocFolderSummary) => string;
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<MenuPosition | null>(null);
  const current = folders.find((f) => f.id === selectedId) ?? folders[0];
  if (!current) return null;
  const own = folders.filter((f) => f.owner.id === meId);
  const others = folders.filter((f) => f.owner.id !== meId);
  const entry = (f: DocFolderSummary): MenuEntry => ({
    id: f.id,
    label: folderLabel(f),
    icon: f.owner.id === meId ? FolderOpen : Folder,
    hint: `/docs/${f.slug} · ${t('admin.common.files', { count: f.fileCount })} · ${formatBytes(f.totalSize)}`,
    trailing: (
      <span className="flex items-center gap-1">
        {!f.owner.isActive && <span className="badge bg-slate-200 text-[10px] text-slate-600">{t('admin.common.inactive')}</span>}
        {f.owner.id !== meId && <span className={clsx('badge text-[10px]', DOC_ACCESS_TONE[f.access])}>{docAccessLabel(f.access)}</span>}
      </span>
    ),
    active: f.id === current.id,
    onSelect: () => onSelect(f.id),
  });
  const items: MenuEntry[] = [
    ...(own.length > 0 ? [{ kind: 'heading', id: 'h-own', label: t('admin.docs.ownSection') } as MenuEntry, ...own.map(entry)] : []),
    ...(others.length > 0 ? [{ kind: 'heading', id: 'h-others', label: t('admin.docs.othersSection') } as MenuEntry, ...others.map(entry)] : []),
  ];
  const open = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ x: r.left, y: r.bottom + 4 });
  };
  const isOwn = current.owner.id === meId;
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={open}
        aria-haspopup="menu"
        aria-expanded={!!at}
        aria-label={t('admin.docs.workspaceAria')}
        className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-white px-3 py-2 text-left transition hover:border-brand-400/60 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-100 text-brand-700">
          <FolderTree className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold tracking-wide text-muted uppercase">{t('admin.docs.workspace')}</span>
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-navy-900">{folderLabel(current)}</span>
            {!isOwn && <span className={clsx('badge shrink-0 text-[10px]', DOC_ACCESS_TONE[current.access])}>{docAccessLabel(current.access)}</span>}
          </span>
          <span className="block truncate font-mono text-[11px] text-muted">/docs/{current.slug}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>
      <ContextMenu open={!!at} at={at} items={items} onClose={() => setAt(null)} label={t('admin.docs.workspaceAria')} className="min-w-[260px]" />
    </>
  );
};

// ─── Tree ──────────────────────────────────────────────────────────────

export const nodeIcon = (node: TreeNode, open: boolean): { icon: LucideIcon; className: string } => {
  if (node.isRoot) return { icon: FolderTree, className: 'text-navy-900' };
  if (node.company) return { icon: Building2, className: 'text-brand-600' };
  if (node.fixed) return { icon: FolderLock, className: 'text-brand-500' };
  return { icon: open ? FolderOpen : Folder, className: 'text-amber-500' };
};

interface TreeRowProps {
  node: TreeNode;
  selectedPath: string;
  focusedPath: string;
  expanded: Set<string>;
  canEdit: boolean;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onFocus: (path: string) => void;
  onMenu: (node: TreeNode, at: MenuPosition) => void;
  onDropMove: (files: DocFile[], target: string) => void;
  onDropUpload: (files: File[], target: string) => void;
  register: (path: string, el: HTMLDivElement | null) => void;
}

const TreeRow = (props: TreeRowProps) => {
  const { node, selectedPath, focusedPath, expanded, canEdit, onToggle, onSelect, onFocus, onMenu, onDropMove, onDropUpload, register } = props;
  const { t } = useTranslation();
  const hasChildren = node.children.length > 0;
  const open = expanded.has(node.path);
  const selected = node.path === selectedPath;
  const { over, handlers } = useDropTarget({ path: node.path, enabled: canEdit, onMove: onDropMove, onUpload: onDropUpload });
  const { icon: Icon, className: iconClass } = nodeIcon(node, open || selected);
  const direct = node.files;
  const total = node.totalFiles;
  const menuAt = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onMenu(node, { x: e.clientX, y: e.clientY });
  };
  const menuFromButton = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    onMenu(node, { x: r.left, y: r.bottom + 4 });
  };

  return (
    <li role="none">
      <div
        ref={(el) => register(node.path, el)}
        role="treeitem"
        aria-level={node.depth + 1}
        aria-expanded={hasChildren ? open : undefined}
        aria-selected={selected}
        aria-label={node.label}
        tabIndex={node.path === focusedPath ? 0 : -1}
        data-path={node.path}
        onClick={() => {
          onFocus(node.path);
          onSelect(node.path);
        }}
        onDoubleClick={() => hasChildren && onToggle(node.path)}
        onContextMenu={menuAt}
        onFocus={() => onFocus(node.path)}
        {...handlers}
        title={
          node.isRoot
            ? t('admin.docs.rootDir')
            : `${node.path}${node.lastUploadDeep ? ` · ${t('admin.docs.lastUpload', { value: fmtRelative(node.lastUploadDeep) })}` : ''}`
        }
        className={clsx(
          'group relative flex min-h-9 cursor-default items-center gap-1 rounded-md pr-1 text-sm transition outline-none select-none',
          selected ? 'bg-brand-50 text-brand-800' : 'text-navy-900 hover:bg-surface',
          over && 'ring-2 ring-brand-500 ring-inset bg-brand-50',
          'focus-visible:ring-2 focus-visible:ring-brand-500/50',
        )}
        style={{ paddingLeft: `${node.depth * 14 + 4}px` }}
      >
        <span
          role="presentation"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.path);
          }}
          className={clsx('grid size-6 shrink-0 place-items-center rounded text-muted', hasChildren ? 'hover:bg-white hover:text-navy-900' : 'opacity-0')}
          aria-hidden
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </span>
        <Icon className={clsx('size-4 shrink-0', iconClass)} aria-hidden />
        <span className={clsx('min-w-0 flex-1 truncate', node.isRoot ? 'font-mono text-[12px] font-semibold' : 'font-medium', node.fixed && !node.isRoot && 'italic')}>{node.label}</span>
        {total > 0 && (
          <span
            className={clsx('shrink-0 rounded-full px-1.5 text-[10px] font-semibold tabular-nums', selected ? 'bg-brand-100 text-brand-800' : 'bg-surface text-muted')}
            title={t('admin.docs.fileCountTitle', { direct, total })}
          >
            {total}
          </span>
        )}
        <button
          type="button"
          tabIndex={-1}
          onClick={menuFromButton}
          aria-label={t('admin.docs.itemMenu', { name: node.label })}
          className={clsx(
            'grid size-6 shrink-0 place-items-center rounded text-muted opacity-0 transition group-hover:opacity-100 hover:bg-white hover:text-navy-900 focus-visible:opacity-100',
            selected && 'opacity-100',
            '[@media(hover:none)]:opacity-100',
          )}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </div>
      {hasChildren && open && (
        <ul role="group">
          {node.children.map((c) => (
            <TreeRow key={c.path} {...props} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
};

/** Flattened list of the visible rows, in document order (for arrow-key navigation). */
const visibleNodes = (root: TreeNode, expanded: Set<string>): TreeNode[] => {
  const out: TreeNode[] = [];
  const walk = (n: TreeNode) => {
    out.push(n);
    if (expanded.has(n.path)) for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
};

export const DocTree = ({
  model,
  selectedPath,
  expanded,
  canEdit,
  onToggle,
  onExpand,
  onSelect,
  onMenu,
  onDropMove,
  onDropUpload,
}: {
  model: TreeModel;
  selectedPath: string;
  expanded: Set<string>;
  canEdit: boolean;
  onToggle: (path: string) => void;
  onExpand: (path: string, open: boolean) => void;
  onSelect: (path: string) => void;
  onMenu: (node: TreeNode, at: MenuPosition) => void;
  onDropMove: (files: DocFile[], target: string) => void;
  onDropUpload: (files: File[], target: string) => void;
}) => {
  const { t } = useTranslation();
  const [focusedPath, setFocusedPath] = useState(selectedPath);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const register = useCallback((path: string, el: HTMLDivElement | null) => {
    if (el) rows.current.set(path, el);
    else rows.current.delete(path);
  }, []);
  // Follow the selection (breadcrumb / tile navigation) so the keyboard starts from the current folder.
  useEffect(() => setFocusedPath(selectedPath), [selectedPath]);
  const visible = useMemo(() => visibleNodes(model.root, expanded), [model.root, expanded]);
  const focused = model.byPath.has(focusedPath) ? focusedPath : model.root.path;

  const focusNode = (n: TreeNode | undefined) => {
    if (!n) return;
    setFocusedPath(n.path);
    rows.current.get(n.path)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const node = model.byPath.get(focused);
    if (!node) return;
    const i = visible.findIndex((n) => n.path === focused);
    const isOpen = expanded.has(node.path);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusNode(visible[Math.min(visible.length - 1, i + 1)]);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusNode(visible[Math.max(0, i - 1)]);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (node.children.length === 0) break;
        if (!isOpen) onExpand(node.path, true);
        else focusNode(node.children[0]);
        break;
      case 'ArrowLeft': {
        e.preventDefault();
        if (isOpen && node.children.length > 0) onExpand(node.path, false);
        else if (!node.isRoot) {
          const parent = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
          focusNode(model.byPath.get(parent));
        }
        break;
      }
      case 'Home':
        e.preventDefault();
        focusNode(visible[0]);
        break;
      case 'End':
        e.preventDefault();
        focusNode(visible[visible.length - 1]);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(node.path);
        if (e.key === 'Enter' && node.children.length > 0 && !isOpen) onExpand(node.path, true);
        break;
      case '*':
        e.preventDefault();
        for (const c of visible) if (c.children.length > 0) onExpand(c.path, true);
        break;
      case 'ContextMenu':
      case 'F10': {
        if (e.key === 'F10' && !e.shiftKey) break;
        e.preventDefault();
        const r = rows.current.get(node.path)?.getBoundingClientRect();
        if (r) onMenu(node, { x: r.left + 32, y: r.bottom });
        break;
      }
    }
  };

  return (
    <div className="min-w-0">
      <ul role="tree" aria-label={t('admin.docs.treeAria')} className="space-y-px p-2" onKeyDown={onKeyDown}>
        <TreeRow
          node={model.root}
          selectedPath={selectedPath}
          focusedPath={focused}
          expanded={expanded}
          canEdit={canEdit}
          onToggle={onToggle}
          onSelect={onSelect}
          onFocus={setFocusedPath}
          onMenu={onMenu}
          onDropMove={onDropMove}
          onDropUpload={onDropUpload}
          register={register}
        />
      </ul>
      <p className="border-t border-line px-3 py-2 text-[11px] text-muted" title={model.root.lastUploadDeep ? fmtDateTime(model.root.lastUploadDeep) : undefined}>
        {t('admin.docs.treeTotals', { files: t('admin.common.files', { count: model.totals.files }), bytes: formatBytes(model.totals.bytes) })}
        <span className="block truncate">{t('admin.docs.lastUpload', { value: model.root.lastUploadDeep ? fmtRelative(model.root.lastUploadDeep) : '—' })}</span>
      </p>
    </div>
  );
};
