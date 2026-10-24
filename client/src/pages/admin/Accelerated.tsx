import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Building2, Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesRecognition } from '@/i18n/pagesRecognition';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, StatTile } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { TONE_CLASS } from '@/components/ui/status';
import { DeadlineChip } from '@/components/recognition/RecognitionPanel';
import { ACCEL_PATH, type AcceleratedRow } from '@/components/recognition/api';

registerCopy(pagesRecognition);

const FILTERS = ['open', 'soon', 'all'] as const;
type Filter = (typeof FILTERS)[number];

interface List {
  items: AcceleratedRow[];
  counts: { byStatus: Record<string, number>; overdue: number; soon: number; feeOpen: number };
}

/** /admin/accelerated — § 81a accelerated procedures with step, employer and the nearest deadline. */
export default function AdminAccelerated() {
  const { t } = useTranslation();
  usePageTitle(t('accel.list.title'));
  const [params, setParams] = useSearchParams();
  const filter: Filter = params.get('soon') ? 'soon' : (FILTERS as readonly string[]).includes(params.get('filter') ?? '') ? (params.get('filter') as Filter) : 'open';
  const status = params.get('status') ?? '';
  const query = { status: status || (filter === 'all' ? 'all' : 'open'), ...(filter === 'soon' ? { soon: Number(params.get('soon')) || 7 } : {}) };
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-accelerated', query],
    queryFn: async () => (await api.get<List>('/admin/accelerated', { params: query })).data,
    placeholderData: keepPreviousData,
  });
  const chooseFilter = (f: Filter) => {
    const next = new URLSearchParams(params);
    next.delete('soon');
    next.delete('filter');
    if (f === 'soon') next.set('soon', '7');
    else if (f !== 'open') next.set('filter', f);
    setParams(next, { replace: true });
  };
  const setStatus = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set('status', v);
    else next.delete('status');
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHead title={t('accel.list.title')} subtitle={t('accel.list.subtitle')} />
      {data && (
        <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-xl">
          <StatTile label={t('accel.list.counts.overdue')} value={data.counts.overdue} tone={data.counts.overdue ? 'danger' : undefined} />
          <StatTile label={t('accel.list.counts.soon')} value={data.counts.soon} />
          <StatTile label={t('accel.list.counts.feeOpen')} value={data.counts.feeOpen} tone={data.counts.feeOpen ? 'warn' : undefined} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => chooseFilter(f)}>
            {t(`accel.list.filters.${f}`)}
          </Chip>
        ))}
        <select className="input w-auto py-1.5 text-xs" aria-label={t('recognition.list.allStatuses')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('recognition.list.allStatuses')}</option>
          {[...ACCEL_PATH, 'REJECTED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>
              {t(`accel.status.${s}`)} {data?.counts.byStatus[s] ? `(${data.counts.byStatus[s]})` : ''}
            </option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={Rocket} title={t('accel.list.empty')} />
        </div>
      ) : (
        <ul className={clsx('divide-y divide-line rounded-xl border border-line bg-card', isFetching && 'opacity-70')}>
          {data.items.map((r) => (
            <li key={r.id} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,14rem)] lg:items-center">
              <div className="min-w-0">
                <Link to={`/admin/cases/${r.case.id}#case-81a`} className="font-semibold text-brand-700 hover:underline">
                  {r.case.number}
                </Link>
                <p className="truncate text-xs text-muted">
                  {r.client.name}
                  {r.staff ? ` · ${r.staff.name}` : ''}
                </p>
                <StatusBadge status={r.case.status} />
              </div>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className={clsx('badge', TONE_CLASS[r.status === 'REJECTED' || r.status === 'CANCELLED' ? 'danger' : r.status === 'VISA_DECIDED' ? 'success' : 'info'])}>{t(`accel.status.${r.status}`)}</span>
                  {r.company && (
                    <span className="inline-flex min-w-0 items-center gap-1 text-xs text-ink/80">
                      <Building2 className="size-3.5 shrink-0 text-muted" aria-hidden /> <span className="truncate">{r.company.name}</span>
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">{[r.authority, r.reference].filter(Boolean).join(' · ')}</p>
                {r.todos.length > 0 && <p className="truncate text-xs text-warning-fg">{r.todos.map((x) => t(`accel.employerTodo.${x}`)).join(' · ')}</p>}
              </div>
              <div className="text-xs">
                {r.next ? (
                  <>
                    <p className="text-muted">{t(`accel.deadlines.kind.${r.next.kind}`)}</p>
                    <DeadlineChip at={r.next.at} />
                  </>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
