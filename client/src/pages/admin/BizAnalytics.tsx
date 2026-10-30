import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, Download, Filter, Hourglass, Layers, LineChart as LineIcon, Timer, TrendingUp, UsersRound } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesBizAnalytics } from '@/i18n/pagesBizAnalytics';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { statusLabel } from '@/components/admin/labels';
import { Chip, ErrorBlock, LoadingBlock, PageHead, Panel, StatTile } from '@/components/admin/ui';
import { BarList, LineChart, SERIES_COLORS, type Series } from '@/components/admin/charts';
import { useReportFormat } from '@/components/reports/types';
import type { CaseStatus } from '@/lib/types';

registerCopy(pagesBizAnalytics);

// ─── API shape (server lib/bizAnalytics/service.ts) ─────────────────────

type Stage = Exclude<CaseStatus, 'APPROVED' | 'REJECTED' | 'CANCELLED'>;
interface StageStat {
  stage: Stage;
  cases: number;
  avgDays: number | null;
  medianDays: number | null;
  p75Days: number | null;
}
interface PerfRow {
  id: string | null;
  name: string | null;
  clients: number | null;
  clientsWithCase: number | null;
  caseRate: number | null;
  cases: number;
  active: number;
  approved: number;
  refused: number;
  cancelled: number;
  approvalRate: number | null;
  refusalRate: number | null;
  avgDays: number | null;
  medianDays: number | null;
  revenueCents: number;
  commissionCents: number;
  commissionShare: number | null;
}
interface FunnelStep {
  key: string;
  count: number;
  rate: number | null;
  ofFirst: number | null;
}
interface BizResponse {
  range: { from: string; to: string; visaCategoryId: string | null; months: string[] };
  stageKeys: Stage[];
  stages: {
    stages: StageStat[];
    slowest: Stage | null;
    trend: { months: string[]; rows: { stage: Stage; medianDays: (number | null)[]; cases: number[] }[] };
    byCategory: { categoryId: string | null; cases: number; medianDays: Partial<Record<Stage, number | null>>; totalMedianDays: number }[];
    bottleneck: { stage: Stage | null; rows: { stage: Stage; open: number; medianWaitingDays: number | null; waitingDays: number; overTypical: number }[] };
  };
  performance: { partners: PerfRow[]; agents: PerfRow[]; staff: PerfRow[] };
  funnel: { steps: FunnelStep[]; cohorts: { month: string; steps: FunnelStep[]; inquiries: number | null }[]; inquiries: number | null; categoryFiltered: boolean };
  categories: { id: string; slug: string; visaLabel: string | null; title: Record<string, string> | null }[];
}

type Section = 'stages' | 'partners' | 'funnel';
const PRESETS = [3, 6, 12] as const;
type Preset = (typeof PRESETS)[number] | 'custom';
/** Stages drawn in the trend by default (the rest can be switched on in the legend). */
const TREND_DEFAULT: Stage[] = ['DOCUMENTS_PENDING', 'EMBASSY_DOCUMENTS', 'DECISION_PENDING'];

// Baku calendar days (UTC+4, no DST) — the server counts the same days.
const bakuToday = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
const monthsBack = (n: number) => {
  const [y, m] = bakuToday().split('-').map(Number);
  return new Date(Date.UTC(y, m - n, 1)).toISOString().slice(0, 10);
};
const monthLabel = (m: string) => `${m.slice(5, 7)}.${m.slice(0, 4)}`;

// ─── Pieces ─────────────────────────────────────────────────────────────

const Th = ({ children, left }: { children: ReactNode; left?: boolean }) => <th className={clsx('px-2 py-2 font-medium whitespace-nowrap first:pl-5 last:pr-5', left ? 'text-left' : 'text-right')}>{children}</th>;
const Td = ({ children, className }: { children: ReactNode; className?: string }) => <td className={clsx('px-2 py-2 text-right tabular-nums first:pl-5 first:text-left last:pr-5', className)}>{children}</td>;

