import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Coins, FileSpreadsheet, Filter, Info, Percent, Save, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesReports } from '@/i18n/pagesReports';
import { usePageTitle } from '@/lib/usePageTitle';
import { RequireAuth } from '@/lib/auth';
import { ErrorBlock, LoadingBlock, PageHead, StatTile } from '@/components/admin/ui';
import { BarChart, BarList, CRITICAL, ACCENT } from '@/components/admin/charts';
import { useReportFormat } from '@/components/reports/types';
import { COST_KEYS, type Bucket, type CaseProfitRow, type ProfitOverview } from '@/components/reports/profitTypes';

registerCopy(pagesReports);

const STATUSES = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
const BREAKDOWNS = ['visaType', 'category', 'partner', 'agent', 'staff', 'employer', 'month'] as const;
type Breakdown = (typeof BREAKDOWNS)[number];
const BUCKET_KEY: Record<Breakdown, keyof ProfitOverview> = {
  visaType: 'byVisaType',
  category: 'byCategory',
  partner: 'byPartner',
  agent: 'byAgent',
  staff: 'byStaff',
  employer: 'byEmployer',
  month: 'byMonth',
};

/** Admin: profitability per case — /admin/profitability (ADMIN and above; the API enforces it). Filters live in the query string. */
export default function AdminProfitability() {
  return (
    <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
      <ProfitPage />
    </RequireAuth>
  );
}

