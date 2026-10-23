import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, Bot, ChevronLeft, ChevronRight, History as HistoryIcon, Lock, RefreshCw, RotateCcw, User as UserIcon } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesHistory } from '@/i18n/pagesHistory';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorBlock } from '@/components/admin/ui';
import { fmtDateTime, fmtRelative, roleLabel } from '@/components/admin/labels';
import { RevertDialog, type RevertTarget } from './RevertDialog';
import {
  CHANGE_SOURCES,
  ENTITY_FIELDS,
  HISTORY_ENTITIES,
  SOURCE_TONE,
  entityLabel,
  fieldLabel,
  formatValue,
  groupByRequest,
  sourceLabel,
  useHistory,
  type ChangeSource,
  type HistoryEntity,
  type HistoryFilters,
  type HistoryItem,
} from './shared';

registerCopy(pagesHistory);

const entityLink = (it: HistoryItem) =>
  it.entity === 'CASE' ? `/admin/cases/${it.entityId}` : it.entity === 'COMPANY' ? `/admin/companies?id=${it.entityId}` : `/admin/history?entity=USER&entityId=${it.entityId}`;

const ChangeLine = ({ it, showEntity, onRevert }: { it: HistoryItem; showEntity: boolean; onRevert: (it: HistoryItem) => void }) => {
  const { t } = useTranslation();
  const reverted = !!it.revertedAt;
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm break-words">
          {showEntity && (
            <Link to={entityLink(it)} className="mr-1.5 font-semibold text-brand-700 hover:underline">
              {it.entityLabel ?? `${entityLabel(it.entity)} #${it.entityId.slice(-6)}`}:
            </Link>
          )}
          <span className="font-semibold text-navy-900">{fieldLabel(it.field)}</span>
          {it.sensitive && <Lock className="mx-1 inline size-3 text-muted" aria-label={t('history.masked')} />}
          <span className="text-ink/70">: </span>
          <span className={clsx('text-ink/70', reverted && 'line-through decoration-ink/30')}>{formatValue(it, it.oldValue, it.oldLabel)}</span>
          <ArrowRight className="mx-1 inline size-3.5 text-muted" aria-hidden />
          <span className={clsx('font-medium text-navy-900', reverted && 'line-through decoration-ink/30')}>{formatValue(it, it.newValue, it.newLabel)}</span>
        </p>
        {(reverted || it.revertOfId) && (
          <p className="mt-0.5 flex flex-wrap gap-1.5">
            {reverted && <span className="badge bg-amber-100 text-amber-800">{t('history.reverted')}</span>}
            {it.revertOfId && <span className="badge bg-surface text-muted">{t('history.isRevert')}</span>}
          </p>
        )}
      </div>
      {it.canRevert && (
        <button
          type="button"
          className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand-600 hover:bg-brand-50"
          onClick={() => onRevert(it)}
          aria-label={t('history.revert.buttonAria', { field: fieldLabel(it.field) })}
        >
          <RotateCcw className="size-3.5" aria-hidden /> {t('history.revert.button')}
        </button>
      )}
    </li>
  );
};

/**
 * Field history timeline: changes grouped by request (who, when, source), each change "Field: old → new" with a
 * Revert button, a "Revert all" per group and filters. Used on the case page, in the user / company drawers and
 * on the global Admin → Changes page (`showEntity`).
 */
