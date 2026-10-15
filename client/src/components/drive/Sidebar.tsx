import { memo, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Clock, Share2, ShieldCheck, Star, Trash2 } from 'lucide-react';
import { formatBytes } from '@/lib/api';
import { driveKeys, fetchChildren, isVirtual } from './api';
import { useDropTarget, type PickedFile } from './dnd';
import { ItemIcon } from './fileIcons';
import { can, type DriveItem, type RootsResponse, type StatsResponse } from './types';
import { displayName, rootLabel } from './labels';

export interface SidebarProps {
  roots: RootsResponse | undefined;
  stats: StatsResponse | undefined;
  activeId: string | null;
  activeView: string;
  /** Ids of the current folder's ancestors: expanded automatically. */
  trail: string[];
  isSuper: boolean;
  myId: string;
  onOpen: (href: string) => void;
  onFiles: (files: PickedFile[], targetId: string) => void;
  onItems: (items: DriveItem[], targetId: string, copy: boolean) => void;
  onContext?: (e: React.MouseEvent, item: DriveItem) => void;
}

const folderHref = (item: DriveItem) => `/workspace/drive/f/${encodeURIComponent(item.id)}`;

const TreeNode = memo(function TreeNode({
  item,
  depth,
  props,
  label,
}: {
  item: DriveItem;
  depth: number;
  props: SidebarProps;
  label?: string;
}) {
  const { t } = useTranslation();
  const auto = props.trail.includes(item.id);
  const [expanded, setExpanded] = useState(auto);
  useEffect(() => {
    if (auto) setExpanded(true);
  }, [auto]);
  // Stage folders only hold files; a folder whose children turned out to be files has nothing to expand.
  const mayHaveFolders = (item.childCount ?? 0) > 0 && !(item.virtual && item.stage);
  const q = useQuery({
    queryKey: driveKeys.children(item.id, 'FOLDER'),
    queryFn: () => fetchChildren(item.id, 'FOLDER'),
    enabled: expanded && mayHaveFolders,
    staleTime: 30_000,
  });
  const folders = q.data?.items.filter((i) => i.kind === 'FOLDER') ?? [];
  const hasChildren = mayHaveFolders && !(q.data && folders.length === 0);
  const writable = can(item.myAccess, 'EDIT') && !isVirtual(item) && item.space !== 'CASES';
  const drop = useDropTarget({ targetId: item.id, enabled: writable, onFiles: props.onFiles, onItems: props.onItems });
  const active = props.activeId === item.id;
  const text = label ?? displayName(item, t, props.myId);

  return (
    <li>
      <div
        {...drop.handlers}
        className={clsx(
          'group flex items-center rounded-lg pr-2 text-sm transition-colors',
          active ? 'bg-brand-600 text-white' : 'text-ink hover:bg-brand-50 dark:hover:bg-white/5',
          drop.over && 'ring-2 ring-brand-500 ring-inset bg-brand-50',
        )}
        style={{ paddingLeft: `${4 + depth * 14}px` }}
        onContextMenu={props.onContext ? (e) => props.onContext!(e, item) : undefined}
      >
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className={clsx('grid size-6 shrink-0 place-items-center rounded-md', hasChildren ? 'opacity-70 hover:opacity-100' : 'invisible')}
          aria-label={expanded ? t('drive.nav.collapse') : t('drive.nav.expand')}
          aria-expanded={expanded}
          tabIndex={hasChildren ? 0 : -1}
        >
          <ChevronRight className={clsx('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </button>
        <a
          href={folderHref(item)}
          onClick={(e) => {
            e.preventDefault();
            props.onOpen(folderHref(item));
          }}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5"
          title={text}
        >
          <ItemIcon item={item} open={expanded} className={clsx('size-[18px] shrink-0', active && '!text-white')} />
          <span className="truncate font-medium">{text}</span>
        </a>
      </div>
      {expanded && hasChildren && (
        <ul>
          {q.isLoading && <li className="py-1 text-xs text-muted" style={{ paddingLeft: `${30 + depth * 14}px` }}>…</li>}
          {folders.map((f) => (
            <TreeNode key={f.id} item={f} depth={depth + 1} props={props} />
          ))}
        </ul>
      )}
    </li>
  );
});

const QuickLink = ({ icon: Icon, label, href, active, onOpen, tone, children }: { icon: LucideIcon; label: string; href: string; active: boolean; onOpen: (h: string) => void; tone: string; children?: ReactNode }) => (
  <li>
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onOpen(href);
      }}
      className={clsx(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-brand-600 text-white' : 'text-ink hover:bg-brand-50 dark:hover:bg-white/5',
      )}
    >
      <Icon className={clsx('size-[18px] shrink-0', active ? 'text-white' : tone)} strokeWidth={1.7} />
      <span className="truncate">{label}</span>
      {children}
    </a>
  </li>
);

