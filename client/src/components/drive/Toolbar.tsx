import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  List,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { ContextMenu, type MenuEntry, type MenuPosition } from './ContextMenu';
import { useDropTarget, type PickedFile } from './dnd';
import type { DriveItem } from './types';
import type { SortKey, ViewMode } from './ItemsView';

export interface CrumbView {
  id: string;
  label: string;
  href: string;
  droppable: boolean;
}

export interface ToolAction {
  id: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Shown as an icon button in the command bar (others go into "More"). */
  primary?: boolean;
}

const IconBtn = ({ label, onClick, disabled, children, active }: { label: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; children: ReactNode; active?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    className={clsx(
      'grid size-9 shrink-0 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-35',
      active ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400' : 'text-ink/80 hover:bg-surface hover:text-ink dark:hover:bg-white/5',
    )}
  >
    {children}
  </button>
);

const CrumbButton = ({
  c,
  last,
  onOpen,
  onFiles,
  onItems,
}: {
  c: CrumbView;
  last: boolean;
  onOpen: (href: string) => void;
  onFiles: (files: PickedFile[], targetId: string) => void;
  onItems: (items: DriveItem[], targetId: string, copy: boolean) => void;
}) => {
  const drop = useDropTarget({ targetId: c.id, enabled: c.droppable, onFiles, onItems });
  return (
    <a
      href={c.href}
      onClick={(e) => {
        e.preventDefault();
        onOpen(c.href);
      }}
      {...drop.handlers}
      aria-current={last ? 'page' : undefined}
      className={clsx(
        'shrink-0 truncate rounded-md px-2 py-1 text-sm transition-colors',
        last ? 'max-w-[16rem] font-semibold text-ink' : 'max-w-[11rem] text-muted hover:bg-card hover:text-ink',
        drop.over && 'bg-brand-100 text-brand-700 ring-2 ring-brand-500',
      )}
      title={c.label}
    >
      {c.label}
    </a>
  );
};

export interface ToolbarProps {
  canBack: boolean;
  canForward: boolean;
  canUp: boolean;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onRefresh: () => void;
  crumbs: CrumbView[];
  leading?: ReactNode;
  onOpen: (href: string) => void;
  onFiles: (files: PickedFile[], targetId: string) => void;
  onItems: (items: DriveItem[], targetId: string, copy: boolean) => void;
  searchValue: string;
  onSearch: (q: string) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey, dir?: 'asc' | 'desc') => void;
  canCreate: boolean;
  onNewFolder: () => void;
  /** "New spreadsheet" next to "New folder" (opens the sheet editor). */
  onNewSheet?: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  selectionCount: number;
  onClearSelection: () => void;
  actions: ToolAction[];
  extra?: ReactNode;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onToggleSidebar: () => void;
  /** Only navigation + address + search (pages that are not a file listing). */
  minimal?: boolean;
}

