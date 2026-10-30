import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { FileBarChart2, Pencil, Plus, Timer, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { Tabs } from '@/components/ui/Tabs';
import { ACTIVITIES, fmtDuration, timeError, type Activity, type TimeEntry } from '@/components/timeCare/api';
import { EntryDialog } from '@/components/timeCare/EntryDialog';
import { confirmDialog } from '@/components/ui/ConfirmHost';

interface EntriesResponse {
  items: TimeEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalMinutes: number;
}
interface Summary {
  totalMinutes: number;
  entries: number;
  weeks: string[];
  byStaff: { userId: string; name: string; minutes: number; weeks: Record<string, number> }[];
  byCase: { caseId: string | null; number: string | null; clientName: string | null; minutes: number; entries: number }[];
  byActivity: { activity: Activity; minutes: number }[];
}
interface Rates {
  defaultCentsPerHour: number;
  staff: { id: string; name: string; role: string; isActive: boolean; current: number | null; history: { id: string; centsPerHour: number; effectiveFrom: string }[] }[];
}

const TABS = ['entries', 'reports', 'rates'] as const;
type Tab = (typeof TABS)[number];
const monthStart = () => {
  const d = new Date(Date.now() + 4 * 3600_000);
  return `${d.toISOString().slice(0, 8)}01`;
};

/** Admin → Vaxt uçotu: own / team entries, weekly reports, hourly rates (SUPER_ADMIN). */
export default function TimeTracking() {
  const { t } = useTranslation();
  usePageTitle(t('time.page.title'));
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'entries';
  const [filters, setFilters] = useState({ from: params.get('caseId') ? '' : monthStart(), to: '', userId: '', activity: '' as '' | Activity, caseId: params.get('caseId') ?? '' });
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p, { replace: true });
  };

  return (
    <div>
      <PageHead title={t('time.page.title')} subtitle={t('time.page.subtitle')} />
      <Tabs className="mb-4" label={t('time.page.title')} items={TABS.filter((x) => x !== 'rates' || isSuper).map((x) => ({ key: x, label: t(`time.page.tabs.${x}`) }))} value={tab} onChange={setTab} />
      {tab !== 'rates' && <Filters value={filters} onChange={setFilters} showStaff={isAdmin} />}
      {tab === 'entries' && <Entries filters={filters} isAdmin={isAdmin} />}
      {tab === 'reports' && <Reports filters={filters} isAdmin={isAdmin} />}
      {tab === 'rates' && isSuper && <RatesTab />}
    </div>
  );
}

type FilterState = { from: string; to: string; userId: string; activity: '' | Activity; caseId: string };

