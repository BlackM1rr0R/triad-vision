import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRightLeft, Copy, FolderSearch, FolderTree, Lock, LockOpen, Pencil, Plus, Save, Settings2, Tag as TagIcon, Tags, WandSparkles, X } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { driveOrgCopy } from '@/i18n/pagesDriveOrg';
import { api } from '@/lib/api';
import { ContextMenu, type MenuEntry, type MenuPosition } from '../ContextMenu';
import type { ToolAction } from '../Toolbar';
import type { UploadOptions, UploadResult } from '../useUploads';
import { invalidateDrive } from '../api';
import { can, type DriveItem, type DriveLocation } from '../types';
import { TAG_DOT, TAG_TONE, fetchNaming, fetchSmartFolders, fetchTags, orgKeys, type DuplicateRef, type SmartFolder, type SmartQuery } from './api';
import { DuplicateDialog, FinalDialog, StageDialog } from './SmallDialogs';

registerCopy(driveOrgCopy);

const TagsDialog = lazy(() => import('./TagsDialog'));
const TemplatesDialog = lazy(() => import('./TemplatesDialog'));
const DuplicatesDialog = lazy(() => import('./DuplicatesDialog'));
const SmartFolderDialog = lazy(() => import('./SmartFolderDialog'));
const NamingSettingsDialog = lazy(() => import('./NamingDialog').then((m) => ({ default: m.NamingSettingsDialog })));
const TidyDialog = lazy(() => import('./NamingDialog').then((m) => ({ default: m.TidyDialog })));
/** The workflow board loads only when the "Lövhə" view is opened. */
export const BoardView = lazy(() => import('./BoardView'));

type Dialog =
  | { kind: 'tags'; items: DriveItem[] }
  | { kind: 'manageTags' }
  | { kind: 'stage'; items: DriveItem[] }
  | { kind: 'final'; items: DriveItem[]; mode: 'set' | 'unset' }
  | { kind: 'templates' }
  | { kind: 'naming' }
  | { kind: 'tidy'; folder: DriveItem }
  | { kind: 'duplicates'; folder: DriveItem | null }
  | { kind: 'smart'; initial?: SmartQuery; existing?: SmartFolder | null }
  | null;

const BASE = '/workspace/drive';

interface Options {
  folder: DriveItem | null | undefined;
  loc: DriveLocation;
  isAdmin: boolean;
  isSuper: boolean;
  onNavigate: (href: string) => void;
}

/**
 * Document organisation in the explorer: tags (chips, filter, whole-drive tag view), workflow stages and the
 * board, "Final" lock, folder templates, automatic naming ("Sənəd növü", "Adları qaydaya sal"), smart folders
 * and duplicate detection. Drive.tsx only wires the pieces in (menu entries, toolbar, sidebar, dialogs).
 */