/** Explorer chrome: navigation buttons, address bar (breadcrumb with drop targets), search, command bar. */
export const Toolbar = (p: ToolbarProps) => {
  const { t } = useTranslation();
  const [q, setQ] = useState(p.searchValue);
  useEffect(() => setQ(p.searchValue), [p.searchValue]);
  const [menu, setMenu] = useState<{ kind: 'new' | 'sort' | 'more'; at: MenuPosition } | null>(null);
  const crumbsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the current folder (end of the address bar) in view.
    crumbsRef.current?.scrollTo({ left: crumbsRef.current.scrollWidth });
  }, [p.crumbs]);

  const openMenu = (kind: 'new' | 'sort' | 'more') => (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ kind, at: { x: r.left, y: r.bottom + 4 } });
  };

  const sortEntries: MenuEntry[] = [
    ...(['name', 'modified', 'size', 'type', 'owner'] as SortKey[]).map((k) => ({
      id: k,
      label: t(`drive.toolbar.sort${k[0].toUpperCase()}${k.slice(1)}`),
      icon: p.sortKey === k ? Check : undefined,
      active: p.sortKey === k,
      onSelect: () => p.onSort(k),
    })),
    { kind: 'separator', id: 'sep' },
    { id: 'asc', label: t('drive.toolbar.ascending'), icon: p.sortDir === 'asc' ? Check : undefined, onSelect: () => p.onSort(p.sortKey, 'asc') },
    { id: 'desc', label: t('drive.toolbar.descending'), icon: p.sortDir === 'desc' ? Check : undefined, onSelect: () => p.onSort(p.sortKey, 'desc') },
  ];
  const newEntries: MenuEntry[] = [
    { id: 'folder', label: t('drive.toolbar.newFolder'), icon: FolderPlus, onSelect: p.onNewFolder },
    ...(p.onNewSheet ? [{ id: 'sheet', label: t('drive.shared.newSheet'), icon: FileSpreadsheet, onSelect: p.onNewSheet }] : []),
    { kind: 'separator', id: 'sep' },
    { id: 'files', label: t('drive.toolbar.uploadFiles'), icon: Upload, onSelect: p.onUploadFiles },
    { id: 'dir', label: t('drive.toolbar.uploadFolder'), icon: FolderUp, onSelect: p.onUploadFolder },
  ];
  const primary = p.actions.filter((a) => a.primary);
  const moreEntries: MenuEntry[] = p.actions.map((a) => ({ id: a.id, label: a.label, icon: a.icon, danger: a.danger, onSelect: a.onClick }));

  return (
    <div className="shrink-0 border-b border-line bg-card">
      {/* Navigation + address + search */}
      <div className="flex items-center gap-1 px-2 pt-2 sm:px-3">
        <span className="lg:hidden">
          <IconBtn label={t('drive.nav.openTree')} onClick={p.onToggleSidebar}>
            <PanelLeft className="size-[18px]" />
          </IconBtn>
        </span>
        <span className="hidden sm:contents">
          <IconBtn label={t('drive.toolbar.back')} onClick={p.onBack} disabled={!p.canBack}>
            <ArrowLeft className="size-[18px]" />
          </IconBtn>
          <IconBtn label={t('drive.toolbar.forward')} onClick={p.onForward} disabled={!p.canForward}>
            <ArrowRight className="size-[18px]" />
          </IconBtn>
        </span>
        <IconBtn label={t('drive.toolbar.up')} onClick={p.onUp} disabled={!p.canUp}>
          <ArrowUp className="size-[18px]" />
        </IconBtn>
        <div
          ref={crumbsRef}
          className="mx-1 flex h-9 min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={t('drive.toolbar.address')}
        >
          {p.leading}
          {p.crumbs.map((c, i) => (
            <span key={c.id} className="flex shrink-0 items-center">
              {(i > 0 || p.leading) && <ChevronRight className="size-3.5 shrink-0 text-muted" aria-hidden />}
              <CrumbButton c={c} last={i === p.crumbs.length - 1} onOpen={p.onOpen} onFiles={p.onFiles} onItems={p.onItems} />
            </span>
          ))}
        </div>
        <IconBtn label={t('drive.toolbar.refresh')} onClick={p.onRefresh}>
          <RefreshCw className="size-4" />
        </IconBtn>
        <form
          className="relative hidden md:block"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) p.onSearch(q.trim());
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('drive.toolbar.search')} className="input !h-9 !w-56 !py-0 !pr-8 !pl-9 lg:!w-72" />
          {q && (
            <button type="button" onClick={() => setQ('')} className="absolute top-1/2 right-2 -translate-y-1/2 text-muted hover:text-ink" aria-label={t('drive.toolbar.clearSearch')}>
              <X className="size-3.5" />
            </button>
          )}
        </form>
      </div>
      {/* Mobile search */}
      <form
        className="relative px-2 pt-2 md:hidden"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) p.onSearch(q.trim());
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-5 mt-1 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('drive.toolbar.search')} className="input !h-9 !py-0 !pl-9" />
      </form>

      {/* Command bar */}
      <div className={clsx('flex min-h-[3rem] items-center gap-1 px-2 py-1.5 sm:px-3', p.minimal && 'hidden')}>
        {p.canCreate && (
          <button type="button" onClick={openMenu('new')} className="btn-primary btn-sm mr-1 !gap-1.5 !rounded-lg !px-3 !shadow-none">
            <Plus className="size-4" /> <span className="hidden sm:inline">{t('drive.toolbar.newMenu')}</span>
            <ChevronDown className="size-3.5 opacity-80" />
          </button>
        )}
        {p.canCreate && (
          <span className="hidden sm:contents">
            <IconBtn label={t('drive.toolbar.uploadFiles')} onClick={p.onUploadFiles}>
              <Upload className="size-[18px]" />
            </IconBtn>
          </span>
        )}
        {p.selectionCount > 0 && (
          <>
            <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
            {primary.map((a) => (
              <span key={a.id} className="hidden sm:contents">
                <IconBtn label={a.label} onClick={a.onClick}>
                  <a.icon className={clsx('size-[18px]', a.danger && 'text-danger')} />
                </IconBtn>
              </span>
            ))}
            {p.actions.length > 0 && (
              <IconBtn label={t('drive.toolbar.more')} onClick={openMenu('more')}>
                <MoreHorizontal className="size-[18px]" />
              </IconBtn>
            )}
            <span className="ml-1 hidden truncate text-xs font-medium text-muted md:inline">{t('drive.toolbar.selected', { count: p.selectionCount })}</span>
            <IconBtn label={t('drive.toolbar.clearSelection')} onClick={p.onClearSelection}>
              <X className="size-4" />
            </IconBtn>
          </>
        )}
        {p.extra}
        <span className="flex-1" />
        <IconBtn label={t('drive.toolbar.sort')} onClick={openMenu('sort')}>
          <ArrowDownAZ className="size-[18px]" />
        </IconBtn>
        <div className="flex rounded-lg border border-line p-0.5">
          <IconBtn label={t('drive.toolbar.viewGrid')} onClick={() => p.onView('grid')} active={p.view === 'grid'}>
            <LayoutGrid className="size-4" />
          </IconBtn>
          <IconBtn label={t('drive.toolbar.viewList')} onClick={() => p.onView('list')} active={p.view === 'list'}>
            <List className="size-4" />
          </IconBtn>
        </div>
        <IconBtn label={t('drive.toolbar.details')} onClick={p.onToggleDetails} active={p.detailsOpen}>
          <PanelRight className="size-[18px]" />
        </IconBtn>
      </div>
      <ContextMenu
        open={!!menu}
        at={menu?.at ?? null}
        label={menu?.kind ?? ''}
        onClose={() => setMenu(null)}
        items={menu?.kind === 'new' ? newEntries : menu?.kind === 'sort' ? sortEntries : moreEntries}
      />
    </div>
  );
};
