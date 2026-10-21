import { useMemo, useState, type DragEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRightLeft, Briefcase, Columns3, Filter, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { ContextMenu, type MenuPosition } from '../ContextMenu';
import { DRIVE_DRAG_TYPE, draggingItems, endItemDrag, startItemDrag } from '../dnd';
import { ItemIcon } from '../fileIcons';
import { invalidateDrive, reportBatch, toastDriveError } from '../api';
import { can, WORKFLOW_STAGES, type DriveItem, type WorkflowStage } from '../types';
import { daysSince, fetchBoard, fetchTags, orgKeys, setStage, type BoardFilters } from './api';
import { FinalBadge, TagChips } from './Chips';
import { STAGE_TONE } from './SmallDialogs';

interface Props {
  /** The folder the explorer shows (scope "this folder", recursive); null = whole drive only. */
  folderId: string | null;
  folderName?: string;
  onOpen: (item: DriveItem) => void;
  onOpenFolder: (id: string) => void;
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

/**
 * Workflow board ("Lövhə"): documents by stage — Gələn → Yoxlanılır → Tərcümədə → Apostildə → Hazır →
 * Səfirliyə göndərildi. Cards move by drag & drop or with the stage menu on each card (keyboard).
 */
export default function BoardView({ folderId, folderName, onOpen, onOpenFolder }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [scope, setScope] = useState<'folder' | 'all'>(folderId ? 'folder' : 'all');
  const [filters, setFilters] = useState<Omit<BoardFilters, 'folderId'>>({});
  const [showFilters, setShowFilters] = useState(false);
  const params: BoardFilters = { ...filters, ...(scope === 'folder' && folderId ? { folderId } : {}) };
  const board = useQuery({ queryKey: orgKeys.board(params), queryFn: () => fetchBoard(params), placeholderData: keepPreviousData, staleTime: 15_000 });
  const tags = useQuery({ queryKey: orgKeys.tags, queryFn: fetchTags, staleTime: 60_000 });
  const [over, setOver] = useState<WorkflowStage | null>(null);
  const [menu, setMenu] = useState<{ at: MenuPosition; item: DriveItem } | null>(null);

  const items = board.data?.items ?? [];
  const byStage = useMemo(() => {
    const m = new Map<WorkflowStage, DriveItem[]>(WORKFLOW_STAGES.map((s) => [s, []]));
    for (const i of items) if (i.workflowStage) m.get(i.workflowStage)?.push(i);
    return m;
  }, [items]);
  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) if (i.client) m.set(i.client.caseId, i.client.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) if (i.createdBy) m.set(i.createdBy.id, fullName(i.createdBy));
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const move = useMutation({
    mutationFn: ({ ids, stage }: { ids: string[]; stage: WorkflowStage }) => setStage(ids, stage),
    onMutate: ({ ids, stage }) => {
      // Optimistic: the card jumps right away; the refetch confirms.
      qc.setQueryData(orgKeys.board(params), (old: typeof board.data) =>
        old ? { ...old, items: old.items.map((i) => (ids.includes(i.id) ? { ...i, workflowStage: stage, workflowAt: new Date().toISOString() } : i)) } : old,
      );
    },
    onSuccess: (r) => {
      if (r.failed) reportBatch(r.results, 'driveOrg.stage.moved');
    },
    onError: toastDriveError,
    onSettled: () => void invalidateDrive(qc),
  });

  const accepts = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(DRIVE_DRAG_TYPE) && !!draggingItems()?.length;
  const dropOn = (stage: WorkflowStage) => ({
    onDragOver: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== stage) setOver(stage);
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
    },
    onDrop: (e: DragEvent) => {
      setOver(null);
      const dragged = draggingItems() ?? [];
      endItemDrag();
      if (!dragged.length) return;
      e.preventDefault();
      const ids = dragged.filter((i) => i.workflowStage !== stage && can(i.myAccess, 'EDIT')).map((i) => i.id);
      if (ids.length) move.mutate({ ids, stage });
    },
  });

  const setFilter = (k: keyof BoardFilters, v: string) => setFilters((f) => ({ ...f, [k]: v || undefined }));
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line/70 px-3 py-2 text-xs sm:px-4">
        <Columns3 className="size-4 text-brand-600" aria-hidden />
        <span className="font-semibold text-ink">{t('driveOrg.board.title')}</span>
        {folderId && (
          <div className="flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label={t('driveOrg.board.scope')}>
            {(['folder', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={scope === s}
                onClick={() => setScope(s)}
                className={clsx('max-w-[14rem] truncate rounded-md px-2 py-0.5 font-semibold', scope === s ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink')}
              >
                {s === 'folder' ? t('driveOrg.board.thisFolder', { name: folderName ?? '' }) : t('driveOrg.board.all')}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setShowFilters((x) => !x)} className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold', showFilters || activeFilters ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-muted hover:text-ink')} aria-expanded={showFilters}>
          <Filter className="size-3.5" /> {t('driveOrg.board.filters')}
          {activeFilters > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] text-white">{activeFilters}</span>}
        </button>
        {activeFilters > 0 && (
          <button type="button" onClick={() => setFilters({})} className="inline-flex items-center gap-1 text-muted hover:text-ink">
            <X className="size-3.5" /> {t('driveOrg.board.clearFilters')}
          </button>
        )}
        <span className="ml-auto text-muted">{t('driveOrg.board.count', { count: items.length })}</span>
        {board.isFetching && <Spinner className="size-3.5" />}
      </div>
      {showFilters && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line/70 bg-surface/60 px-3 py-2 text-xs sm:px-4">
          <select className="input !w-auto !py-1 !text-xs" value={filters.tagId ?? ''} onChange={(e) => setFilter('tagId', e.target.value)} aria-label={t('driveOrg.board.tag')}>
            <option value="">{t('driveOrg.board.anyTag')}</option>
            {(tags.data?.tags ?? []).map((tg) => (
              <option key={tg.id} value={tg.id}>
                {tg.name}
              </option>
            ))}
          </select>
          <select className="input !w-auto max-w-[14rem] !py-1 !text-xs" value={filters.caseId ?? ''} onChange={(e) => setFilter('caseId', e.target.value)} aria-label={t('driveOrg.board.client')}>
            <option value="">{t('driveOrg.board.anyClient')}</option>
            {clients.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select className="input !w-auto !py-1 !text-xs" value={filters.uploadedById ?? ''} onChange={(e) => setFilter('uploadedById', e.target.value)} aria-label={t('driveOrg.board.uploadedBy')}>
            <option value="">{t('driveOrg.board.anyone')}</option>
            {people.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-muted">
            {t('driveOrg.board.from')}
            <input type="date" className="input !w-auto !py-1 !text-xs" value={filters.from ?? ''} onChange={(e) => setFilter('from', e.target.value)} />
          </label>
          <label className="flex items-center gap-1 text-muted">
            {t('driveOrg.board.to')}
            <input type="date" className="input !w-auto !py-1 !text-xs" value={filters.to ?? ''} onChange={(e) => setFilter('to', e.target.value)} />
          </label>
        </div>
      )}
      {board.isLoading ? (
        <div className="grid flex-1 place-items-center">
          <Spinner className="size-6" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto overscroll-contain p-3 sm:p-4">
          {WORKFLOW_STAGES.map((stage) => {
            const cards = byStage.get(stage) ?? [];
            return (
              <section
                key={stage}
                aria-label={t(`driveOrg.stage.${stage}`)}
                {...dropOn(stage)}
                className={clsx('flex w-64 shrink-0 flex-col rounded-xl border bg-surface/60 transition-colors', over === stage ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-line')}
              >
                <header className="flex items-center gap-2 px-3 py-2">
                  <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-bold', STAGE_TONE[stage])}>{t(`driveOrg.stage.${stage}`)}</span>
                  <span className="ml-auto text-xs font-semibold text-muted tabular-nums">{cards.length}</span>
                </header>
                <ul className="min-h-16 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {cards.map((item) => {
                    const days = daysSince(item.workflowAt);
                    const editable = can(item.myAccess, 'EDIT');
                    return (
                      <li
                        key={item.id}
                        draggable={editable}
                        onDragStart={(e) => startItemDrag(e, [item])}
                        onDragEnd={endItemDrag}
                        onDoubleClick={() => onOpen(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onOpen(item);
                        }}
                        tabIndex={0}
                        className="group rounded-lg border border-line bg-card p-2.5 shadow-sm outline-none hover:border-brand-300 focus-visible:ring-2 focus-visible:ring-brand-500/50"
                      >
                        <div className="flex items-start gap-2">
                          <ItemIcon item={item} className="mt-0.5 size-5 shrink-0" />
                          <span className="min-w-0 flex-1 text-[13px] leading-snug font-medium break-words text-ink">{item.name}</span>
                          {editable && (
                            <button
                              type="button"
                              className="grid size-6 shrink-0 place-items-center rounded-md text-muted opacity-60 hover:bg-surface hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                              aria-label={t('driveOrg.stage.change')}
                              title={t('driveOrg.stage.change')}
                              onClick={(e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                setMenu({ at: { x: r.left, y: r.bottom + 2 }, item });
                              }}
                            >
                              <ArrowRightLeft className="size-3.5" />
                            </button>
                          )}
                        </div>
                        {item.client && (
                          <button type="button" onClick={() => onOpenFolder(item.client!.folderId)} className="mt-1 flex max-w-full items-center gap-1 truncate text-[11px] font-semibold text-violet-700 hover:underline dark:text-violet-300" title={item.client.name}>
                            <Briefcase className="size-3 shrink-0" aria-hidden />
                            <span className="truncate">{item.client.name}</span>
                          </button>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <FinalBadge item={item} compact />
                          <TagChips tags={item.tags} max={3} />
                          <span className={clsx('ml-auto text-[10px] font-semibold tabular-nums', days >= 7 ? 'text-danger' : 'text-muted')} title={t('driveOrg.board.ageHint')}>
                            {t('driveOrg.board.age', { count: days })}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                  {!cards.length && <li className="px-1 py-4 text-center text-[11px] text-muted">{t('driveOrg.board.emptyColumn')}</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {board.data?.truncated && <p className="shrink-0 px-4 pb-2 text-xs text-muted">{t('driveOrg.board.truncated')}</p>}
      <ContextMenu
        open={!!menu}
        at={menu?.at ?? null}
        label={t('driveOrg.stage.change')}
        onClose={() => setMenu(null)}
        items={WORKFLOW_STAGES.map((s) => ({
          id: s,
          label: t(`driveOrg.stage.${s}`),
          active: menu?.item.workflowStage === s,
          disabled: menu?.item.workflowStage === s,
          onSelect: () => menu && move.mutate({ ids: [menu.item.id], stage: s }),
        }))}
      />
    </div>
  );
}
