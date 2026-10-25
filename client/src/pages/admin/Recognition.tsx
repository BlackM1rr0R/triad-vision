import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesRecognition } from '@/i18n/pagesRecognition';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, StatTile } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { toastError } from '@/components/admin/labels';
import { TONE_CLASS } from '@/components/ui/status';
import { DeadlineChip } from '@/components/recognition/RecognitionPanel';
import { PROCEDURE_TYPES, RECOGNITION_STATUSES, STATUS_TONE, type RecognitionList } from '@/components/recognition/api';

registerCopy(pagesRecognition);

const FILTERS = ['open', 'soon', 'all'] as const;
type Filter = (typeof FILTERS)[number];

/** /admin/recognition — every recognition procedure (Anerkennung) with status / authority / deadline filters and counts. */
export default function AdminRecognition() {
  const { t } = useTranslation();
  usePageTitle(t('recognition.list.title'));
  const [params, setParams] = useSearchParams();
  const soonParam = params.get('soon');
  const filter: Filter = soonParam ? 'soon' : (FILTERS as readonly string[]).includes(params.get('filter') ?? '') ? (params.get('filter') as Filter) : 'open';
  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';
  const authority = params.get('authority') ?? '';
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const query = {
    status: status || (filter === 'all' || filter === 'soon' ? 'all' : 'open'),
    ...(filter === 'soon' ? { soon: Number(soonParam) || 14 } : {}),
    ...(type ? { type } : {}),
    ...(authority ? { authority } : {}),
  };
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-recognition', query],
    queryFn: async () => (await api.get<RecognitionList>('/admin/recognition', { params: query })).data,
    placeholderData: keepPreviousData,
  });
  const chooseFilter = (f: Filter) => {
    const next = new URLSearchParams(params);
    next.delete('soon');
    next.delete('filter');
    if (f === 'soon') next.set('soon', '14');
    else if (f !== 'open') next.set('filter', f);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHead title={t('recognition.list.title')} subtitle={t('recognition.list.subtitle')} />
      {data && (
        <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-xl">
          <StatTile label={t('recognition.list.counts.open')} value={data.counts.open} />
          <StatTile label={t('recognition.list.counts.overdue')} value={data.counts.overdue} tone={data.counts.overdue ? 'danger' : undefined} />
          <StatTile label={t('recognition.list.counts.soon')} value={data.counts.soon} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => chooseFilter(f)}>
            {t(`recognition.list.filters.${f}`)}
          </Chip>
        ))}
        <select className="input w-auto py-1.5 text-xs" aria-label={t('recognition.list.allStatuses')} value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">{t('recognition.list.allStatuses')}</option>
          {RECOGNITION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`recognition.status.${s}`)} {data?.counts.byStatus[s] ? `(${data.counts.byStatus[s]})` : ''}
            </option>
          ))}
        </select>
        <select className="input w-auto py-1.5 text-xs" aria-label={t('recognition.list.allTypes')} value={type} onChange={(e) => setParam('type', e.target.value)}>
          <option value="">{t('recognition.list.allTypes')}</option>
          {PROCEDURE_TYPES.map((p) => (
            <option key={p} value={p}>
              {t(`recognition.procedure.${p}`)}
            </option>
          ))}
        </select>
        <select className="input w-auto max-w-[16rem] py-1.5 text-xs" aria-label={t('recognition.list.authority')} value={authority} onChange={(e) => setParam('authority', e.target.value)}>
          <option value="">{t('recognition.list.allAuthorities')}</option>
          {(data?.authorities ?? []).map((a) => (
            <option key={a.name} value={a.name}>
              {a.name} ({a.count})
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
          <EmptyState icon={GraduationCap} title={t('recognition.list.empty')} />
        </div>
      ) : (
        <ul className={clsx('divide-y divide-line rounded-xl border border-line bg-card', isFetching && 'opacity-70')}>
          {data.items.map((r) => (
            <li key={r.id} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,8rem)_minmax(0,12rem)] lg:items-center">
              <div className="min-w-0">
                <Link to={`/admin/cases/${r.case.id}#case-recognition`} className="font-semibold text-link hover:underline">
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
                  <span className="font-medium text-ink">{t(`recognition.procedure.${r.procedureType}`)}</span>
                  <span className={clsx('badge', TONE_CLASS[STATUS_TONE[r.status]])}>{t(`recognition.status.${r.status}`)}</span>
                </p>
                <p className="truncate text-xs text-ink/80">{[r.profession, r.authority, r.federalState, r.reference].filter(Boolean).join(' · ')}</p>
                {r.adaptationMeasure && <p className="truncate text-xs text-warning-fg">{t(`recognition.measure.${r.adaptationMeasure}`)}</p>}
              </div>
              <p className="text-xs">
                <span className="text-muted">{t('recognition.list.progress')}: </span>
                <span className="font-medium text-ink tabular-nums">
                  {r.progress.done}/{r.progress.total}
                </span>
              </p>
              <div className="text-xs">
                {r.deadline ? (
                  <>
                    <DeadlineChip at={r.deadline.at} />
                    {r.nextDeadlineNote && <p className="mt-0.5 truncate text-muted">{r.nextDeadlineNote}</p>}
                  </>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ReminderSettings />
    </div>
  );
}

/** ADMIN+: reminder lead time of the deadline job (shared by recognition and § 81a). */
const ReminderSettings = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['recognition-settings'], queryFn: async () => (await api.get<{ settings: { enabled: boolean; leadDays: number } }>('/admin/recognition/settings')).data.settings, enabled: isAdmin });
  const [enabled, setEnabled] = useState(true);
  const [leadDays, setLeadDays] = useState(7);
  useEffect(() => {
    if (q.data) {
      setEnabled(q.data.enabled);
      setLeadDays(q.data.leadDays);
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: async () => api.put('/admin/recognition/settings', { enabled, leadDays }),
    onSuccess: () => (toast.success(t('recognition.list.settingsSaved')), qc.invalidateQueries({ queryKey: ['recognition-settings'] })),
    onError: (e) => toastError(e),
  });
  if (!isAdmin || !q.data) return null;
  return (
    <form
      className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="w-full text-sm font-semibold text-ink">{t('recognition.list.settings')}</p>
      <p className="w-full text-xs text-muted">{t('recognition.deadline.reminderHint', { days: leadDays })}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {t('recognition.list.enabled')}
      </label>
      <label className="block">
        <span className="label">{t('recognition.list.leadDays')}</span>
        <input type="number" min={1} max={60} className="input w-24" value={leadDays} onChange={(e) => setLeadDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
      </label>
      <button type="submit" className="btn-secondary btn-sm" disabled={save.isPending || (enabled === q.data.enabled && leadDays === q.data.leadDays)}>
        {t('admin.common.save')}
      </button>
    </form>
  );
};
