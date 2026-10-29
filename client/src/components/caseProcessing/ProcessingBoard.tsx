import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRightLeft, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { fmtRelative, fullName } from '@/components/admin/labels';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { TONE_TEXT } from '@/components/ui/status';
import { STAGE_TONE, stageLabel, type BoardColumn, type BoardItem } from './api';
import { MoveStageDialog } from './parts';

const Card = ({ c, onMove }: { c: BoardItem; onMove: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return (
    <li className="rounded-lg border border-line bg-card p-3 shadow-sm transition hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/admin/cases/${c.id}#case-processing`} className="min-w-0">
          <span className="block code-id text-[11px] font-medium text-link">{c.number}</span>
          <span className="block truncate text-sm font-semibold text-ink hover:text-link">{fullName(c.client)}</span>
        </Link>
        <button type="button" className="btn-secondary btn-sm shrink-0 !px-2" onClick={onMove} title={t('caseProcessing.move')} aria-label={t('caseProcessing.move')}>
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

/**
 * Cases by team workflow stage (In Bearbeitung · Schon geschrieben · Fertig · Ablehnung) — the "board" view of
 * the cases list. Each column shows the newest moves; "+N more" opens the list filtered by that stage.
 */
export const ProcessingBoard = ({ partnerId, search, onShowStage }: { partnerId?: string; search?: string; onShowStage: (stage: string) => void }) => {
  const { t } = useTranslation();
  const [mine, setMine] = useState(false);
  const [moving, setMoving] = useState<BoardItem | null>(null);
  const q = useQuery({
    queryKey: ['case-processing-board', { partnerId, search, mine }],
    queryFn: async () =>
      (await api.get<{ columns: BoardColumn[] }>('/admin/case-processing/board', { params: { partnerId: partnerId || undefined, search: search || undefined, assignee: mine ? 'me' : undefined } })).data.columns,
    placeholderData: keepPreviousData,
  });
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">{t('caseProcessing.board.title')}</h2>
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
          <section key={col.stage} aria-label={stageLabel(col.stage)} className="flex min-w-0 flex-col rounded-xl border border-line bg-sunken/60 p-2">
            <header className="flex items-baseline justify-between gap-2 px-1.5 pt-1 pb-2">
              <h3 className={clsx('text-sm font-bold', TONE_TEXT[STAGE_TONE[col.stage]])} title={t(`caseProcessing.hints.${col.stage}`)}>
                {stageLabel(col.stage)}
              </h3>
              <span className="text-xs font-semibold text-muted tabular-nums">{col.total}</span>
            </header>
            {col.items.length === 0 ? (
              <p className="px-1.5 py-4 text-center text-xs text-muted">{t('caseProcessing.board.empty')}</p>
            ) : (
              <ul className="space-y-2">
                {col.items.map((c) => (
                  <Card key={c.id} c={c} onMove={() => setMoving(c)} />
                ))}
              </ul>
            )}
            {col.total > col.items.length && (
              <button type="button" className="mt-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-link hover:bg-card" onClick={() => onShowStage(col.stage)}>
                {t('caseProcessing.board.more', { count: col.total - col.items.length })}
              </button>
            )}
          </section>
        ))}
      </div>
      {moving && <MoveStageDialog caseId={moving.id} open current={moving.processing.stage} onClose={() => setMoving(null)} />}
    </div>
  );
};