/** Left pane: folder tree (lazy, drop targets) and quick access views. */
export const Sidebar = (props: SidebarProps) => {
  const { t } = useTranslation();
  const { roots, stats, activeView, onOpen } = props;
  const base = '/workspace/drive';
  return (
    <nav className="flex h-full min-h-0 flex-col" aria-label={t('drive.nav.folders')}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 py-3">
        <section>
          <h2 className="px-2.5 pb-1.5 text-[11px] font-bold tracking-wider text-muted uppercase">{t('drive.nav.folders')}</h2>
          <ul className="space-y-0.5">
            {roots?.personal && <TreeNode item={roots.personal} depth={0} props={props} label={rootLabel(roots.personal, t)} />}
            {roots?.shared && <TreeNode item={roots.shared} depth={0} props={props} label={rootLabel(roots.shared, t)} />}
            {roots?.cases && <TreeNode item={roots.cases} depth={0} props={props} label={rootLabel(roots.cases, t)} />}
          </ul>
        </section>
        <section>
          <h2 className="px-2.5 pb-1.5 text-[11px] font-bold tracking-wider text-muted uppercase">{t('drive.nav.quickAccess')}</h2>
          <ul className="space-y-0.5">
            <QuickLink icon={Share2} tone="text-brand-600" label={t('drive.nav.sharedWithMe')} href={`${base}/shared`} active={activeView === 'shared'} onOpen={onOpen} />
            <QuickLink icon={Clock} tone="text-sky-600" label={t('drive.nav.recent')} href={`${base}/recent`} active={activeView === 'recent'} onOpen={onOpen} />
            <QuickLink icon={Star} tone="text-amber-500" label={t('drive.nav.starred')} href={`${base}/starred`} active={activeView === 'starred'} onOpen={onOpen} />
            <QuickLink icon={Trash2} tone="text-muted" label={t('drive.nav.trash')} href={`${base}/trash`} active={activeView === 'trash'} onOpen={onOpen} />
            {props.isSuper && (
              <QuickLink icon={ShieldCheck} tone="text-violet-600" label={t('drive.nav.access')} href={`${base}/access`} active={activeView === 'access'} onOpen={onOpen} />
            )}
          </ul>
        </section>
        {props.isSuper && !!roots?.team.length && (
          <section>
            <h2 className="px-2.5 pb-1.5 text-[11px] font-bold tracking-wider text-muted uppercase">{t('drive.nav.team')}</h2>
            <ul className="space-y-0.5">
              {roots.team.map((r) => (
                <TreeNode key={r.id} item={r} depth={0} props={props} />
              ))}
            </ul>
          </section>
        )}
      </div>
      {stats && (
        <div className="shrink-0 border-t border-line px-4 py-3 text-xs text-muted">
          <p className="mb-1 font-semibold text-ink">{t('drive.nav.storage')}</p>
          <p>{t('drive.stats.mine', { size: formatBytes(stats.personal.bytes) })}</p>
          <p>{t('drive.stats.shared', { size: formatBytes(stats.shared.bytes) })}</p>
          {stats.trash.bytes > 0 && <p>{t('drive.stats.trash', { size: formatBytes(stats.trash.bytes) })}</p>}
          {stats.total && <p className="mt-1 font-medium text-ink/80">{t('drive.stats.total', { size: formatBytes(stats.total.bytes), files: stats.total.files })}</p>}
        </div>
      )}
    </nav>
  );
};
