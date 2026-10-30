import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRightLeft, GripVertical, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { fmtRelative, fullName } from '@/components/admin/labels';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { TONE_TEXT } from '@/components/ui/status';
import { ContextMenu, type MenuEntry, type MenuPosition } from '@/components/drive/ContextMenu';
import { PROCESSING_STAGES, STAGE_TONE, stageLabel, type BoardColumn, type BoardItem, type ProcessingStage } from './api';
import { STAGE_KIND, endCaseDrag, startCaseDrag, useFlowActions, useStageDrop, type FlowAction, type FlowTarget } from './flow';
import { MoveStageDialog } from './parts';

const targetOf = (c: BoardItem): FlowTarget => ({ caseId: c.id, name: fullName(c.client), number: c.number, stage: c.processing.stage, assigneeId: c.processing.assignee?.id ?? null });

const Card = ({ c, onMenu }: { c: BoardItem; onMenu: (at: MenuPosition) => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return (
    <li
      draggable
      onDragStart={(e) => startCaseDrag(e, [targetOf(c)])}
      onDragEnd={endCaseDrag}
      className="group cursor-grab rounded-lg border border-line bg-card p-3 shadow-sm transition hover:border-line-strong active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <GripVertical className="mt-0.5 -ml-1 size-3.5 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" aria-hidden />
        <Link to={`/admin/cases/${c.id}#case-processing`} className="min-w-0 flex-1" draggable={false}>
          <span className="block code-id text-[11px] font-medium text-link">{c.number}</span>
          <span className="block truncate text-sm font-semibold text-ink hover:text-link">{fullName(c.client)}</span>
        </Link>
        <button
          type="button"
          className="btn-secondary btn-sm shrink-0 !px-2"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onMenu({ x: r.left, y: r.bottom + 4 });
          }}
          title={t('caseProcessing.board.moveMenu')}
          aria-label={t('caseProcessing.board.moveMenu')}
          aria-haspopup="menu"
        >
          <ArrowRightLeft className="size-3.5" aria-hidden />
        </button>
      </div>
      <p className="mt-1 truncate text-xs text-muted">
        {c.visaCategory ? tr(c.visaCategory.title) : t(`refPartners.visa.types.${c.visaType}`, { defaultValue: c.visaType })}
        {c.partner && ` · ${c.partner.name}`}
      </p>
      {c.processing.assignee && <p className="mt-1 truncate text-[11px] font-medium text-ink/80">{t('caseProcessing.assignedTo', { name: c.processing.assignee.name })}</p>}
      {c.processing.by && c.processing.at && (
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {c.processing.by.name} · {fmtRelative(c.processing.at)}
        </p>
      )}
      {c.lastNote && <p className="mt-1.5 line-clamp-2 rounded bg-sunken px-2 py-1 text-[11px] text-ink/80" title={c.lastNote}>“{c.lastNote}”</p>}
    </li>
  );
};

const Column = ({
  col,
  onShowStage,
  onDrop,
  onMenu,
}: {
  col: BoardColumn;
  onShowStage: (stage: string) => void;
  onDrop: (stage: ProcessingStage, targets: FlowTarget[]) => void;
  onMenu: (c: BoardItem, at: MenuPosition) => void;
}) => {
  const { t } = useTranslation();
  const drop = useStageDrop(col.stage, (targets) => onDrop(col.stage, targets));
  return (
    <section
      aria-label={stageLabel(col.stage)}
      {...drop.handlers}
      className={clsx('flex min-w-0 flex-col rounded-xl border bg-sunken/60 p-2 transition', drop.over ? 'border-primary ring-2 ring-focus' : 'border-line')}
    >
      <header className="flex items-baseline justify-between gap-2 px-1.5 pt-1 pb-2">
        <h3 className={clsx('text-sm font-bold', TONE_TEXT[STAGE_TONE[col.stage]])} title={t(`caseProcessing.hints.${col.stage}`)}>
          {stageLabel(col.stage)}
        </h3>
        <span className="text-xs font-semibold text-muted tabular-nums">{col.total}</span>
      </header>
      {drop.over && <p className="mb-2 rounded-lg border border-dashed border-primary px-2 py-2 text-center text-xs font-semibold text-link">{t('caseProcessing.board.dropHere')}</p>}
      {col.items.length === 0 ? (
        <p className="px-1.5 py-4 text-center text-xs text-muted">{t('caseProcessing.board.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {col.items.map((c) => (
            <Card key={c.id} c={c} onMenu={(at) => onMenu(c, at)} />
          ))}
        </ul>
      )}
      {col.total > col.items.length && (
        <button type="button" className="mt-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-link hover:bg-card" onClick={() => onShowStage(col.stage)}>
          {t('caseProcessing.board.more', { count: col.total - col.items.length })}
        </button>
      )}
    </section>
  );
};