const Filters = ({ value, onChange, showStaff }: { value: FilterState; onChange: (v: FilterState) => void; showStaff: boolean }) => {
  const { t } = useTranslation();
  const staff = useQuery({
    queryKey: ['time', 'summary', 'staff-list'],
    queryFn: async () => (await api.get<Summary>('/admin/time/summary')).data.byStaff.map((s) => ({ id: s.userId, name: s.name })),
    enabled: showStaff,
  });
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <label className="block">
        <span className="label">{t('time.page.from')}</span>
        <input type="date" className="input" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      </label>
      <label className="block">
        <span className="label">{t('time.page.to')}</span>
        <input type="date" className="input" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </label>
      {showStaff && (
        <label className="col-span-2 block sm:col-span-1">
          <span className="label">{t('time.page.staff')}</span>
          <select className="input" value={value.userId} onChange={(e) => onChange({ ...value, userId: e.target.value })}>
            <option value="">{t('time.page.allStaff')}</option>
            {(staff.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="col-span-2 block sm:col-span-1">
        <span className="label">{t('time.page.activity')}</span>
        <select className="input" value={value.activity} onChange={(e) => onChange({ ...value, activity: e.target.value as Activity | '' })}>
          <option value="">{t('time.page.allActivities')}</option>
          {ACTIVITIES.map((a) => (
            <option key={a} value={a}>
              {t(`time.activity.${a}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

const queryOf = (f: FilterState) => Object.fromEntries(Object.entries(f).filter(([, v]) => v));

const Entries = ({ filters, isAdmin }: { filters: FilterState; isAdmin: boolean }) => {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<TimeEntry | 'new' | null>(null);
  const q = useQuery({
    queryKey: ['time', 'entries', filters, page],
    queryFn: async () => (await api.get<EntriesResponse>('/admin/time/entries', { params: { ...queryOf(filters), page } })).data,
    placeholderData: keepPreviousData,
  });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
  return (
    <Panel
      title={t('time.page.total', { dur: fmtDuration(t, d.totalMinutes) })}
      icon={Timer}
      actions={
        <button type="button" className="btn-primary btn-sm" onClick={() => setEdit('new')}>
          <Plus className="size-4" /> {t('time.panel.manual')}
        </button>
      }
      bodyClassName="p-0 sm:p-0"
    >
      {!isAdmin && <p className="border-b border-line px-5 py-2 text-xs text-muted">{t('time.page.ownOnly')}</p>}
      {d.items.length === 0 ? (
        <p className="p-5 text-sm text-muted">{t('time.page.noEntries')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {d.items.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-3">
              <span className="w-24 shrink-0 text-xs text-muted tabular-nums">{new Date(e.startedAt).toLocaleDateString(i18n.language)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {e.caseId ? (
                    <Link to={`/admin/cases/${e.caseId}`} className="hover:underline">
                      {e.caseNumber}
                    </Link>
                  ) : (
                    t('time.page.noCase')
                  )}
                  {e.clientName && <span className="font-normal text-muted"> · {e.clientName}</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {[t(`time.activity.${e.activity}`), isAdmin ? e.userName : null, e.task ? `${e.task.key} ${e.task.title}` : null, t(`time.page.source.${e.source}`), e.autoStopped ? t('time.page.autoStopped') : null, e.note].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className={clsx('text-sm whitespace-nowrap tabular-nums', e.running && 'font-semibold text-success-fg')}>{e.running ? t('time.page.runningNow') : fmtDuration(t, e.minutes)}</span>
              <button type="button" className="btn-secondary btn-sm self-start sm:self-auto" onClick={() => setEdit(e)}>
                <Pencil className="size-3.5" /> {t('time.page.edit')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs">
          <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('time.page.prev')}
          </button>
          <span className="text-muted tabular-nums">
            {page} / {pages}
          </span>
          <button type="button" className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            {t('time.page.next')}
          </button>
        </div>
      )}
      {edit && <EntryDialog entry={edit === 'new' ? null : edit} caseId={filters.caseId || null} onClose={() => setEdit(null)} />}
    </Panel>
  );
};

const Bar = ({ value, max }: { value: number; max: number }) => (
  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
    <span className="block h-full rounded-full bg-primary" style={{ width: `${max ? Math.max(2, Math.round((value / max) * 100)) : 0}%` }} />
  </span>
);

const Reports = ({ filters, isAdmin }: { filters: FilterState; isAdmin: boolean }) => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['time', 'summary', filters], queryFn: async () => (await api.get<Summary>('/admin/time/summary', { params: queryOf(filters) })).data, placeholderData: keepPreviousData });
  const maxAct = useMemo(() => Math.max(0, ...(q.data?.byActivity ?? []).map((a) => a.minutes)), [q.data]);
  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const maxCase = Math.max(0, ...d.byCase.map((c) => c.minutes));
  return (
    <div className="space-y-6">
      <Panel title={t('time.page.byStaffWeek')} icon={Timer} bodyClassName="overflow-x-auto p-0 sm:p-0">
        {d.byStaff.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t('time.page.noEntries')}</p>
        ) : (
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-sunken text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">{t('time.page.staff')}</th>
                {d.weeks.map((w) => (
                  <th key={w} className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                    {w.replace(/^\d{4}-/, '')}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-semibold">{t('time.page.sum')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.byStaff.map((s) => (
                <tr key={s.userId}>
                  <td className="px-4 py-2 whitespace-nowrap">{s.name}</td>
                  {d.weeks.map((w) => (
                    <td key={w} className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {s.weeks[w] ? fmtDuration(t, s.weeks[w]) : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold whitespace-nowrap tabular-nums">{fmtDuration(t, s.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={t('time.page.byCase')}>
          <ul className="space-y-2 text-sm">
            {d.byCase.slice(0, 25).map((c) => (
              <li key={c.caseId ?? 'none'}>
                <div className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {c.caseId ? (
                      <Link to={`/admin/cases/${c.caseId}`} className="font-semibold hover:underline">
                        {c.number}
                      </Link>
                    ) : (
                      t('time.page.noCase')
                    )}
                    {c.clientName && <span className="text-muted"> · {c.clientName}</span>}
                  </span>
                  <span className="tabular-nums">{fmtDuration(t, c.minutes)}</span>
                </div>
                <Bar value={c.minutes} max={maxCase} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={t('time.page.byActivity')}>
          <ul className="space-y-2 text-sm">
            {d.byActivity.map((a) => (
              <li key={a.activity}>
                <div className="flex justify-between gap-2">
                  <span>{t(`time.activity.${a.activity}`)}</span>
                  <span className="tabular-nums">{fmtDuration(t, a.minutes)}</span>
                </div>
                <Bar value={a.minutes} max={maxAct} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      {isAdmin && (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{t('time.page.exportHint')}</p>
            <Link to="/admin/reports?dataset=timeEntries" className="btn-secondary btn-sm">
              <FileBarChart2 className="size-4" /> {t('time.page.export')}
            </Link>
          </div>
        </Panel>
      )}
    </div>
  );
};

const eur = (cents: number | null) => (cents === null ? '—' : `${(cents / 100).toFixed(2)} €`);

const RatesTab = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['time', 'rates'], queryFn: async () => (await api.get<Rates>('/admin/time/rates')).data });
  const [def, setDef] = useState<string | null>(null);
  const [add, setAdd] = useState<{ userId: string; hourly: string; effectiveFrom: string }>({ userId: '', hourly: '', effectiveFrom: new Date().toISOString().slice(0, 10) });
  const done = (d: Rates) => {
    qc.setQueryData(['time', 'rates'], d);
    void qc.invalidateQueries({ queryKey: ['case-profit'] });
    toast.success(t('time.rates.saved'));
  };
  const saveDefault = useMutation({ mutationFn: async (hourly: number) => (await api.put<Rates>('/admin/time/rates/default', { hourly })).data, onSuccess: (d) => (done(d), setDef(null)), onError: (e) => timeError(t, e) });
  const addRate = useMutation({ mutationFn: async () => (await api.post<Rates>('/admin/time/rates', { userId: add.userId, hourly: Number(add.hourly.replace(',', '.')), effectiveFrom: add.effectiveFrom })).data, onSuccess: (d) => (done(d), setAdd((s) => ({ ...s, hourly: '' }))), onError: (e) => timeError(t, e) });
  const remove = useMutation({ mutationFn: async (id: string) => (await api.delete<Rates>(`/admin/time/rates/${id}`)).data, onSuccess: done, onError: (e) => timeError(t, e) });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const submitAdd = (e: FormEvent) => {
    e.preventDefault();
    if (add.userId && add.hourly) addRate.mutate();
  };
  return (
    <div className="space-y-6">
      <Panel title={t('time.rates.title')}>
        <p className="mb-4 text-xs text-muted">{t('time.rates.hint')}</p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveDefault.mutate(Number((def ?? '').replace(',', '.')) || 0);
          }}
        >
          <label className="block">
            <span className="label">{t('time.rates.default')}</span>
            <input className="input w-32" inputMode="decimal" value={def ?? (d.defaultCentsPerHour / 100).toFixed(2)} onChange={(e) => setDef(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary btn-sm" disabled={def === null || saveDefault.isPending}>
            {t('time.rates.saveDefault')}
          </button>
        </form>
        <form onSubmit={submitAdd} className="mt-5 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="block">
            <span className="label">{t('time.page.staff')}</span>
            <select className="input" value={add.userId} onChange={(e) => setAdd((s) => ({ ...s, userId: e.target.value }))} required>
              <option value="" />
              {d.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('time.rates.hourly')}</span>
            <input className="input" inputMode="decimal" value={add.hourly} onChange={(e) => setAdd((s) => ({ ...s, hourly: e.target.value }))} required />
          </label>
          <label className="block">
            <span className="label">{t('time.rates.effectiveFrom')}</span>
            <input type="date" className="input" value={add.effectiveFrom} onChange={(e) => setAdd((s) => ({ ...s, effectiveFrom: e.target.value }))} required />
          </label>
          <button type="submit" className="btn-primary btn-sm" disabled={addRate.isPending}>
            <Plus className="size-4" /> {t('time.rates.add')}
          </button>
        </form>
      </Panel>
      <Panel bodyClassName="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {d.staff.map((s) => (
            <li key={s.id} className={clsx('px-5 py-3', !s.isActive && 'opacity-60')}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{s.name}</span>
                <span className="text-sm tabular-nums">
                  {t('time.rates.current')}: {s.current === null ? `${eur(d.defaultCentsPerHour)} (${t('time.rates.usesDefault')})` : eur(s.current)}
                </span>
              </div>
              {s.history.length > 0 && (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {s.history.map((h) => (
                    <li key={h.id} className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-[11px]">
                      {h.effectiveFrom}: {eur(h.centsPerHour)}
                      <button type="button" className="text-muted hover:text-danger-fg" aria-label={t('time.rates.remove')} onClick={async () => (await confirmDialog({ title: t('time.rates.remove'), message: t('ui.confirmDlg.removeNamed', { name: `${s.name} · ${h.effectiveFrom}: ${eur(h.centsPerHour)}` }), confirmLabel: t('ui.confirmDlg.remove') })) && remove.mutate(h.id)}>
                        <Trash2 className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
};