function ProfitPage() {
  const { t } = useTranslation();
  const f = useReportFormat();
  usePageTitle(t('profit.title'));
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const q = useQuery({ queryKey: ['profitability', query], queryFn: async () => (await api.get<ProfitOverview>(`/admin/profitability${query ? `?${query}` : ''}`)).data });
  const [draft, setDraft] = useState({ from: params.get('from') ?? '', to: params.get('to') ?? '', status: params.get('status') ?? '', visaType: params.get('visaType') ?? '' });
  const [tab, setTab] = useState<Breakdown>('visaType');
  const [list, setList] = useState<'top' | 'bottom' | 'all'>('top');

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(draft)) if (v) next.set(k, v);
    setParams(next, { replace: true });
  };

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const rate = d.settings.eurAzn;
  const bucketLabel = (b: Bucket) => {
    if (b.key === null) return t('profit.none');
    if (tab === 'visaType') return t(`profit.visaTypes.${b.key}`, { defaultValue: b.key });
    return b.label ?? b.key;
  };
  const buckets = d[BUCKET_KEY[tab]] as Bucket[];
  const caseRows = list === 'top' ? d.top : list === 'bottom' ? d.bottom : d.rows;

  return (
    <div className="space-y-6">
      <PageHead
        title={t('profit.title')}
        subtitle={t('profit.subtitle')}
        actions={
          <Link to="/admin/reports?dataset=profitability" className="btn-ghost btn-sm">
            <FileSpreadsheet className="size-4" /> {t('profit.exportVia')}
          </Link>
        }
      />

      <form onSubmit={apply} className="grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <label>
          <span className="label">{t('profit.from')}</span>
          <input type="date" className="input" value={draft.from} onChange={(e) => setDraft((s) => ({ ...s, from: e.target.value }))} />
        </label>
        <label>
          <span className="label">{t('profit.to')}</span>
          <input type="date" className="input" value={draft.to} onChange={(e) => setDraft((s) => ({ ...s, to: e.target.value }))} />
        </label>
        <label>
          <span className="label">{t('profit.status')}</span>
          <select className="input" value={draft.status} onChange={(e) => setDraft((s) => ({ ...s, status: e.target.value }))}>
            <option value="">{t('profit.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`profit.statuses.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">{t('profit.visaType')}</span>
          <select className="input" value={draft.visaType} onChange={(e) => setDraft((s) => ({ ...s, visaType: e.target.value }))}>
            <option value="">{t('profit.allTypes')}</option>
            {VISA_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`profit.visaTypes.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary btn-sm">
            <Filter className="size-4" /> {t('profit.apply')}
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              setDraft({ from: '', to: '', status: '', visaType: '' });
              setParams({}, { replace: true });
            }}
          >
            {t('profit.reset')}
          </button>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t('profit.kpi.revenue')} value={f.eur(d.totals.revenueCents)} hint={`${t('profit.azn', { value: f.azn(d.totals.revenueCents, rate) })} · ${t('profit.kpi.cases', { count: d.totals.cases })}`} icon={Wallet} />
        <StatTile label={t('profit.kpi.costs')} value={f.eur(d.totals.costCents)} hint={t('profit.azn', { value: f.azn(d.totals.costCents, rate) })} icon={Coins} />
        <StatTile
          label={t('profit.kpi.margin')}
          value={f.eur(d.totals.marginCents)}
          hint={`${t('profit.kpi.marginPct')}: ${f.pct(d.totals.marginPct)} · ${t('profit.kpi.unprofitable', { count: d.totals.unprofitable })}`}
          tone={d.totals.marginCents < 0 ? 'danger' : 'good'}
          icon={d.totals.marginCents < 0 ? TrendingDown : TrendingUp}
        />
        <StatTile label={t('profit.kpi.avgMargin')} value={f.eur(d.totals.avgMarginCents)} hint={`${t('profit.kpi.avgMarginPct')}: ${f.pct(d.totals.avgMarginPct)}`} icon={Percent} />
      </div>

      <section className="min-w-0 rounded-xl border border-line bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-1" role="tablist" aria-label={t('profit.breakdown')}>
          {BREAKDOWNS.map((b) => (
            <button key={b} type="button" role="tab" aria-selected={tab === b} onClick={() => setTab(b)} className={clsx('rounded-lg px-3 py-1.5 text-xs font-semibold', tab === b ? 'bg-brand-600 text-white' : 'text-muted hover:bg-surface hover:text-ink')}>
              {t(`profit.by.${b}`)}
            </button>
          ))}
        </div>
        {buckets.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t('profit.empty')}</p>
        ) : (
          <>
            <BarChart
              bars={buckets.slice(0, 24).map((b) => ({ label: bucketLabel(b), value: b.marginCents / 100, emphasis: b.marginCents < 0 }))}
              color={buckets.every((b) => b.marginCents >= 0) ? ACCENT : CRITICAL}
              height={200}
              format={(v) => f.eur(Math.round(v * 100))}
              ariaLabel={t('profit.chartAria')}
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-2 text-left font-semibold">{t(`profit.by.${tab}`)}</th>
                    <th className="py-2 text-right font-semibold">{t('profit.col.cases')}</th>
                    <th className="py-2 text-right font-semibold">{t('profit.col.revenue')}</th>
                    <th className="py-2 text-right font-semibold">{t('profit.col.costs')}</th>
                    <th className="py-2 text-right font-semibold">{t('profit.col.margin')}</th>
                    <th className="py-2 text-right font-semibold">{t('profit.col.marginPct')}</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={String(b.key)} className="border-b border-line/70">
                      <td className="py-1.5">{bucketLabel(b)}</td>
                      <td className="py-1.5 text-right tabular-nums">{b.cases}</td>
                      <td className="py-1.5 text-right tabular-nums">{f.eur(b.revenueCents)}</td>
                      <td className="py-1.5 text-right tabular-nums">{f.eur(b.costCents)}</td>
                      <td className={clsx('py-1.5 text-right font-semibold tabular-nums', b.marginCents < 0 && 'text-danger')}>{f.eur(b.marginCents)}</td>
                      <td className="py-1.5 text-right tabular-nums">{f.pct(b.marginPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">{t('profit.revenueBySource')}</h2>
          <BarList
            rows={(['INVOICE', 'SETTLEMENT', 'TRANSLATION'] as const).map((k) => ({ key: k, label: t(`profit.sources.${k}`), value: d.revenueBySource[k], tone: 'bg-brand-500' }))}
            format={(v) => f.eur(v)}
          />
        </section>
        <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">{t('profit.costsByCategory')}</h2>
          <BarList rows={COST_KEYS.filter((k) => d.costsByCategory[k]).map((k) => ({ key: k, label: t(`profit.costCats.${k}`), value: d.costsByCategory[k], tone: 'bg-amber-500' }))} format={(v) => f.eur(v)} />
        </section>
      </div>

      <section className="min-w-0 rounded-xl border border-line bg-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-1" role="tablist">
          {(['top', 'bottom', 'all'] as const).map((l) => (
            <button key={l} type="button" role="tab" aria-selected={list === l} onClick={() => setList(l)} className={clsx('rounded-lg px-3 py-1.5 text-xs font-semibold', list === l ? 'bg-brand-600 text-white' : 'text-muted hover:bg-surface hover:text-ink')}>
              {l === 'top' ? t('profit.top') : l === 'bottom' ? t('profit.bottom') : t('profit.allCases')}
            </button>
          ))}
        </div>
        <CaseTable rows={caseRows} paged={list === 'all'} />
        {list === 'all' && d.rowsTruncated && <p className="mt-2 text-xs text-muted">{t('profit.rowsTruncated')}</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsPanel settings={d.settings} />
        <details className="rounded-xl border border-line bg-card p-4 sm:p-5">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <Info className="size-4 text-brand-600" aria-hidden /> {t('profit.rules.title')}
          </summary>
          <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
            {t('profit.rules.body')
              .split('\n\n')
              .map((p, i) => (
                <p key={i}>{p}</p>
              ))}
          </div>
        </details>
      </div>
    </div>
  );
}

const PAGE = 50;

const CaseTable = ({ rows, paged }: { rows: CaseProfitRow[]; paged: boolean }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = paged ? rows.slice(page * PAGE, page * PAGE + PAGE) : rows;
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted">{t('profit.empty')}</p>;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 text-left font-semibold">{t('profit.col.number')}</th>
              <th className="py-2 text-left font-semibold">{t('profit.col.client')}</th>
              <th className="py-2 text-left font-semibold">{t('profit.col.type')}</th>
              <th className="py-2 text-right font-semibold">{t('profit.col.revenue')}</th>
              <th className="py-2 text-right font-semibold">{t('profit.col.costs')}</th>
              <th className="py-2 text-right font-semibold">{t('profit.col.margin')}</th>
              <th className="py-2 text-right font-semibold">{t('profit.col.marginPct')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.caseId} className="border-b border-line/70">
                <td className="py-1.5">
                  <Link to={`/admin/cases/${r.caseId}`} className="font-medium text-brand-600 hover:underline">
                    {r.number}
                  </Link>
                </td>
                <td className="max-w-[14rem] truncate py-1.5">{r.clientName}</td>
                <td className="py-1.5 text-xs text-muted">{t(`profit.visaTypes.${r.visaType}`, { defaultValue: r.visaType })}</td>
                <td className="py-1.5 text-right tabular-nums">{f.eur(r.revenue.total)}</td>
                <td className="py-1.5 text-right tabular-nums">{f.eur(r.costs.total)}</td>
                <td className={clsx('py-1.5 text-right font-semibold tabular-nums', r.marginCents < 0 && 'text-danger')}>{f.eur(r.marginCents)}</td>
                <td className="py-1.5 text-right tabular-nums">{f.pct(r.marginPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paged && pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted">
          <button type="button" className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            {t('reports.prev')}
          </button>
          <span>{t('reports.page', { page: page + 1, pages })}</span>
          <button type="button" className="btn-ghost btn-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            {t('reports.next')}
          </button>
        </div>
      )}
    </div>
  );
};

const SettingsPanel = ({ settings }: { settings: ProfitOverview['settings'] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rate, setRate] = useState(String(settings.eurAzn));
  const [as, setAs] = useState(settings.translationAs);
  const save = useMutation({
    mutationFn: async () => api.put('/admin/profitability/settings', { eurAzn: Number(rate.replace(',', '.')), translationAs: as }),
    onSuccess: () => {
      toast.success(t('profit.settings.saved'));
      void qc.invalidateQueries({ queryKey: ['profitability'] });
      void qc.invalidateQueries({ queryKey: ['case-profit'] });
    },
    onError: (err) => toast.error(t(`reports.errors.${errorCode(err)}`, { defaultValue: t('reports.errors.generic') })),
  });
  return (
    <form
      className="space-y-3 rounded-xl border border-line bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="text-sm font-semibold text-ink">{t('profit.settings.title')}</h2>
      <label className="block">
        <span className="label">{t('profit.settings.rate')}</span>
        <input className="input max-w-[10rem]" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        <span className="mt-1 block text-[11px] text-muted">
          {t('profit.settings.rateHint')} ({t(`profit.settings.source.${settings.rateSource}`)})
        </span>
      </label>
      <fieldset>
        <legend className="label">{t('profit.settings.translationAs')}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(['revenue', 'cost'] as const).map((v) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="translationAs" className="accent-brand-600" checked={as === v} onChange={() => setAs(v)} />
              {v === 'revenue' ? t('profit.settings.asRevenue') : t('profit.settings.asCost')}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="btn-ghost btn-sm" disabled={save.isPending}>
        <Save className="size-4" /> {t('reports.save')}
      </button>
    </form>
  );
};