/**
 * Cases by team workflow stage (In Bearbeitung · Schon geschrieben · Fertig · Ablehnung) — the "board" view of
 * the cases list. Each column shows the newest moves; "+N more" opens the list filtered by that stage. Cards
 * are dragged between columns (native drag & drop; the drop asks for the note / next admin); the ⇄ menu is
 * the keyboard way: "Götür", the other stages, or the full stage dialog.
 */
export const ProcessingBoard = ({ partnerId, search, onShowStage }: { partnerId?: string; search?: string; onShowStage: (stage: string) => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [mine, setMine] = useState(false);
  const [moving, setMoving] = useState<BoardItem | null>(null);
  const [menu, setMenu] = useState<{ c: BoardItem; at: MenuPosition } | null>(null);
  const flow = useFlowActions('case');
  const q = useQuery({
    queryKey: ['case-processing-board', { partnerId, search, mine }],
    queryFn: async () =>
      (await api.get<{ columns: BoardColumn[] }>('/admin/case-processing/board', { params: { partnerId: partnerId || undefined, search: search || undefined, assignee: mine ? 'me' : undefined } })).data.columns,
    placeholderData: keepPreviousData,
  });
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;

  const menuEntries = (c: BoardItem): MenuEntry[] => {
    const x = targetOf(c);
    const out: MenuEntry[] = [];
    if (c.processing.stage === 'WRITTEN' && x.assigneeId !== user?.id) out.push({ id: 'claim', label: t('caseProcessing.claim'), onSelect: () => flow.act('claim', [x]) });
    out.push({ kind: 'heading', id: 'h', label: t('caseProcessing.board.moveMenu') });
    for (const s of PROCESSING_STAGES) {
      if (s === c.processing.stage) continue;
      const action: FlowAction = STAGE_KIND[s];
      out.push({ id: `to-${s}`, label: stageLabel(s), hint: t(`caseProcessing.hints.${s}`), danger: s === 'REFUSED', onSelect: () => flow.act(action, [x]) });
    }
    out.push({ kind: 'separator', id: 's' }, { id: 'full', label: t('caseProcessing.move'), onSelect: () => setMoving(c) });
    return out;
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">{t('caseProcessing.board.title')}</h2>
        <p className="hidden text-xs text-muted md:block">{t('caseProcessing.board.dragHint')}</p>
        <button
          type="button"
          aria-pressed={mine}
          onClick={() => setMine((v) => !v)}
          className={clsx(
            'ml-auto inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition sm:min-h-9',
            mine ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink/80 hover:border-line-strong',
          )}
        >
          <UserCheck className="size-4" aria-hidden /> {t('caseProcessing.board.mine')}
        </button>
      </div>
      <div className={clsx('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', q.isFetching && 'opacity-60')}>
        {q.data.map((col) => (
          <Column key={col.stage} col={col} onShowStage={onShowStage} onDrop={(stage, targets) => flow.act(STAGE_KIND[stage], targets)} onMenu={(c, at) => setMenu({ c, at })} />
        ))}
      </div>
      <ContextMenu open={!!menu} at={menu?.at ?? null} items={menu ? menuEntries(menu.c) : []} onClose={() => setMenu(null)} label={t('caseProcessing.board.moveMenu')} />
      {moving && <MoveStageDialog caseId={moving.id} open current={moving.processing.stage} onClose={() => setMoving(null)} />}
      {flow.dialogs}
    </div>
  );
};