const PerfTable = ({ title, rows, none, linkOf, showClients, showCommission }: { title: string; rows: PerfRow[]; none: string; linkOf?: (id: string) => string; showClients: boolean; showCommission: boolean }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const days = (v: number | null) => (v === null ? '—' : t('biz.days', { value: f.num(v) }));
  return (
    <Panel title={title} icon={UsersRound}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('biz.empty')}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <Th left>{t('biz.perf.name')}</Th>
                {showClients && <Th>{t('biz.perf.clients')}</Th>}
                {showClients && <Th>{t('biz.perf.caseRate')}</Th>}
                <Th>{t('biz.perf.cases')}</Th>
                <Th>{t('biz.perf.approved')}</Th>
                <Th>{t('biz.perf.refused')}</Th>
                <Th>{t('biz.perf.refusalRate')}</Th>
                <Th>{t('biz.perf.avgDays')}</Th>
                <Th>{t('biz.perf.revenue')}</Th>
                {showCommission && <Th>{t('biz.perf.commission')}</Th>}
                {showCommission && <Th>{t('biz.perf.share')}</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id ?? 'none'}>
                  <Td className="max-w-[14rem] truncate font-medium text-ink">
                    {r.id && linkOf ? (
                      <Link to={linkOf(r.id)} className="hover:underline">
                        {r.name ?? r.id}
                      </Link>
                    ) : (
                      (r.name ?? <span className="text-muted">{none}</span>)
                    )}
                  </Td>
                  {showClients && <Td>{r.clients ?? '—'}</Td>}
                  {showClients && <Td>{f.pct(r.caseRate)}</Td>}
                  <Td>{r.cases}</Td>
                  <Td className="text-success-fg">{r.approved}</Td>
                  <Td className="text-danger-fg">{r.refused}</Td>
                  <Td className={clsx((r.refusalRate ?? 0) >= 50 && 'font-semibold text-danger-fg')}>{f.pct(r.refusalRate)}</Td>
                  <Td>{days(r.avgDays)}</Td>
                  <Td>{f.eur(r.revenueCents)}</Td>
                  {showCommission && <Td>{f.eur(r.commissionCents)}</Td>}
                  {showCommission && <Td>{f.pct(r.commissionShare)}</Td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};

const FunnelBars = ({ steps }: { steps: FunnelStep[] }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const max = Math.max(1, steps[0]?.count ?? 0);
  const summary = steps.map((s) => `${t(`biz.funnel.steps.${s.key}`)} ${s.count}`).join(', ');
  return (
    <figure>
      <figcaption className="sr-only">{t('biz.funnel.aria', { summary })}</figcaption>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.key}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium text-ink/80">{t(`biz.funnel.steps.${s.key}`)}</span>
              <span className="text-muted tabular-nums">
                <span className="font-semibold text-ink">{f.num(s.count)}</span>
                {i > 0 && (
                  <>
                    {' '}
                    · {f.pct(s.rate)} {t('biz.funnel.fromPrev')} · {f.pct(s.ofFirst)} {t('biz.funnel.ofFirst')}
                  </>
                )}
              </span>
            </div>
            <span className="mt-1 block h-3 overflow-hidden rounded-full bg-sunken" aria-hidden>
              <span className="block h-full rounded-full bg-chart-1" style={{ width: `${s.count === 0 ? 0 : Math.max(2, (s.count / max) * 100)}%`, opacity: 1 - i * 0.1 }} />
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────

export default function AdminBizAnalytics() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const f = useReportFormat();
  usePageTitle(t('biz.title'));
  const [section, setSection] = useState<Section>('stages');
  const [preset, setPreset] = useState<Preset>(12);
  const [custom, setCustom] = useState({ from: monthsBack(11), to: bakuToday() });
  const [draft, setDraft] = useState(custom);
  const [category, setCategory] = useState('');
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [hiddenInit, setHiddenInit] = useState(false);

  const range = preset === 'custom' ? custom : { from: monthsBack(preset - 1), to: bakuToday() };
  const params = { ...range, ...(category ? { visaCategoryId: category } : {}) };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-biz-analytics', params.from, params.to, category],
    queryFn: async () => (await api.get<BizResponse>('/admin/analytics/business', { params })).data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const csvHref = `/api/admin/analytics/business.csv?${new URLSearchParams({ ...params, section }).toString()}`;

  const days = (v: number | null | undefined) => (v === null || v === undefined ? '—' : t('biz.days', { value: f.num(v) }));
  const catName = (id: string | null) => {
    const c = id ? data?.categories.find((x) => x.id === id) : null;
    return c ? `${tr(c.title as never) || c.slug}${c.visaLabel ? ` · ${c.visaLabel}` : ''}` : t('biz.noCategory');
  };

  const stageKeys = data?.stageKeys ?? [];
  if (data && !hiddenInit) {
    setHidden(new Set(stageKeys.filter((s) => !TREND_DEFAULT.includes(s))));
    setHiddenInit(true);
  }
  const series = useMemo<Series[]>(() => stageKeys.map((s, i) => ({ key: s, label: statusLabel(s), color: SERIES_COLORS[i % SERIES_COLORS.length] })), [stageKeys]);
  const points = useMemo(
    () => (data ? data.stages.trend.months.map((m, i) => ({ x: m, values: Object.fromEntries(data.stages.trend.rows.map((r) => [r.stage, r.medianDays[i] ?? 0])) })) : []),
    [data],
  );
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const applyCustom = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.from || !draft.to) return;
    setCustom(draft.from <= draft.to ? draft : { from: draft.to, to: draft.from });
  };

  return (
    <div>
      <PageHead
        title={t('biz.title')}
        subtitle={t('biz.subtitle')}
        actions={
          <a href={csvHref} className="btn-secondary btn-sm" download>
            <Download className="size-3.5" aria-hidden /> {t('biz.csv')} · {t(`biz.tabs.${section}`)}
          </a>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-card p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('biz.period')}>
          {PRESETS.map((p) => (
            <Chip key={p} active={preset === p} onClick={() => setPreset(p)}>
              {t(`biz.ranges.m${p}`)}
            </Chip>
          ))}
          <Chip active={preset === 'custom'} onClick={() => setPreset('custom')}>
            {t('biz.ranges.custom')}
          </Chip>
          {isFetching && !isLoading && <Spinner className="ml-1 size-3.5 text-link" />}
        </div>
        <label className="flex min-w-0 items-center gap-2 text-xs text-muted">
          <span className="shrink-0">{t('biz.category')}</span>
          <select className="input min-w-0 sm:w-64" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('biz.allCategories')}</option>
            {data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {catName(c.id)}
              </option>
            ))}
            <option value="none">{t('biz.noCategory')}</option>
          </select>
        </label>
      </div>

      {preset === 'custom' && (
        <form onSubmit={applyCustom} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-3 sm:p-4">
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="label">{t('biz.from')}</span>
            <input type="date" className="input" value={draft.from} max={bakuToday()} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
          </label>
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="label">{t('biz.to')}</span>
            <input type="date" className="input" value={draft.to} max={bakuToday()} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
          </label>
          <button type="submit" className="btn-primary min-h-10 w-full sm:min-h-9 sm:w-auto">
            <Filter className="size-4" aria-hidden /> {t('biz.apply')}
          </button>
        </form>
      )}

      <Tabs
        className="mb-6"
        label={t('biz.title')}
        items={(['stages', 'partners', 'funnel'] as const).map((k) => ({ key: k, label: t(`biz.tabs.${k}`) }))}
        value={section}
        onChange={setSection}
      />

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : data ? (
        <div className={clsx('space-y-6 transition-opacity', isFetching && 'opacity-70')}>
          {section === 'stages' && <StagesView data={data} days={days} catName={catName} series={series} points={points} hidden={hidden} toggle={toggle} />}
          {section === 'partners' && <PartnersView data={data} />}
          {section === 'funnel' && <FunnelView data={data} />}
        </div>
      ) : null}
    </div>
  );
}

