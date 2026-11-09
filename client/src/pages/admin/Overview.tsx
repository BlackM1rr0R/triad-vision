import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CircleDollarSign,
  Download,
  FileCheck2,
  FolderOpen,
  Gauge,
  Inbox,
  Pause,
  Play,
  Target,
  Timer,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import type { CaseStatus } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesOverview } from '@/i18n/pagesOverview';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { eventLabel, fmtRelative, statusLabel, toastError } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import {
  AreaChart,
  DeltaPill,
  FunnelBars,
  HBarList,
  HealthBar,
  RingGauge,
  SegmentBar,
  Segmented,
  Sparkline,
  StatCard,
  VIZ,
  pctDelta,
  useVizFormat,
  type ChartSeries,
} from '@/components/charts';

registerCopy(pagesOverview);

// ─── API shape (server lib/analyticsOverview/service.ts) ─────────────────

const PERIODS = ['month', '30d', '90d', 'quarter', 'ytd', '12m'] as const;
type Period = (typeof PERIODS)[number];
const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
type VisaType = (typeof VISA_TYPES)[number];
type Source = 'all' | 'partner' | 'site' | 'agent';
type Reason = 'stuck' | 'waiting' | 'expired' | 'expiring';

interface Kpi {
  value: number | null;
  prev: number | null;
  trend: (number | null)[];
}

interface OverviewResponse {
  generatedAt: string;
  period: { key: Period; from: string; to: string; prevFrom: string; prevTo: string };
  finance: boolean;
  summary: { newCases: number; newCasesPrev: number; newCasesDelta: number | null; newInquiries: number; newInquiriesPrev: number; approvals: number; approvalsPrev: number; attention: number; revenueCents: number | null; revenuePrevCents: number | null };
  monthly: { months: string[]; casesByType: Record<VisaType, number[]>; visas: { approved: number[]; rejected: number[] }; revenue: { invoices: number[]; payments: number[] } | null };
  kpis: { activeCases: Kpi & { value: number; prev: number }; approvalRate: Kpi; processingDays: Kpi; receivables: { grossCents: number; overdueCents: number; count: number; overdueCount: number } | null };
  funnel: Record<Source, { key: string; count: number; prev: number }[]>;
  segments: { key: VisaType; count: number; prev: number; revenueCents: number | null; revenuePrevCents: number | null; share: number | null; delta: number | null }[];
  movement: { created: number; approved: number; rejected: number; cancelled: number };
  attention: {
    total: number;
    rows: { caseId: string; number: string; client: string; initials: string; visaType: VisaType; status: CaseStatus; reasons: Reason[]; expiryDays: number | null; idleDays: number; lastActivityAt: string; health: number; trend: number[]; assignee: string | null }[];
  };
  channels: { key: string; count: number; prev: number }[];
  goal:
    | { metric: 'visas' | 'revenue'; hidden: true }
    | { metric: 'visas' | 'revenue'; hidden: false; year: number; target: number | null; value: number; remaining: number | null; pct: number | null; perMonth: number | null; projected: number | null; reachDate: string | null; reached: boolean };
}

interface ActivityResponse {
  generatedAt: string;
  today: number;
  items: { id: string; kind: 'case' | 'inquiry' | 'payment'; type: string; toStatus: CaseStatus | null; at: string; caseId: string | null; caseNumber: string | null; visaType: VisaType | null; channel: string | null; amountCents: number | null; currency: string | null }[];
}

/** Colour follows the visa type (fixed slot per type), never its rank. */
const TYPE_COLOR: Record<VisaType, string> = Object.fromEntries(VISA_TYPES.map((v, i) => [v, VIZ[i]])) as Record<VisaType, string>;

const Card = ({ title, subtitle, actions, children, className, id }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) => (
  <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={clsx('min-w-0 rounded-xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] sm:p-5', className)}>
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id ? `${id}-h` : undefined} className="text-sm font-semibold text-ink">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
    {children}
  </section>
);

/**
 * How far the current Baku month is: factor = days in month / days elapsed (no projection during the first day,
 * when a pace would be noise). The chart draws the current month at that pace, dashed.
 */
