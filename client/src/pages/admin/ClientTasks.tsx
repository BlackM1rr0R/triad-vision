import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { BellRing, CheckCircle2, ClipboardList, Search, Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { cpKeys, STATE_TONE, useCpError, type StaffTaskView } from '@/components/clientProcess/api';

const FILTERS = ['overdue', 'due_soon', 'open', 'done', 'all'] as const;
type Filter = (typeof FILTERS)[number];
const ETA_STATUSES = ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'] as const;
type Eta = { minHours: number; maxHours: number };
type SettingsResponse = { settings: { eta: Record<string, Eta>; useCategoryProcessing: boolean } };

/** ADMIN+: typical durations shown to clients as the ETA. */
const EtaSettings = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useCpError('admin');
  const { data } = useQuery({ queryKey: cpKeys.settings, queryFn: async () => (await api.get<SettingsResponse>('/admin/client-process/settings')).data.settings });
  const [eta, setEta] = useState<Record<string, Eta>>({});
  const [useCategory, setUseCategory] = useState(true);
  useEffect(() => {
    if (data) {
      setEta(data.eta);
      setUseCategory(data.useCategoryProcessing);
    }
  }, [data]);
  const save = useMutation({
    mutationFn: () => api.put('/admin/client-process/settings', { eta, useCategoryProcessing: useCategory }),
    onSuccess: () => {
      toast.success(t('cp.settings.saved'));
      void qc.invalidateQueries({ queryKey: cpKeys.settings });
    },
    onError,
  });
  if (!data) return null;
  const set = (s: string, k: keyof Eta, v: string) => setEta((cur) => ({ ...cur, [s]: { ...cur[s], [k]: Math.max(1, Number(v) || 1) } }));
  return (
    <Panel title={t('cp.settings.title')} icon={Timer}>
      <p className="mb-4 text-sm text-muted">{t('cp.settings.subtitle')}</p>
      <div className="space-y-3">
        {ETA_STATUSES.map((s) => (
          <div key={s} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
            <p className="col-span-2 text-sm font-semibold text-navy-900 sm:col-span-1">{t(`cp.settings.status.${s}`)}</p>
            <label className="block">
              <span className="label">{t('cp.settings.min')}</span>
              <input type="number" min={1} className="input" value={eta[s]?.minHours ?? ''} onChange={(e) => set(s, 'minHours', e.target.value)} />
            </label>
            <label className="block">
              <span className="label">{t('cp.settings.max')}</span>
              <input type="number" min={1} className="input" value={eta[s]?.maxHours ?? ''} onChange={(e) => set(s, 'maxHours', e.target.value)} />
            </label>
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useCategory} onChange={(e) => setUseCategory(e.target.checked)} /> {t('cp.settings.useCategory')}
        </label>
        <button type="button" className="btn-primary btn-sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {t('cp.settings.save')}
        </button>
      </div>
    </Panel>
  );
};

type ListResponse = { tasks: StaffTaskView[]; total: number; pageSize: number; counts: { overdue: number; dueSoon: number; open: number } };

/** /admin/client-tasks — client tasks across all cases (overdue / due soon first). */
export default function ClientTasks() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const onError = useCpError('admin');
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS as readonly string[]).includes(params.get('filter') ?? '') ? (params.get('filter') as Filter) : 'overdue';
  const mine = params.get('mine') === '1';
  const [search, setSearch] = useState('');
  const q = new URLSearchParams({ filter, ...(mine ? { mine: '1' } : {}), ...(search.trim() ? { search: search.trim() } : {}) }).toString();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: cpKeys.allTasks(q),
    queryFn: async () => (await api.get<ListResponse>(`/admin/client-process/tasks?${q}`)).data,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'client-process', 'tasks'] });
  const remind = useMutation({ mutationFn: (id: string) => api.post(`/admin/client-process/tasks/${id}/remind`), onSuccess: () => toast.success(t('cp.tasks.reminded')), onError });
  const done = useMutation({ mutationFn: (id: string) => api.patch(`/admin/client-process/tasks/${id}`, { status: 'DONE' }), onSuccess: refresh, onError });
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };
  const count = (f: Filter) => (f === 'overdue' ? data?.counts.overdue : f === 'due_soon' ? data?.counts.dueSoon : f === 'open' ? data?.counts.open : undefined);

  return (
    <div className="space-y-6">
      <PageHead title={t('cp.page.title')} subtitle={t('cp.page.subtitle')} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist">
          {FILTERS.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setParam('filter', f)}>
              {t(`cp.page.filter.${f}`)}
              {count(f) !== undefined && ` · ${count(f)}`}
            </Chip>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mine} onChange={(e) => setParam('mine', e.target.checked ? '1' : null)} /> {t('cp.page.mine')}
          </label>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input min-h-9 py-1.5 pl-9 sm:w-72" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('cp.page.search')} aria-label={t('cp.page.search')} />
          </label>
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : data.tasks.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t('cp.page.empty')} />
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {data.tasks.map((task) => (
              <li key={task.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/admin/cases/${task.caseId}#client-tasks`} className="font-semibold break-words text-navy-900 hover:text-brand-700">
                      {task.rawTitle}
                    </Link>
                    <span className={clsx('badge', STATE_TONE[task.state])}>{t(`cp.tasks.state.${task.state}`)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {task.client.name} · {task.caseNumber}
                    {task.assignedStaff && ` · ${t('cp.page.col.manager')}: ${task.assignedStaff.name}`}
                  </p>
                </div>
                <p className={clsx('text-sm whitespace-nowrap', task.state === 'overdue' ? 'font-semibold text-red-600' : 'text-muted')}>
                  {task.dueAt ? fmtDate(task.dueAt) : t('cp.tasks.noDue')}
                </p>
                {task.status === 'OPEN' && (
                  <div className="flex gap-1.5">
                    <button type="button" className="btn-white btn-sm border border-line" onClick={() => remind.mutate(task.id)}>
                      <BellRing className="size-3.5" aria-hidden /> {t('cp.tasks.remind')}
                    </button>
                    <button type="button" className="btn-white btn-sm border border-line" onClick={() => done.mutate(task.id)}>
                      <CheckCircle2 className="size-3.5" aria-hidden /> {t('cp.tasks.markDone')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && <EtaSettings />}
    </div>
  );
}