export const useDriveOrg = ({ folder, loc, isAdmin, isSuper, onNavigate }: Options) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const tags = useQuery({ queryKey: orgKeys.tags, queryFn: fetchTags, staleTime: 60_000 });
  const smart = useQuery({ queryKey: orgKeys.smart, queryFn: fetchSmartFolders, staleTime: 60_000 });
  const naming = useQuery({ queryKey: orgKeys.naming, queryFn: fetchNaming, staleTime: 300_000 });

  // ── tag filter of the current listing ──
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const viewKey = `${loc.kind}:${'id' in loc ? loc.id : ''}`;
  useEffect(() => setTagFilter([]), [viewKey]);
  const filterItems = useCallback((list: DriveItem[]) => (tagFilter.length ? list.filter((i) => tagFilter.every((id) => i.tags?.some((x) => x.id === id))) : list), [tagFilter]);

  /** Chips of the tags present in the listing: click filters, the arrow opens the whole-drive tag view. */
  const filterBar = (list: DriveItem[]): ReactNode => {
    const present = new Map<string, { id: string; name: string; color: string; n: number }>();
    for (const i of list) for (const tg of i.tags ?? []) present.set(tg.id, { ...tg, n: (present.get(tg.id)?.n ?? 0) + 1 });
    if (!present.size && !tagFilter.length) return null;
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line/70 px-3 py-1.5 text-xs sm:px-4">
        <TagIcon className="size-3.5 text-muted" aria-hidden />
        <span className="text-muted">{t('driveOrg.tags.filter')}</span>
        {[...present.values()].map((tg) => {
          const on = tagFilter.includes(tg.id);
          return (
            <span key={tg.id} className={clsx('inline-flex items-center overflow-hidden rounded-full', TAG_TONE[tg.color], on ? 'ring-2 ring-focus' : 'opacity-75 hover:opacity-100')}>
              <button type="button" aria-pressed={on} onClick={() => setTagFilter((f) => (on ? f.filter((x) => x !== tg.id) : [...f, tg.id]))} className="px-2 py-0.5 font-semibold">
                {tg.name} <span className="opacity-70">{tg.n}</span>
              </button>
              <button type="button" onClick={() => onNavigate(`${BASE}/tag/${encodeURIComponent(tg.id)}`)} className="border-l border-current/20 px-1.5 py-0.5 font-semibold opacity-80 hover:opacity-100" title={t('driveOrg.tags.searchAll')} aria-label={t('driveOrg.tags.searchAll')}>
                <FolderSearch className="size-3" />
              </button>
            </span>
          );
        })}
        {tagFilter.length > 0 && (
          <button type="button" onClick={() => setTagFilter([])} className="inline-flex items-center gap-1 text-muted hover:text-ink">
            <X className="size-3.5" /> {t('driveOrg.tags.clearFilter')}
          </button>
        )}
      </div>
    );
  };

  // ── uploads: "Sənəd növü" and duplicate answers ──
  const [docType, setDocType] = useState('');
  const docTypeRef = useRef(docType);
  docTypeRef.current = docType;
  const [dupQueue, setDupQueue] = useState<{ item: DriveItem; duplicates: DuplicateRef[] }[]>([]);
  const uploadOptions: UploadOptions = useMemo(
    () => ({
      extraFields: () => ({ docType: docTypeRef.current || undefined }),
      onUploaded: (r: UploadResult) => {
        if (r.duplicates?.length) setDupQueue((q) => [...q, { item: r.item, duplicates: r.duplicates! }]);
      },
    }),
    [],
  );
  const docTypeSelect = (compact = false) =>
    naming.data?.enabled ? (
      <label className={clsx('flex items-center gap-1.5 text-xs text-muted', compact ? '' : 'border-b border-line px-3 py-2')} title={t('driveOrg.naming.docTypeHint')}>
        <span className="shrink-0 font-semibold">{t('driveOrg.naming.docType')}</span>
        <select className="input min-h-7 !w-auto max-w-[11rem] !py-0.5 !text-xs" value={docType} onChange={(e) => setDocType(e.target.value)}>
          <option value="">{t('driveOrg.naming.docTypeAuto')}</option>
          {(naming.data?.docTypes ?? []).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  // ── menus ──
  const files = (list: DriveItem[]) => list.filter((i) => i.kind === 'FILE');
  const editableAll = (list: DriveItem[]) => list.length > 0 && list.every((i) => can(i.myAccess, 'EDIT') && !!i.parentId);

  const menuEntries = (list: DriveItem[] | null): MenuEntry[] => {
    if (!list?.length) return folder ? folderEntries(folder) : [];
    const out: MenuEntry[] = [];
    if (editableAll(list)) out.push({ id: 'org-tags', label: t('driveOrg.tags.action'), icon: Tags, onSelect: () => setDialog({ kind: 'tags', items: list }) });
    if (editableAll(list) && files(list).length === list.length) out.push({ id: 'org-stage', label: t('driveOrg.stage.change'), icon: ArrowRightLeft, onSelect: () => setDialog({ kind: 'stage', items: list }) });
    if (editableAll(list) && list.some((i) => !i.finalAt)) out.push({ id: 'org-final', label: t('driveOrg.final.set'), icon: Lock, onSelect: () => setDialog({ kind: 'final', items: list, mode: 'set' }) });
    if (isSuper && list.some((i) => i.finalAt || i.kind === 'FOLDER')) out.push({ id: 'org-unfinal', label: t('driveOrg.final.unset'), icon: LockOpen, onSelect: () => setDialog({ kind: 'final', items: list, mode: 'unset' }) });
    if (list.length === 1 && list[0].kind === 'FOLDER') out.push(...folderEntries(list[0]));
    return out.length ? [{ kind: 'separator', id: 'org-s' }, ...out] : [];
  };

  const folderEntries = (f: DriveItem): MenuEntry[] => {
    const out: MenuEntry[] = [];
    if (can(f.myAccess, 'EDIT')) out.push({ id: 'org-tidy', label: t('driveOrg.naming.tidy'), icon: WandSparkles, onSelect: () => setDialog({ kind: 'tidy', folder: f }) });
    if (isAdmin) out.push({ id: 'org-dups', label: t('driveOrg.duplicates.find'), icon: Copy, onSelect: () => setDialog({ kind: 'duplicates', folder: f }) });
    return out;
  };

  const toolActions = (list: DriveItem[]): ToolAction[] => {
    if (!list.length || !editableAll(list)) return [];
    const out: ToolAction[] = [{ id: 'org-tags', icon: Tags, label: t('driveOrg.tags.action'), onClick: () => setDialog({ kind: 'tags', items: list }), primary: true }];
    if (files(list).length === list.length) out.push({ id: 'org-stage', icon: ArrowRightLeft, label: t('driveOrg.stage.change'), onClick: () => setDialog({ kind: 'stage', items: list }) });
    if (list.some((i) => !i.finalAt)) out.push({ id: 'org-final', icon: Lock, label: t('driveOrg.final.set'), onClick: () => setDialog({ kind: 'final', items: list, mode: 'set' }) });
    return out;
  };

  /** Admin tools of the drive ("Təşkil"): templates, naming, tags, duplicates of the whole drive. */
  const adminEntries: MenuEntry[] = [
    { id: 'tpl', label: t('driveOrg.templates.title'), icon: FolderTree, onSelect: () => setDialog({ kind: 'templates' }) },
    { id: 'naming', label: t('driveOrg.naming.settingsTitle'), icon: WandSparkles, onSelect: () => setDialog({ kind: 'naming' }) },
    { id: 'tags', label: t('driveOrg.tags.manageTitle'), icon: Tags, onSelect: () => setDialog({ kind: 'manageTags' }) },
    { id: 'dups', label: t('driveOrg.duplicates.reportAll'), icon: Copy, onSelect: () => setDialog({ kind: 'duplicates', folder: null }) },
  ];
  const toolbarExtra: ReactNode = (
    <>
      {folder?.caseId && <span className="hidden lg:contents">{docTypeSelect(true)}</span>}
      {isAdmin && (
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 4 });
          }}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink/80 hover:bg-sunken hover:text-ink dark:hover:bg-white/5"
          title={t('driveOrg.admin.menu')}
        >
          <Settings2 className="size-[18px]" />
          <span className="hidden xl:inline">{t('driveOrg.admin.menu')}</span>
        </button>
      )}
    </>
  );

  // ── sidebar: smart folders and tags ──
  const activeSmart = loc.kind === 'smart' ? loc.id : null;
  const activeTag = loc.kind === 'tag' ? loc.id : null;
  const sidebar: ReactNode = (
    <>
      <section>
        <div className="flex items-center px-2.5 pb-1.5">
          <h2 className="flex-1 text-[11px] font-bold tracking-wider text-muted uppercase">{t('driveOrg.smart.title')}</h2>
          <button type="button" onClick={() => setDialog({ kind: 'smart', initial: {} })} className="grid size-6 place-items-center rounded-md text-muted hover:bg-primary/[0.06] hover:text-ink dark:hover:bg-primary-contrast/10" title={t('driveOrg.smart.new')} aria-label={t('driveOrg.smart.new')}>
            <Plus className="size-3.5" />
          </button>
        </div>
        <ul className="space-y-0.5">
          {(smart.data?.items ?? []).map((f) => (
            <li key={f.id} className="group relative">
              <a
                href={`${BASE}/smart/${encodeURIComponent(f.id)}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(`${BASE}/smart/${encodeURIComponent(f.id)}`);
                }}
                className={clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 pr-8 text-sm font-medium transition-colors', activeSmart === f.id ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-primary/[0.06] dark:hover:bg-white/5')}
                title={f.name}
              >
                <FolderSearch className={clsx('size-[18px] shrink-0', activeSmart === f.id ? 'text-primary-contrast' : 'text-accent-fg')} strokeWidth={1.7} />
                <span className="truncate">{f.name}</span>
              </a>
              {f.canEdit && (
                <button
                  type="button"
                  onClick={() => setDialog({ kind: 'smart', existing: f })}
                  className={clsx('absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100', activeSmart === f.id ? 'text-primary-contrast hover:bg-primary-contrast/15' : 'text-muted hover:bg-primary/10')}
                  aria-label={t('driveOrg.common.edit')}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </li>
          ))}
          {smart.data && !smart.data.items.length && <li className="px-2.5 text-[11px] text-muted">{t('driveOrg.smart.empty')}</li>}
        </ul>
      </section>
      {!!tags.data?.tags.length && (
        <section>
          <h2 className="px-2.5 pb-1.5 text-[11px] font-bold tracking-wider text-muted uppercase">{t('driveOrg.tags.sidebarTitle')}</h2>
          <ul className="flex flex-wrap gap-1 px-2.5">
            {tags.data.tags.map((tg) => (
              <li key={tg.id}>
                <a
                  href={`${BASE}/tag/${encodeURIComponent(tg.id)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(`${BASE}/tag/${encodeURIComponent(tg.id)}`);
                  }}
                  className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', TAG_TONE[tg.color], activeTag === tg.id && 'ring-2 ring-focus')}
                >
                  <span className={clsx('size-1.5 rounded-full', TAG_DOT[tg.color])} aria-hidden />
                  {tg.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  // ── smart / tag views ──
  const flatSource = (l: DriveLocation): { key: string; url: string } | null =>
    l.kind === 'smart' ? { key: `smart:${l.id}`, url: `/drive/smart-folders/${encodeURIComponent(l.id)}/items` } : l.kind === 'tag' ? { key: `tag:${l.id}`, url: `/drive/tags/${encodeURIComponent(l.id)}/items` } : null;
  const viewTitle = (l: DriveLocation) =>
    l.kind === 'smart'
      ? (smart.data?.items.find((f) => f.id === l.id)?.name ?? t('driveOrg.smart.title'))
      : l.kind === 'tag'
        ? t('driveOrg.tags.viewTitle', { name: tags.data?.tags.find((x) => x.id === l.id)?.name ?? '' })
        : null;
  /** Under the toolbar of the smart / tag / search views: "Ağıllı qovluq kimi saxla" (and edit). */
  const viewBar = (l: DriveLocation, search?: { q: string; type: string; after: string }): ReactNode => {
    if (l.kind === 'smart') {
      const f = smart.data?.items.find((x) => x.id === l.id);
      return (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface/60 px-3 py-2 text-xs text-muted sm:px-4">
          <FolderSearch className="size-4 text-accent-fg" />
          <span className="font-semibold text-ink">{f?.name}</span>
          <span>{f?.shared ? t('driveOrg.smart.sharedBadge') : t('driveOrg.smart.privateBadge')}</span>
          {f?.canEdit && (
            <button type="button" onClick={() => setDialog({ kind: 'smart', existing: f })} className="ml-auto inline-flex items-center gap-1 font-semibold text-link hover:underline dark:text-brand-300">
              <Pencil className="size-3.5" /> {t('driveOrg.common.edit')}
            </button>
          )}
        </div>
      );
    }
    if (l.kind === 'tag') {
      return (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface/60 px-3 py-2 text-xs text-muted sm:px-4">
          <TagIcon className="size-4" />
          <span>{t('driveOrg.tags.viewHint')}</span>
          <button type="button" onClick={() => setDialog({ kind: 'smart', initial: { tagIds: [l.id] } })} className="ml-auto inline-flex items-center gap-1 font-semibold text-link hover:underline dark:text-brand-300">
            <Save className="size-3.5" /> {t('driveOrg.smart.saveSearch')}
          </button>
        </div>
      );
    }
    if (l.kind === 'search' && search) {
      const after = search.after ? Math.max(1, Math.ceil((Date.now() - new Date(search.after).getTime()) / 86_400_000)) : undefined;
      return (
        <button
          type="button"
          onClick={() => setDialog({ kind: 'smart', initial: { words: [search.q], ...(search.type ? { types: [search.type] } : {}), ...(after ? { uploadedWithinDays: Math.min(3650, after) } : {}) } })}
          className="inline-flex items-center gap-1 font-semibold text-link hover:underline dark:text-brand-300"
        >
          <Save className="size-3.5" /> {t('driveOrg.smart.saveSearch')}
        </button>
      );
    }
    return null;
  };

  // ── dialogs ──
  const close = () => setDialog(null);
  const changed = () => void invalidateDrive(qc);
  const dup = dupQueue[0];
  const dialogs = (
    <>
      <ContextMenu open={!!menu} at={menu} label={t('driveOrg.admin.menu')} onClose={() => setMenu(null)} items={adminEntries} />
      {dialog?.kind === 'stage' && <StageDialog items={dialog.items} onClose={close} />}
      {dialog?.kind === 'final' && <FinalDialog items={dialog.items} mode={dialog.mode} onClose={close} />}
      <Suspense fallback={null}>
        {dialog?.kind === 'tags' && <TagsDialog items={dialog.items} onClose={close} />}
        {dialog?.kind === 'manageTags' && <TagsDialog items={[]} manage onClose={close} />}
        {dialog?.kind === 'templates' && <TemplatesDialog onClose={close} />}
        {dialog?.kind === 'naming' && <NamingSettingsDialog onClose={close} />}
        {dialog?.kind === 'tidy' && <TidyDialog folderId={dialog.folder.id} folderName={dialog.folder.name} onClose={close} />}
        {dialog?.kind === 'duplicates' && (
          <DuplicatesDialog
            folderId={dialog.folder?.id ?? null}
            folderName={dialog.folder?.name}
            onClose={close}
            onOpenFolder={(id, itemId) => {
              close();
              onNavigate(`${BASE}/f/${encodeURIComponent(id)}${itemId ? `?${new URLSearchParams({ item: itemId })}` : ''}`);
            }}
          />
        )}
        {dialog?.kind === 'smart' && (
          <SmartFolderDialog
            initial={dialog.initial}
            existing={dialog.existing}
            folder={folder ? { id: folder.id, name: folder.name } : null}
            canShare={!dialog.existing?.shared || !!dialog.existing?.canEdit}
            onClose={close}
            onSaved={(f) => {
              close();
              onNavigate(`${BASE}/smart/${encodeURIComponent(f.id)}`);
            }}
          />
        )}
      </Suspense>
      {dup && (
        <DuplicateDialog
          upload={dup.item}
          duplicates={dup.duplicates}
          onClose={() => setDupQueue((q) => q.slice(1))}
          onDeleteUpload={async () => {
            await api.post('/drive/trash', { ids: [dup.item.id] });
            changed();
          }}
          onOpenExisting={(d) => {
            setDupQueue((q) => q.slice(1));
            if (d.folderId) onNavigate(`${BASE}/f/${encodeURIComponent(d.folderId)}?${new URLSearchParams({ item: d.id })}`);
          }}
        />
      )}
    </>
  );

  return { filterItems, filterBar, menuEntries, toolActions, toolbarExtra, sidebar, uploadOptions, uploadExtra: docTypeSelect(false), flatSource, viewTitle, viewBar, dialogs, changed };
};