const currentMonthPace = (iso: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Baku' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const days = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  const elapsed = parts.day - 1 + (parts.hour + parts.minute / 60) / 24;
  return { factor: elapsed >= 1 ? Math.min(days, days / elapsed) : 1 };
};

const greetingKey = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Baku' }).format(new Date()));
  return h < 12 ? 'morning' : h < 18 ? 'day' : 'evening';
};

// ─── Page ──────────────────────────────────────────────────────────────

export default function AdminOverview() {
  const { t } = useTranslation();
  usePageTitle(t('ov.title'));
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const f = useVizFormat();
  const [period, setPeriod] = useState<Period>('month');

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-overview', period],
    queryFn: async () => (await api.get<OverviewResponse>('/admin/analytics/overview', { params: { period } })).data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const csvHref = `/api/admin/analytics/overview.csv?period=${period}`;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="type-page-title text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{t(`ov.greeting.${greetingKey()}`, { name: user?.firstName ?? '' })}</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="text-ink/80">{f.dayYear(new Date())}</span>
            {data && (
              <>
                {' · '}
                <Summary data={data} />
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/admin/analytics" className="btn-secondary btn-sm">
            {t('ov.allAnalytics')}
          </Link>
          <a href={csvHref} download className={clsx('btn-secondary btn-sm', !data && 'pointer-events-none opacity-50')}>
            <Download className="size-3.5" aria-hidden /> {t('ov.export')}
          </a>
        </div>
      </header>

      {/* One filter row above everything it scopes */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label={t('ov.periodLabel')} items={PERIODS.map((p) => ({ key: p, label: t(`ov.periods.${p}`) }))} value={period} onChange={setPeriod} />
        {data && (
          <span className="text-xs text-muted">
            {f.day(data.period.from)} – {f.day(data.period.to)} · {t(`ov.prevLabel.${period}`)}
          </span>
        )}
        {isFetching && !isLoading && <Spinner className="size-3.5 text-link" />}
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : data ? (
        <div className={clsx('space-y-5 transition-opacity', isFetching && 'opacity-70')}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <MainChart data={data} />
            <KpiStack data={data} />
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <FunnelCard data={data} />
            <SegmentsCard data={data} />
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <AttentionCard data={data} />
            <ActivityCard finance={data.finance} />
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <ChannelsCard data={data} />
            <GoalCard data={data} canEdit={isAdmin} />
          </div>
          <p className="text-[11px] text-muted">{t('ov.updated', { time: f.time(data.generatedAt) })}</p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Summary line ───────────────────────────────────────────────────────

const Summary = ({ data }: { data: OverviewResponse }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const s = data.summary;
  const delta = s.newCasesDelta;
  return (
    <>
      <strong className="font-semibold text-ink">{t('ov.summary.cases', { count: s.newCases })}</strong>
      {delta !== null && <> {t('ov.summary.vsPrev', { delta: `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${f.num1(Math.abs(delta))}%` })}</>}
      {', '}
      <strong className="font-semibold text-ink">{t('ov.summary.approvals', { count: s.approvals })}</strong>
      {', '}
      {s.attention > 0 ? <strong className="font-semibold text-ink">{t('ov.summary.attention', { count: s.attention })}</strong> : t('ov.summary.noAttention')}
    </>
  );
};

// ─── Main chart: cases by visa type / revenue / visas ───────────────────

type MainTab = 'cases' | 'revenue' | 'visas';

const MainChart = ({ data }: { data: OverviewResponse }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const [tab, setTab] = useState<MainTab>('cases');
  const m = data.monthly;
  const tabs: MainTab[] = m.revenue ? ['cases', 'revenue', 'visas'] : ['cases', 'visas'];
  const active: MainTab = tabs.includes(tab) ? tab : 'cases';

  const { series, values, money } = useMemo(() => {
    if (active === 'revenue' && m.revenue) {
      const series: ChartSeries[] = [
        { key: 'invoices', label: t('ov.main.invoices'), color: VIZ[0] },
        { key: 'payments', label: t('ov.main.payments'), color: VIZ[2] },
      ];
      return { series, values: { invoices: m.revenue.invoices, payments: m.revenue.payments } as Record<string, number[]>, money: true };
    }
    if (active === 'visas') {
      return {
        series: [
          { key: 'approved', label: t('ov.main.approved'), color: VIZ[0] },
          { key: 'rejected', label: t('ov.main.rejected'), color: VIZ[1] },
        ],
        values: { approved: m.visas.approved, rejected: m.visas.rejected } as Record<string, number[]>,
        money: false,
      };
    }
    // Only types that occur in the 12 months; each keeps its own colour slot.
    const used = VISA_TYPES.filter((v) => m.casesByType[v].some((x) => x > 0));
    const keys = used.length ? used : (['WORK'] as VisaType[]);
    return {
      series: keys.map((v) => ({ key: v, label: t(`ov.visaTypes.${v}`), color: TYPE_COLOR[v] })),
      values: Object.fromEntries(keys.map((v) => [v, m.casesByType[v]])) as Record<string, number[]>,
      money: false,
    };
  }, [active, m, t]);

  const points = m.months.map((x, i) => ({ x, values: Object.fromEntries(series.map((s) => [s.key, values[s.key][i] ?? 0])) }));
  const monthTotal = (i: number) => series.reduce((a, s) => a + (values[s.key][i] ?? 0), 0);
  const last = m.months.length - 1;
  // Headline = the selected period vs the same stretch before it (the same comparison as the summary line).
  const s = data.summary;
  const [headline, prevHeadline] =
    active === 'visas' ? [s.approvals, s.approvalsPrev] : active === 'revenue' ? [s.revenueCents ?? 0, s.revenuePrevCents ?? 0] : [s.newCases, s.newCasesPrev];
  const periodKey = data.period.key;
  const partial = useMemo(() => currentMonthPace(data.generatedAt), [data.generatedAt]);
  const total12 = m.months.reduce((a, _, i) => a + (active === 'visas' ? (values.approved[i] ?? 0) : monthTotal(i)), 0);
  const fmt = (v: number) => (money ? f.eur(v) : f.num(v));
  const title = t(`ov.main.${active}Title`);

  return (
    <section className="min-w-0 rounded-xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] sm:p-5" aria-labelledby="ov-main-h">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ov-main-h" className="text-xs font-medium text-muted">
            {title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-4xl leading-none font-semibold tracking-tight text-ink sm:text-5xl">{fmt(headline)}</p>
            <DeltaPill value={pctDelta(headline, prevHeadline)} title={t(`ov.prevLabel.${periodKey}`)} />
            <span className="text-xs text-muted">{t(`ov.prevLabel.${periodKey}`)}</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {t(`ov.periods.${periodKey}`)} ({f.day(data.period.from)} – {f.day(data.period.to)}) · {t('ov.main.last12', { total: fmt(total12) })}
            {active === 'revenue' && <> · {t('ov.main.revenueNote')}</>}
          </p>
        </div>
        <Segmented label={t('ov.main.tabsLabel')} items={tabs.map((k) => ({ key: k, label: t(`ov.main.tabs.${k}`) }))} value={active} onChange={setTab} />
      </div>
      <AreaChart
        key={active}
        points={points}
        series={series}
        mode="stacked"
        format={fmt}
        axisFormat={money ? (v) => f.eurCompact(v) : f.tick}
        xLabel={f.monthShort}
        xTitle={f.monthLong}
        legendValue={periodKey === 'month' ? (k) => fmt(values[k][last] ?? 0) : undefined}
        partial={{ factor: partial.factor, note: t('ov.main.partial', { from: f.day(`${m.months[last]}-01`), to: f.day(data.period.to) }) }}
        ariaLabel={t('ov.main.aria', { title })}
        tableHead={t('ov.main.month')}
        height={260}
      />
    </section>
  );
};

// ─── KPI cards ──────────────────────────────────────────────────────────

const KpiStack = ({ data }: { data: OverviewResponse }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const k = data.kpis;
  const vsPrev = t(`ov.prevLabel.${data.period.key}`);
  const trendLabel = (label: string, values: (number | null)[], fmt: (v: number | null) => string) => t('ov.kpi.trend', { label, values: values.map((v, i) => `${f.monthShort(data.monthly.months[i])} ${fmt(v)}`).join(', ') });
  const pointLabel = (i: number) => f.monthShort(data.monthly.months[i]);
  const approvalDiff = k.approvalRate.value !== null && k.approvalRate.prev !== null ? Math.round((k.approvalRate.value - k.approvalRate.prev) * 10) / 10 : null;
  const days = (v: number | null) => (v === null ? '—' : t('ov.kpi.days', { value: f.num1(v) }));
  const rec = k.receivables;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      <StatCard
        icon={FolderOpen}
        label={t('ov.kpi.active')}
        value={f.num(k.activeCases.value)}
        delta={<DeltaPill value={pctDelta(k.activeCases.value, k.activeCases.prev)} better="none" title={t('ov.kpi.activeHint')} />}
        hint={t('ov.kpi.activeHint')}
        to="/admin/cases"
        visual={<Sparkline values={k.activeCases.trend} width={92} height={36} area format={f.num} pointLabel={pointLabel} label={trendLabel(t('ov.kpi.active'), k.activeCases.trend, f.num)} />}
      />
      <StatCard
        icon={BadgeCheck}
        label={t('ov.kpi.approval')}
        value={f.pct(k.approvalRate.value)}
        delta={<DeltaPill value={approvalDiff} unit="pp" title={vsPrev} />}
        hint={t('ov.kpi.approvalHint')}
        visual={<RingGauge value={k.approvalRate.value} size={64} stroke={7} label={t('ov.kpi.approval')} />}
      />
      <StatCard
        icon={Timer}
        label={t('ov.kpi.processing')}
        value={days(k.processingDays.value)}
        delta={<DeltaPill value={pctDelta(k.processingDays.value, k.processingDays.prev)} better="down" title={vsPrev} />}
        hint={t('ov.kpi.processingHint')}
        visual={<Sparkline values={k.processingDays.trend} width={92} height={36} color={VIZ[2]} format={(v) => days(v)} pointLabel={pointLabel} label={trendLabel(t('ov.kpi.processing'), k.processingDays.trend, days)} />}
      />
      {rec ? (
        <StatCard
          icon={Wallet}
          label={t('ov.kpi.receivables')}
          value={f.eur(rec.grossCents)}
          hint={t('ov.kpi.receivablesHint', { overdue: f.eur(rec.overdueCents), count: rec.count })}
          to="/admin/finance"
          visual={<RingGauge value={rec.grossCents ? (rec.overdueCents / rec.grossCents) * 100 : null} size={64} stroke={7} color="var(--color-danger)" label={t('ov.kpi.overdueShare')} />}
        />
      ) : (
        <StatCard
          icon={Inbox}
          label={t('ov.kpi.inquiries')}
          value={f.num(data.summary.newInquiries)}
          delta={<DeltaPill value={pctDelta(data.summary.newInquiries, data.summary.newInquiriesPrev)} title={vsPrev} />}
          hint={vsPrev}
          to="/admin/inquiries"
        />
      )}
    </div>
  );
};

// ─── Funnel ─────────────────────────────────────────────────────────────

const FunnelCard = ({ data }: { data: OverviewResponse }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const [source, setSource] = useState<Source>('all');
  const steps = data.funnel[source].map((s) => ({ key: s.key, label: t(`ov.funnel.steps.${s.key}`), count: s.count, prev: s.prev }));
  const first = steps[0]?.count ?? 0;
  const approved = steps.find((s) => s.key === 'approved')?.count ?? 0;
  return (
    <Card
      id="ov-funnel"
      title={t('ov.funnel.title')}
      subtitle={t('ov.funnel.subtitle')}
      actions={<Segmented label={t('ov.funnel.filter')} items={(['all', 'partner', 'site', 'agent'] as Source[]).map((k) => ({ key: k, label: t(`ov.funnel.sources.${k}`) }))} value={source} onChange={setSource} />}
    >
      <FunnelBars steps={steps} ariaLabel={t('ov.funnel.title')} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-sunken px-3 py-2 text-xs">
        <span className="text-muted">
          <span className="font-semibold text-ink">{t('ov.funnel.overall')}</span> <span className="font-semibold text-link tabular-nums">{f.pct(first ? Math.round((approved / first) * 1000) / 10 : null)}</span>
        </span>
        <Link to="/admin/business-analytics" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
          {t('ov.funnel.open')} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
};

// ─── Segments by visa type ──────────────────────────────────────────────

const SegmentsCard = ({ data }: { data: OverviewResponse }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const segs = data.segments;
  const total = data.summary.newCases;
  const money = data.finance;
  const revenue = segs.reduce((a, s) => a + (s.revenueCents ?? 0), 0);
  const mv = data.movement;
  return (
    <Card id="ov-segments" title={t('ov.segments.title')} subtitle={money ? t('ov.segments.revenueSubtitle', { count: total, revenue: f.eur(revenue) }) : t('ov.segments.subtitle', { count: total })}>
      {segs.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('ov.segments.empty')}</p>
      ) : (
        <>
          <SegmentBar ariaLabel={t('ov.segments.aria')} parts={segs.map((s) => ({ key: s.key, label: t(`ov.visaTypes.${s.key}`), value: s.count, color: TYPE_COLOR[s.key] }))} />
          <table className="mt-4 w-full text-xs">
            <thead className="sr-only">
              <tr>
                <th scope="col">{t('ov.attention.type')}</th>
                <th scope="col">{t('ov.segments.count')}</th>
                {money && <th scope="col">{t('ov.segments.revenue')}</th>}
                <th scope="col">{t('ov.segments.share')}</th>
                <th scope="col">{t('ov.segments.change')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {segs.map((s) => (
                <tr key={s.key}>
                  <th scope="row" className="py-2 pr-2 text-left font-medium text-ink">
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: TYPE_COLOR[s.key] }} aria-hidden />
                      {t(`ov.visaTypes.${s.key}`)}
                    </span>
                  </th>
                  <td className="px-2 py-2 text-right text-muted tabular-nums">{f.num(s.count)}</td>
                  {money && <td className="px-2 py-2 text-right font-semibold text-ink tabular-nums">{f.eur(s.revenueCents)}</td>}
                  <td className="px-2 py-2 text-right text-muted tabular-nums">{f.pct(s.share)}</td>
                  <td className="py-2 pl-2 text-right">
                    <DeltaPill value={s.delta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {money && <p className="mt-2 text-[11px] text-muted">{t('ov.segments.revenueNote')}</p>}
        </>
      )}
      <p className="mt-4 mb-2 text-xs font-medium text-muted">{t('ov.segments.movement')}</p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['created', mv.created, 'text-ink'],
            ['approved', mv.approved, 'text-success-fg'],
            ['rejected', mv.rejected, 'text-danger-fg'],
            ['cancelled', mv.cancelled, 'text-warning-fg'],
          ] as const
        ).map(([k, v, tone]) => (
          <div key={k} className="rounded-lg border border-line px-3 py-2">
            <dt className="text-[11px] text-muted">{t(`ov.segments.${k}`)}</dt>
            <dd className={clsx('text-lg font-semibold tabular-nums', tone)}>{f.num(v)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
};

// ─── Cases that need a look ─────────────────────────────────────────────

const REASON_TONE: Record<Reason, string> = {
  expired: 'border-danger-border bg-danger-bg text-danger-fg',
  expiring: 'border-warning-border bg-warning-bg text-warning-fg',
  waiting: 'border-info-border bg-info-bg text-info-fg',
  stuck: 'border-neutral-border bg-neutral-bg text-neutral-fg',
};

const ReasonChips = ({ reasons }: { reasons: Reason[] }) => {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span key={r} className={clsx('inline-flex h-5 items-center rounded-full border px-1.5 text-[10px] font-semibold whitespace-nowrap', REASON_TONE[r])}>
          {t(`ov.attention.reasons.${r}`)}
        </span>
      ))}
    </span>
  );
};

const Avatar = ({ initials, type }: { initials: string; type: VisaType }) => (
  <span className="relative grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-sunken text-[11px] font-semibold text-ink" aria-hidden>
    {initials}
    <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card" style={{ background: TYPE_COLOR[type] }} />
  </span>
);

const AttentionCard = ({ data }: { data: OverviewResponse }) => {
  const { t } = useTranslation();
  const a = data.attention;
  const trendLabel = (xs: number[]) => t('ov.attention.trendAria', { values: xs.join(', ') });
  return (
    <Card
      id="ov-attention"
      title={t('ov.attention.title')}
      subtitle={t('ov.attention.subtitle', { count: a.total })}
      actions={
        a.total > 0 ? (
          <Link to="/admin/today" className="btn-secondary btn-sm">
            {t('ov.attention.viewAll')}
          </Link>
        ) : undefined
      }
    >
      {a.rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('ov.attention.none')}</p>
      ) : (
        <>
          <div className="-mx-4 hidden overflow-x-auto md:block sm:-mx-5">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="text-[11px] whitespace-nowrap text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">{t('ov.attention.case')}</th>
                  <th scope="col" className="px-2 py-2 font-medium">{t('ov.attention.reason')}</th>
                  <th scope="col" className="px-2 py-2 font-medium">{t('ov.attention.health')}</th>
                  <th scope="col" className="px-2 py-2 font-medium">{t('ov.attention.trend')}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">{t('ov.attention.lastActive')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {a.rows.map((r) => (
                  <tr key={r.caseId} className="hover:bg-sunken/60">
                    <td className="px-4 py-2.5 sm:px-5">
                      <Link to={`/admin/cases/${r.caseId}`} className="group flex max-w-[17rem] min-w-0 items-center gap-2.5" title={statusLabel(r.status)}>
                        <Avatar initials={r.initials} type={r.visaType} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink group-hover:underline">{r.client}</span>
                          <span className="block truncate text-[11px] text-muted">
                            <span className="code-id">{r.number}</span> · {t(`ov.visaTypes.${r.visaType}`)}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">
                      <ReasonChips reasons={r.reasons} />
                    </td>
                    <td className="px-2 py-2.5">
                      <HealthBar score={r.health} />
                    </td>
                    <td className="px-2 py-2.5">
                      <Sparkline values={r.trend} width={64} height={22} focusable={false} color={r.health < 35 ? 'var(--color-danger)' : VIZ[0]} label={trendLabel(r.trend)} />
                    </td>
                    <td className="max-w-[10rem] px-4 py-2.5 text-right sm:px-5">
                      <span className="block whitespace-nowrap text-ink">{fmtRelative(r.lastActivityAt)}</span>
                      <span className="block truncate text-[11px] text-muted" title={t('ov.attention.assignee')}>
                        {r.assignee ?? <span className="italic">{t('ov.attention.unassigned')}</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="-mx-4 divide-y divide-line border-t border-line md:hidden">
            {a.rows.map((r) => (
              <li key={r.caseId}>
                <Link to={`/admin/cases/${r.caseId}`} className="flex items-start gap-3 px-4 py-3">
                  <Avatar initials={r.initials} type={r.visaType} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{r.client}</span>
                      <HealthBar score={r.health} width="w-10" />
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      <span className="code-id">{r.number}</span> · {t(`ov.visaTypes.${r.visaType}`)} · {fmtRelative(r.lastActivityAt)}
                    </span>
                    <span className="mt-1.5 block">
                      <ReasonChips reasons={r.reasons} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
};

// ─── Live activity ──────────────────────────────────────────────────────

const ACTIVITY_ICON = (i: ActivityResponse['items'][number]): LucideIcon => {
  if (i.kind === 'inquiry') return Inbox;
  if (i.kind === 'payment') return CircleDollarSign;
  if (i.toStatus === 'APPROVED') return BadgeCheck;
  if (i.toStatus === 'APPOINTMENT_SCHEDULED') return CalendarCheck;
  if (i.type.startsWith('DOCUMENT')) return FileCheck2;
  return Activity;
};

const channelName = (t: (k: string) => string, key: string) => (key.startsWith('utm:') ? key.slice(4) : t(`ov.channels.names.${key}`));

const ActivityCard = ({ finance }: { finance: boolean }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const [paused, setPaused] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview-activity', finance],
    queryFn: async () => (await api.get<ActivityResponse>('/admin/analytics/overview/activity', { params: { limit: 10 } })).data,
    refetchInterval: paused ? false : 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });
  const text = (i: ActivityResponse['items'][number]) => {
    if (i.kind === 'inquiry') return i.type === 'company' ? t('ov.activity.inquiryCompany') : t('ov.activity.inquiry');
    if (i.kind === 'payment') return `${t('ov.activity.payment')}: ${i.currency === 'EUR' || !i.currency ? f.eur(i.amountCents) : `${f.num((i.amountCents ?? 0) / 100)} ${i.currency}`}`;
    return i.toStatus && i.type !== 'CASE_CREATED' ? `${eventLabel(i.type)} → ${statusLabel(i.toStatus)}` : eventLabel(i.type);
  };
  return (
    <Card
      id="ov-activity"
      title={
        <span className="inline-flex items-center gap-2">
          <span className="relative flex size-2" aria-hidden>
            {!paused && <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />}
            <span className={clsx('relative inline-flex size-2 rounded-full', paused ? 'bg-line-strong' : 'bg-success')} />
          </span>
          {t('ov.activity.title')}
        </span>
      }
      subtitle={data ? t('ov.activity.today', { count: data.today }) : undefined}
      actions={
        <button type="button" className="btn-secondary btn-sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />} {paused ? t('ov.activity.resume') : t('ov.activity.pause')}
        </button>
      }
    >
      {isLoading ? (
        <div className="grid h-40 place-items-center">
          <Spinner className="size-5 text-link" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('ov.activity.empty')}</p>
      ) : (
        <ol className="-my-1 divide-y divide-line" aria-live="polite" aria-relevant="additions">
          {data.items.map((i) => {
            const Icon = ACTIVITY_ICON(i);
            const tag = i.visaType ? t(`ov.visaTypes.${i.visaType}`) : i.channel ? channelName(t, i.channel) : null;
            const body = (
              <>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-sunken text-muted" aria-hidden>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{text(i)}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {fmtRelative(i.at)}
                    {i.caseNumber && (
                      <>
                        {' · '}
                        <span className="code-id">{i.caseNumber}</span>
                      </>
                    )}
                  </span>
                </span>
                {tag && (
                  <span className="hidden shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold text-muted sm:inline-flex">
                    {i.visaType && <span className="size-1.5 rounded-full" style={{ background: TYPE_COLOR[i.visaType] }} aria-hidden />}
                    {tag}
                  </span>
                )}
              </>
            );
            return (
              <li key={i.id}>
                {i.caseId ? (
                  <Link to={`/admin/cases/${i.caseId}`} className="flex items-center gap-3 rounded-md py-2.5 hover:bg-sunken/60">
                    {body}
                  </Link>
                ) : i.kind === 'inquiry' ? (
                  <Link to="/admin/inquiries" className="flex items-center gap-3 rounded-md py-2.5 hover:bg-sunken/60">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
};

// ─── Leads by channel ───────────────────────────────────────────────────

const ChannelsCard = ({ data }: { data: OverviewResponse }) => {
  const { t } = useTranslation();
  return (
    <Card
      id="ov-channels"
      title={t('ov.channels.title')}
      subtitle={t('ov.channels.subtitle')}
      actions={
        <Link to="/admin/inquiries" className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
          {t('ov.kpi.inquiries')} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
    >
      {data.channels.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('ov.channels.empty')}</p>
      ) : (
        <HBarList rows={data.channels.map((c) => ({ key: c.key, label: channelName(t, c.key), name: channelName(t, c.key), value: c.count, prev: c.prev, extra: <DeltaPill value={pctDelta(c.count, c.prev)} className="hidden sm:inline-flex" /> }))} />
      )}
    </Card>
  );
};

// ─── Annual goal ────────────────────────────────────────────────────────

const GoalCard = ({ data, canEdit }: { data: OverviewResponse; canEdit: boolean }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const qc = useQueryClient();
  const g = data.goal;
  const year = Number(data.period.to.slice(0, 4));
  const [editing, setEditing] = useState(false);
  const [metric, setMetric] = useState<'visas' | 'revenue'>(g.metric);
  const [target, setTarget] = useState('');
  const save = useMutation({
    mutationFn: async (body: { metric: 'visas' | 'revenue'; target: number; year: number }) => api.put('/admin/analytics/overview/goal', body),
    onSuccess: async () => {
      toast.success(t('ov.goal.saved'));
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
    onError: (e) => toastError(e),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(target.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error(t('ov.goal.invalid'));
      return;
    }
    save.mutate({ metric, year, target: Math.round(metric === 'revenue' ? n * 100 : n) });
  };
  if (g.hidden) return null;
  const money = g.metric === 'revenue';
  const fmt = (v: number | null) => (v === null ? '—' : money ? f.eur(v) : f.num1(v));
  const startEdit = () => {
    setMetric(g.metric);
    setTarget(g.target ? String(money ? Math.round(g.target / 100) : g.target) : '');
    setEditing(true);
  };
  const title = g.target ? t(money ? 'ov.goal.titleRevenue' : 'ov.goal.titleVisas', { year: g.year, target: money ? f.eurCompact(g.target) : f.num(g.target) }) : t('ov.goal.title');
  const beyond = g.reachDate && Number(g.reachDate.slice(0, 4)) > g.year;

  return (
    <Card
      id="ov-goal"
      title={
        <span className="inline-flex items-center gap-2">
          <Target className="size-4 text-muted" aria-hidden /> {title}
        </span>
      }
      subtitle={t('ov.goal.subtitle')}
      actions={
        canEdit && !editing ? (
          <button type="button" className="btn-secondary btn-sm" onClick={startEdit}>
            {g.target ? t('ov.goal.edit') : t('ov.goal.set')}
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="min-w-0">
            <span className="label">{t('ov.goal.metric')}</span>
            <select className="input" value={metric} onChange={(e) => setMetric(e.target.value as 'visas' | 'revenue')}>
              <option value="visas">{t('ov.goal.metrics.visas')}</option>
              <option value="revenue">{t('ov.goal.metrics.revenue')}</option>
            </select>
          </label>
          <label className="min-w-0">
            <span className="label">
              {t('ov.goal.target')} ({year})
            </span>
            <input className="input" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} required />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
              {t('ov.goal.save')}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(false)}>
              {t('ov.goal.cancel')}
            </button>
          </div>
        </form>
      ) : !g.target ? (
        <div className="flex items-center gap-4 py-2">
          <RingGauge value={null} size={96} stroke={9} label={t('ov.goal.title')} center={<Gauge className="size-5 text-muted" />} />
          <p className="text-sm text-muted">{canEdit ? t('ov.goal.none') : t('ov.goal.noneStaff')}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <RingGauge value={Math.min(100, g.pct ?? 0)} size={132} stroke={11} label={t('ov.goal.title')} center={<span className="text-2xl">{f.pct(Math.round(g.pct ?? 0))}</span>} sub={t('ov.goal.ofGoal')} />
          <dl className="w-full min-w-0 flex-1 divide-y divide-line text-sm">
            {(
              [
                ['now', fmt(g.value)],
                ['remaining', g.reached ? t('ov.goal.reached') : fmt(g.remaining)],
                ['perMonth', fmt(g.perMonth)],
                ['projected', fmt(g.projected)],
                ['reachDate', g.reached ? '✓' : g.reachDate ? f.dayYear(g.reachDate) : '—'],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-xs text-muted">{t(`ov.goal.${k}`)}</dt>
                <dd className={clsx('text-right font-semibold whitespace-nowrap text-ink tabular-nums', k === 'reachDate' && beyond && 'text-warning-fg')}>
                  {v}
                  {k === 'reachDate' && beyond && <span className="block text-[10px] font-medium text-muted">{t('ov.goal.beyondYear')}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Card>
  );
};
