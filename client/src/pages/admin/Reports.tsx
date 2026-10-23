import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BarChart3, CalendarClock, Download, FilePlus2, FileSpreadsheet, Lock, Play, Save, Share2, Table2, Trash2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesReports } from '@/i18n/pagesReports';
import { usePageTitle } from '@/lib/usePageTitle';
import { RequireAuth, useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { downloadBlob } from '@/components/cv/types';
import { Modal } from '@/components/settlement/Modal';
import { ColumnsPicker, FiltersEditor, GroupEditor, PreviewTable, ReportChart } from '@/components/reports/Builder';
import { ScheduleDialog } from '@/components/reports/ScheduleDialog';
import { emptyConfig, useReportFormat, type ChartType, type Dataset, type DatasetsResponse, type ReportConfig, type ReportResult, type SavedReport, type StaffUser } from '@/components/reports/types';

registerCopy(pagesReports);

/**
 * Admin: no-code report builder — /admin/reports (ADMIN and above; the API enforces it). Pick a dataset, columns
 * (drag to order), filters, optional grouping with calculations, preview with totals and a chart, save
 * (private or shared), export (Excel / CSV / PDF) and schedule e-mails. `?report=<id>` opens a saved report;
 * `?dataset=<key>` starts a new one on that dataset.
 */
export default function AdminReports() {
  return (
    <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
      <ReportsPage />
    </RequireAuth>
  );
}

const useErr = () => {
  const { t } = useTranslation();
  return (err: unknown) => toast.error(t(`reports.errors.${errorCode(err)}`, { defaultValue: t('reports.errors.generic') }));
};

const filenameOf = (disposition: string | undefined, fallback: string) => /filename="([^"]+)"/.exec(disposition ?? '')?.[1] ?? fallback;

/** Drops filters without a value, so a half-filled row never blocks the preview. */
const cleanConfig = (c: ReportConfig): ReportConfig => ({
  ...c,
  filters: c.filters.filter((f) => {
    if (f.op === 'empty' || f.op === 'notEmpty' || f.op === 'is') return true;
    const v = f.value;
    if (Array.isArray(v)) return v.some((x) => x !== '' && x != null);
    if (v && typeof v === 'object') return Object.values(v as object).some(Boolean);
    return v !== '' && v != null;
  }),
});