export const HistoryTimeline = ({
  entity,
  entityId,
  showEntity = false,
  showEntityFilter = false,
  pageSize = 30,
  initial = {},
}: {
  entity?: HistoryEntity;
  entityId?: string;
  showEntity?: boolean;
  showEntityFilter?: boolean;
  pageSize?: number;
  initial?: HistoryFilters;
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [filters, setFilters] = useState<HistoryFilters>(initial);
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<RevertTarget | null>(null);
  const effEntity = entity ?? filters.entity;
  const query: HistoryFilters = { ...filters, entity: effEntity, entityId: entityId ?? filters.entityId, page, pageSize };
  const { data, isLoading, isFetching, error, refetch } = useHistory(query);
  const groups = useMemo(() => groupByRequest(data?.items ?? []), [data]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const isAdmin = hasMinRole(user?.role, 'ADMIN');

  // Actors seen so far (the API resolves names; a filter list without an extra endpoint).
  const [actors, setActors] = useState<Record<string, string>>({});
  useEffect(() => {
    const seen = data?.items.filter((i) => i.actor);
    if (!seen?.length) return;
    setActors((prev) => {
      if (seen.every((i) => prev[i.actor!.id])) return prev;
      const next = { ...prev };
      for (const i of seen) next[i.actor!.id] ??= i.actor!.name ?? t('history.unknownActor');
      return next;
    });
  }, [data, t]);

  const set = (patch: Partial<HistoryFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const fieldOptions = effEntity ? ENTITY_FIELDS[effEntity] : [...new Set(HISTORY_ENTITIES.flatMap((e) => ENTITY_FIELDS[e]))];
  const filtered = !!(filters.field || filters.actorId || filters.source || filters.from || filters.to || (!entity && filters.entity));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        {showEntityFilter && !entity && (
          <label className="min-w-0 flex-1 basis-32">
            <span className="label">{t('history.filters.entity')}</span>
            <select className="input" value={filters.entity ?? ''} onChange={(e) => set({ entity: (e.target.value || undefined) as HistoryEntity | undefined, field: undefined })}>
              <option value="">{t('history.filters.all')}</option>
              {HISTORY_ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {entityLabel(e)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="min-w-0 flex-1 basis-36">
          <span className="label">{t('history.filters.field')}</span>
          <select className="input" value={filters.field ?? ''} onChange={(e) => set({ field: e.target.value || undefined })}>
            <option value="">{t('history.filters.all')}</option>
            {fieldOptions.map((f) => (
              <option key={f} value={f}>
                {fieldLabel(f)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1 basis-36">
          <span className="label">{t('history.filters.actor')}</span>
          <select className="input" value={filters.actorId ?? ''} onChange={(e) => set({ actorId: e.target.value || undefined })}>
            <option value="">{t('history.filters.all')}</option>
            {Object.entries(actors).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1 basis-32">
          <span className="label">{t('history.filters.source')}</span>
          <select className="input" value={filters.source ?? ''} onChange={(e) => set({ source: (e.target.value || undefined) as ChangeSource | undefined })}>
            <option value="">{t('history.filters.all')}</option>
            {CHANGE_SOURCES.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s)}
              </option>
            ))}
          </select>
        </label>
        {showEntityFilter && (
          <>
            <label className="min-w-0 flex-1 basis-32">
              <span className="label">{t('history.filters.from')}</span>
              <input type="date" className="input" value={filters.from?.slice(0, 10) ?? ''} onChange={(e) => set({ from: e.target.value ? `${e.target.value}T00:00:00` : undefined })} />
            </label>
            <label className="min-w-0 flex-1 basis-32">
              <span className="label">{t('history.filters.to')}</span>
              <input type="date" className="input" value={filters.to?.slice(0, 10) ?? ''} onChange={(e) => set({ to: e.target.value ? `${e.target.value}T23:59:59` : undefined })} />
            </label>
          </>
        )}
        <div className="flex gap-1">
          {filtered && (
            <button type="button" className="btn-white btn-sm min-h-10 border border-line" onClick={() => { setFilters(initial); setPage(1); }}>
              {t('history.filters.reset')}
            </button>
          )}
          <button type="button" className="btn-white btn-sm min-h-10 border border-line" onClick={() => refetch()} aria-label={t('history.refresh')} title={t('history.refresh')}>
            <RefreshCw className={clsx('size-3.5', isFetching && 'animate-spin')} aria-hidden />
          </button>
        </div>
      </div>

      {!isAdmin && <p className="text-xs text-muted">{t('history.readOnly')}</p>}

      {isLoading ? (
        <div className="grid min-h-32 place-items-center text-brand-600">
          <Spinner className="size-6" />
        </div>
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !groups.length ? (
        <EmptyState icon={HistoryIcon} title={filtered ? t('history.emptyFiltered') : t('history.empty')} />
      ) : (
        <ol className="relative space-y-3 border-l border-line pl-4">
          {groups.map((g) => {
            const first = g.items[0]!;
            const revertable = g.items.filter((i) => i.canRevert);
            const ActorIcon = first.source === 'ai' || first.source === 'automation' || first.source === 'system' ? Bot : UserIcon;
            return (
              <li key={g.key} className="relative rounded-lg border border-line bg-white px-3 py-2.5 sm:px-4">
                <span className="absolute top-4 -left-[1.4rem] size-2.5 rounded-full border-2 border-white bg-brand-500" aria-hidden />
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <ActorIcon className="size-3.5 text-muted" aria-hidden />
                    <span className="font-semibold text-navy-900">{first.actor ? first.actor.name ?? t('history.unknownActor') : t('history.system')}</span>
                    {first.actor?.role && <span className="text-muted">· {roleLabel(first.actor.role)}</span>}
                    <span className={clsx('badge', SOURCE_TONE[first.source] ?? 'bg-surface text-muted')}>{sourceLabel(first.source)}</span>
                    <time className="text-muted" dateTime={first.createdAt} title={fmtDateTime(first.createdAt)}>
                      {fmtRelative(first.createdAt)}
                    </time>
                    {g.items.length > 1 && <span className="text-muted">· {t('history.changes', { count: g.items.length })}</span>}
                  </p>
                  {g.requestId && revertable.length > 1 && (
                    <button
                      type="button"
                      className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand-600 hover:bg-brand-50"
                      onClick={() =>
                        setTarget({ kind: 'group', requestId: g.requestId!, items: g.items, scope: entityId ? { entity: effEntity, entityId } : {} })
                      }
                    >
                      <RotateCcw className="size-3.5" aria-hidden /> {t('history.revert.all')}
                    </button>
                  )}
                </div>
                <ul className="mt-1 divide-y divide-line/70">
                  {g.items.map((it) => (
                    <ChangeLine key={it.id} it={it} showEntity={showEntity} onRevert={(i) => setTarget({ kind: 'one', item: i })} />
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}

      {data && data.total > data.pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>
            {t('history.pageOf', { page, pages })} · {t('history.total', { count: data.total })}
          </span>
          <span className="flex gap-1">
            <button type="button" className="btn-white btn-sm min-h-10 border border-line" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-3.5" aria-hidden /> {t('history.prev')}
            </button>
            <button type="button" className="btn-white btn-sm min-h-10 border border-line" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              {t('history.next')} <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </span>
        </div>
      )}

      <RevertDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
};