// ─── Stages ─────────────────────────────────────────────────────────────

const StagesView = ({
  data,
  days,
  catName,
  series,
  points,
  hidden,
  toggle,
}: {
  data: BizResponse;
  days: (v: number | null | undefined) => string;
  catName: (id: string | null) => string;
  series: Series[];
  points: { x: string; values: Record<string, number> }[];
  hidden: ReadonlySet<string>;
  toggle: (key: string) => void;
}) => {
  const { t } = useTranslation();
  const s = data.stages;
  const slowest = s.stages.find((x) => x.stage === s.slowest);
  const neck = s.bottleneck.rows.find((r) => r.stage === s.bottleneck.stage);
  const open = s.bottleneck.rows.reduce((a, r) => a + r.open, 0);
  const over = s.bottleneck.rows.reduce((a, r) => a + r.overTypical, 0);
  const maxMedian = Math.max(1, ...s.stages.map((x) => x.medianDays ?? 0));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t('biz.stages.slowest')} value={slowest ? statusLabel(slowest.stage) : t('biz.stages.none')} hint={slowest ? `${t('biz.stages.median')}: ${days(slowest.medianDays)}` : undefined} icon={Timer} />
        <StatTile
          label={t('biz.stages.bottleneck')}
          value={neck ? statusLabel(neck.stage) : t('biz.stages.none')}
          hint={neck ? t('biz.stages.bottleneckHint', { count: neck.open, days: days(neck.medianWaitingDays) }) : undefined}
          tone={neck ? 'warn' : undefined}
          icon={AlertTriangle}
        />
        <StatTile label={t('biz.stages.openCases')} value={open} icon={Hourglass} />
        <StatTile label={t('biz.stages.overTypical')} value={over} hint={t('biz.stages.overTypicalHint')} tone={over > 0 ? 'danger' : 'good'} />
      </div>

      <Panel title={t('biz.stages.table')} icon={Timer}>
        <p className="-mt-1 mb-3 text-xs text-muted">{t('biz.stages.tableNote')}</p>
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <Th left>{t('biz.stages.stage')}</Th>
                <Th>{t('biz.stages.cases')}</Th>
                <Th>{t('biz.stages.avg')}</Th>
                <Th left>{t('biz.stages.median')}</Th>
                <Th>{t('biz.stages.p75')}</Th>
                <Th>{t('biz.stages.open')}</Th>
                <Th>{t('biz.stages.waiting')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.stages.map((x, i) => {
                const b = s.bottleneck.rows[i];
                const isNeck = x.stage === s.bottleneck.stage;
                return (
                  <tr key={x.stage} className={clsx(isNeck && 'bg-warning-bg/40')}>
                    <Td className="font-medium text-ink">
                      {statusLabel(x.stage)}
                      {isNeck && <AlertTriangle className="ml-1.5 inline size-3.5 text-warning-fg" aria-label={t('biz.stages.bottleneck')} />}
                    </Td>
                    <Td>{x.cases}</Td>
                    <Td>{days(x.avgDays)}</Td>
                    <td className="w-[28%] px-2 py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
                          <span className={clsx('block h-full rounded-full', x.stage === s.slowest ? 'bg-chart-2' : 'bg-chart-1')} style={{ width: `${((x.medianDays ?? 0) / maxMedian) * 100}%` }} />
                        </span>
                        <span className="w-16 shrink-0 text-right text-xs font-semibold text-ink tabular-nums">{days(x.medianDays)}</span>
                      </span>
                    </td>
                    <Td>{days(x.p75Days)}</Td>
                    <Td>{b?.open ?? 0}</Td>
                    <Td className={clsx(b?.overTypical && 'text-danger-fg')}>{days(b?.medianWaitingDays)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={t('biz.stages.trend')} icon={LineIcon}>
        <LineChart points={points} series={series} hidden={hidden} onToggle={toggle} xLabel={monthLabel} ariaLabel={t('biz.stages.trendAria')} emptyText={t('biz.empty')} />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title={t('biz.stages.bottleneckTitle')} icon={Hourglass}>
          <p className="-mt-1 mb-4 text-xs text-muted">{t('biz.stages.bottleneckNote')}</p>
          <p className="mb-2 text-[11px] font-medium text-muted">{t('biz.stages.caseDays')}</p>
          <BarList
            rows={s.bottleneck.rows.map((r) => ({ key: r.stage, label: `${statusLabel(r.stage)} (${r.open})`, value: r.waitingDays, tone: r.stage === s.bottleneck.stage ? 'bg-danger' : 'bg-chart-1' }))}
            format={(v) => String(Math.round(v))}
          />
        </Panel>

        <Panel title={t('biz.stages.byCategory')} icon={Layers}>
          {s.byCategory.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{t('biz.empty')}</p>
          ) : (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[900px] text-xs">
                <thead className="text-muted">
                  <tr>
                    <Th left>{t('biz.category')}</Th>
                    <Th>{t('biz.stages.cases')}</Th>
                    {data.stageKeys.map((k) => (
                      <th key={k} className="max-w-[6rem] px-2 py-2 text-right font-medium" title={statusLabel(k)}>
                        <span className="line-clamp-2">{statusLabel(k)}</span>
                      </th>
                    ))}
                    <Th>{t('biz.stages.total')}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {s.byCategory.map((c) => (
                    <tr key={c.categoryId ?? 'none'}>
                      <Td className="max-w-[12rem] truncate font-medium text-ink">{catName(c.categoryId)}</Td>
                      <Td>{c.cases}</Td>
                      {data.stageKeys.map((k) => (
                        <Td key={k}>{c.medianDays[k] ?? '—'}</Td>
                      ))}
                      <Td className="font-semibold text-ink">{c.totalMedianDays}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
};

// ─── Partners ───────────────────────────────────────────────────────────

const PartnersView = ({ data }: { data: BizResponse }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const { partners, agents, staff } = data.performance;
  const named = partners.filter((p) => p.id);
  const top = [...named].sort((a, b) => b.cases - a.cases)[0];
  // Best approval among partners with at least 3 decisions (a single visa is not a rate).
  const best = [...named].filter((p) => p.approved + p.refused >= 3).sort((a, b) => (b.approvalRate ?? 0) - (a.approvalRate ?? 0))[0];
  const commission = named.reduce((a, p) => a + p.commissionCents, 0);
  const revenue = named.reduce((a, p) => a + p.revenueCents, 0);
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={t('biz.perf.topPartner')} value={top?.name ?? '—'} hint={top ? `${top.cases} ${t('biz.perf.cases')}` : undefined} icon={TrendingUp} />
        <StatTile label={t('biz.perf.bestApproval')} value={best?.name ?? '—'} hint={best ? f.pct(best.approvalRate) : undefined} tone={best ? 'good' : undefined} />
        <StatTile label={t('biz.perf.commissionTotal')} value={f.eur(commission)} hint={t('biz.perf.commissionHint', { share: f.pct(revenue > 0 ? Math.round((commission / revenue) * 1000) / 10 : null) })} />
      </div>
      <p className="text-xs text-muted">{t('biz.perf.note')}</p>
      <PerfTable title={t('biz.perf.partners')} rows={partners} none={t('biz.perf.noPartner')} linkOf={(id) => `/admin/partners/${id}`} showClients={false} showCommission />
      <PerfTable title={t('biz.perf.agents')} rows={agents} none="—" showClients showCommission />
      <PerfTable title={t('biz.perf.staff')} rows={staff} none={t('biz.perf.noStaff')} showClients={false} showCommission={false} />
    </>
  );
};

// ─── Funnel ─────────────────────────────────────────────────────────────

const FunnelView = ({ data }: { data: BizResponse }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const fu = data.funnel;
  const showInquiries = fu.inquiries !== null;
  return (
    <>
      <Panel title={t('biz.funnel.title')} icon={Filter}>
        <p className="-mt-1 mb-4 text-xs text-muted">{t('biz.funnel.note')}</p>
        {fu.categoryFiltered && <p className="mb-4 rounded-lg border border-line bg-sunken px-3 py-2 text-xs text-ink/80">{t('biz.funnel.filtered')}</p>}
        {fu.steps[0]?.count ? <FunnelBars steps={fu.steps} /> : <p className="py-8 text-center text-sm text-muted">{t('biz.empty')}</p>}
      </Panel>

      <Panel title={t('biz.funnel.cohorts')} icon={Layers}>
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <Th left>{t('biz.funnel.month')}</Th>
                {fu.steps.map((s) => (
                  <Th key={s.key}>{t(`biz.funnel.steps.${s.key}`)}</Th>
                ))}
                {showInquiries && <Th>{t('biz.funnel.inquiries')}</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {fu.cohorts.map((c) => (
                <tr key={c.month}>
                  <Td className="font-medium text-ink">{monthLabel(c.month)}</Td>
                  {c.steps.map((s, i) => (
                    <Td key={s.key}>
                      <span className="font-semibold text-ink">{s.count}</span>
                      {i > 0 && c.steps[0].count > 0 && <span className="ml-1 text-[11px] text-muted">{f.pct(s.ofFirst)}</span>}
                    </Td>
                  ))}
                  {showInquiries && <Td className="text-muted">{c.inquiries ?? '—'}</Td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showInquiries && <p className="mt-3 text-[11px] text-muted">{t('biz.funnel.inquiriesNote')}</p>}
      </Panel>
    </>
  );
};