function ReportsPage() {
  const { t } = useTranslation();
  const f = useReportFormat();
  const { user } = useAuth();
  const qc = useQueryClient();
  const onErr = useErr();
  usePageTitle(t('reports.title'));
  const [params, setParams] = useSearchParams();

  const meta = useQuery({ queryKey: ['reports', 'datasets'], queryFn: async () => (await api.get<DatasetsResponse>('/admin/reports/datasets')).data });
  const users = useQuery({ queryKey: ['reports', 'users'], queryFn: async () => (await api.get<{ users: StaffUser[] }>('/admin/reports/users')).data.users });
  const saved = useQuery({ queryKey: ['reports', 'saved'], queryFn: async () => (await api.get<{ reports: SavedReport[] }>('/admin/reports/saved')).data.reports });

  const [datasetKey, setDatasetKey] = useState('');
  const [config, setConfig] = useState<ReportConfig>(emptyConfig());
  const [current, setCurrent] = useState<SavedReport | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [view, setView] = useState<'table' | 'chart'>('table');
  const [saveOpen, setSaveOpen] = useState<null | 'save' | 'saveAs'>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [busyExport, setBusyExport] = useState(false);

  const datasets = meta.data?.datasets ?? [];
  const dataset: Dataset | undefined = datasets.find((d) => d.key === datasetKey);

  const startNew = (key: string) => {
    const d = datasets.find((x) => x.key === key);
    setDatasetKey(key);
    setCurrent(null);
    setResult(null);
    setConfig({ ...emptyConfig(), columns: d ? d.columns.filter((c) => c.default).map((c) => c.key) : [] });
  };

  // Open ?report=… / ?dataset=… once the metadata is there.
  const reportParam = params.get('report');
  const datasetParam = params.get('dataset');
  useEffect(() => {
    if (!meta.data || !saved.data) return;
    if (reportParam) {
      const r = saved.data.find((x) => x.id === reportParam);
      if (r && r.id !== current?.id) {
        setCurrent(r);
        setDatasetKey(r.dataset);
        setConfig({ ...emptyConfig(), ...r.config });
        setResult(null);
      }
    } else if (datasetParam && datasetParam !== datasetKey && meta.data.datasets.some((d) => d.key === datasetParam)) startNew(datasetParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.data, saved.data, reportParam, datasetParam]);

  const run = useMutation({
    mutationFn: async () => (await api.post<ReportResult>('/admin/reports/preview', { dataset: datasetKey, config: cleanConfig(config) })).data,
    onSuccess: (r) => {
      setResult(r);
      if (!r.grouped) setView('table');
    },
    onError: onErr,
  });

  const save = useMutation({
    mutationFn: async (v: { name: string; shared: boolean; asNew: boolean }) => {
      const body = { name: v.name, shared: v.shared, dataset: datasetKey, config: cleanConfig(config) };
      if (current && !v.asNew) return (await api.patch<{ report: SavedReport }>(`/admin/reports/saved/${current.id}`, body)).data.report;
      return (await api.post<{ report: SavedReport }>('/admin/reports/saved', body)).data.report;
    },
    onSuccess: (r) => {
      toast.success(t('reports.savedToast'));
      setCurrent(r);
      setSaveOpen(null);
      setParams({ report: r.id }, { replace: true });
      void qc.invalidateQueries({ queryKey: ['reports', 'saved'] });
    },
    onError: onErr,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/reports/saved/${id}`),
    onSuccess: () => {
      toast.success(t('reports.deletedToast'));
      setCurrent(null);
      setParams({}, { replace: true });
      void qc.invalidateQueries({ queryKey: ['reports', 'saved'] });
    },
    onError: onErr,
  });

  const doExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    if (!dataset) return;
    setBusyExport(true);
    try {
      const name = current?.name ?? f.tr(dataset.label);
      const res = await api.post('/admin/reports/export', { dataset: datasetKey, config: cleanConfig(config), format, name }, { responseType: 'blob' });
      downloadBlob(res.data as Blob, filenameOf(res.headers['content-disposition'] as string | undefined, `report.${format}`));
    } catch {
      toast.error(t('reports.exportFailed'));
    } finally {
      setBusyExport(false);
    }
  };

  const grouped = useMemo(() => {
    const g: Record<string, Dataset[]> = {};
    for (const d of datasets) (g[d.category] ??= []).push(d);
    return g;
  }, [datasets]);

  if (meta.isLoading) return <LoadingBlock />;
  if (meta.error) return <ErrorBlock error={meta.error} onRetry={() => void meta.refetch()} />;

  const patch = (p: Partial<ReportConfig>) => setConfig((c) => ({ ...c, ...p }));
  const readOnly = !!current && !current.canEdit;
  const maskedCols = dataset?.columns.filter((c) => c.masked) ?? [];

  return (
    <div className="space-y-6">
      <PageHead
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <button type="button" className="btn-ghost btn-sm" onClick={() => { setParams({}, { replace: true }); setCurrent(null); setDatasetKey(''); setResult(null); setConfig(emptyConfig()); }}>
            <FilePlus2 className="size-4" /> {t('reports.newReport')}
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-line bg-card p-4">
            <h2 className="text-sm font-semibold text-ink">{t('reports.saved')}</h2>
            {saved.data?.length === 0 && <p className="mt-2 text-xs text-muted">{t('reports.savedEmpty')}</p>}
            <ul className="mt-2 space-y-1">
              {saved.data?.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setParams({ report: r.id }, { replace: true })}
                    className={clsx('w-full rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-surface', current?.id === r.id && 'bg-brand-50 text-brand-700')}
                  >
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      {f.tr(datasets.find((d) => d.key === r.dataset)?.label)}
                      {r.shared && (
                        <span className="inline-flex items-center gap-0.5">
                          <Share2 className="size-3" aria-hidden /> {r.ownerId === user?.id ? t('reports.sharedBadge') : t('reports.by', { name: r.ownerName ?? '—' })}
                        </span>
                      )}
                      {r.schedules > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <CalendarClock className="size-3" aria-hidden /> {t('reports.scheduledBadge', { count: r.schedules })}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {user?.role === 'SUPER_ADMIN' && <AllowListSettings />}
        </aside>

        <div className="min-w-0 space-y-4">
          <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
            <label className="block max-w-xl">
              <span className="label">{t('reports.dataset')}</span>
              <select className="input" value={datasetKey} disabled={!!current} onChange={(e) => startNew(e.target.value)}>
                <option value="">{t('reports.chooseDataset')}</option>
                {Object.entries(grouped).map(([cat, list]) => (
                  <optgroup key={cat} label={t(`reports.categories.${cat}`)}>
                    {list.map((d) => (
                      <option key={d.key} value={d.key}>
                        {f.tr(d.label)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {dataset && <p className="mt-2 text-xs text-muted">{f.tr(dataset.description)}</p>}
            {current && <p className="mt-2 text-sm font-semibold text-ink">{current.name}</p>}
            {readOnly && <p className="mt-1 text-xs text-amber-700">{t('reports.readOnly')}</p>}
            {maskedCols.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <Lock className="size-3.5" aria-hidden /> {t('reports.maskedHint')}
              </p>
            )}
          </section>

          {dataset && (
            <>
              {config.groupBy.length === 0 && <ColumnsPicker dataset={dataset} value={config.columns} onChange={(columns) => patch({ columns })} />}
              <FiltersEditor dataset={dataset} value={config.filters} onChange={(filters) => patch({ filters })} relativeRanges={meta.data?.relativeRanges ?? []} users={users.data ?? []} />
              <GroupEditor dataset={dataset} config={config} onChange={patch} />

              <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5 shadow-sm">
                <button type="button" className="btn-primary btn-sm" disabled={run.isPending || (!config.groupBy.length && !config.columns.length)} onClick={() => run.mutate()}>
                  {run.isPending ? <Spinner className="size-4" /> : <Play className="size-4" />} {run.isPending ? t('reports.running') : t('reports.run')}
                </button>
                {(!current || current.canEdit) && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setSaveOpen('save')}>
                    <Save className="size-4" /> {t('reports.save')}
                  </button>
                )}
                {current && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setSaveOpen('saveAs')}>
                    <Save className="size-4" /> {t('reports.saveAs')}
                  </button>
                )}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="ml-1 text-xs text-muted">
                    <Download className="inline size-3.5" aria-hidden /> {t('reports.export')}:
                  </span>
                  {(['xlsx', 'csv', 'pdf'] as const).map((fmt) => (
                    <button key={fmt} type="button" className="btn-ghost btn-sm" disabled={busyExport} onClick={() => void doExport(fmt)}>
                      {fmt === 'xlsx' && <FileSpreadsheet className="size-4" />} {t(`reports.export${fmt === 'xlsx' ? 'Xlsx' : fmt === 'csv' ? 'Csv' : 'Pdf'}`)}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-ghost btn-sm" disabled={!current} title={current ? undefined : t('reports.schedule.needsSave')} onClick={() => setScheduleOpen(true)}>
                  <CalendarClock className="size-4" /> {t('reports.schedule.button')}
                </button>
                {current?.canEdit && (
                  <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => window.confirm(t('reports.confirmDelete', { name: current.name })) && remove.mutate(current.id)} aria-label={t('reports.deleteReport')}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>

              {result && (
                <section className="min-w-0 rounded-xl border border-line bg-card p-4 sm:p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{t('reports.preview')}</h3>
                      <p className="text-xs text-muted">
                        {result.grouped ? t('reports.groupsCount', { count: result.total, records: result.records }) : t('reports.rowsCount', { count: result.total })}
                        {result.rows.length > result.previewRows || result.total > result.previewRows ? ` · ${t('reports.previewNote', { shown: result.previewRows, max: meta.data?.limits.exportRows })}` : ''}
                      </p>
                      {result.truncated && <p className="mt-1 text-xs text-amber-700">{t('reports.truncated', { max: meta.data?.limits.exportRows })}</p>}
                    </div>
                    {result.grouped && (
                      <div className="inline-flex rounded-lg border border-line p-0.5" role="group">
                        <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} className={clsx('flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold', view === 'table' ? 'bg-brand-600 text-white' : 'text-muted')}>
                          <Table2 className="size-3.5" /> {t('reports.table')}
                        </button>
                        <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')} className={clsx('flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold', view === 'chart' ? 'bg-brand-600 text-white' : 'text-muted')}>
                          <BarChart3 className="size-3.5" /> {t('reports.chart')}
                        </button>
                      </div>
                    )}
                  </div>
                  {view === 'chart' && result.grouped ? (
                    <ReportChart result={result} type={config.chart?.type ?? 'bar'} metric={config.chart?.metric} onChange={(chart: { type: ChartType; metric?: string }) => patch({ chart })} />
                  ) : (
                    <PreviewTable key={`${result.dataset}-${result.total}-${result.columns.map((c) => c.key).join()}`} result={result} />
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {saveOpen && (
        <SaveDialog
          initial={saveOpen === 'save' && current ? { name: current.name, shared: current.shared } : { name: current ? `${current.name} (2)` : dataset ? f.tr(dataset.label) : '', shared: false }}
          busy={save.isPending}
          onClose={() => setSaveOpen(null)}
          onSave={(v) => save.mutate({ ...v, asNew: saveOpen === 'saveAs' })}
        />
      )}
      {scheduleOpen && current && <ScheduleDialog reportId={current.id} users={users.data ?? []} onClose={() => setScheduleOpen(false)} />}
    </div>
  );
}

const SaveDialog = ({ initial, busy, onClose, onSave }: { initial: { name: string; shared: boolean }; busy: boolean; onClose: () => void; onSave: (v: { name: string; shared: boolean }) => void }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [shared, setShared] = useState(initial.shared);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSave({ name: name.trim(), shared });
  };
  return (
    <Modal title={t('reports.saveTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="label">{t('reports.name')}</span>
          <input className="input" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-brand-600" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {t('reports.shareLabel')}
        </label>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary btn-sm" disabled={busy || !name.trim()}>
            <Save className="size-4" /> {t('reports.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/** SUPER_ADMIN: allow-list of external report recipients. */
const AllowListSettings = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onErr = useErr();
  const q = useQuery({ queryKey: ['reports', 'settings'], queryFn: async () => (await api.get<{ settings: { externalAllowList: string[] } }>('/admin/reports/settings')).data.settings });
  const [text, setText] = useState<string | null>(null);
  const value = text ?? (q.data?.externalAllowList ?? []).join('\n');
  const save = useMutation({
    mutationFn: async () => api.put('/admin/reports/settings', { externalAllowList: value.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean) }),
    onSuccess: () => {
      toast.success(t('reports.settings.saved'));
      setText(null);
      void qc.invalidateQueries({ queryKey: ['reports', 'settings'] });
    },
    onError: onErr,
  });
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <h2 className="text-sm font-semibold text-ink">{t('reports.settings.title')}</h2>
      <p className="mt-1 text-[11px] text-muted">{t('reports.settings.hint')}</p>
      <textarea className="input mt-2 font-mono text-xs" rows={4} value={value} onChange={(e) => setText(e.target.value)} aria-label={t('reports.settings.title')} />
      <button type="button" className="btn-ghost btn-sm mt-2" disabled={save.isPending} onClick={() => save.mutate()}>
        <Save className="size-4" /> {t('reports.save')}
      </button>
    </section>
  );
};
