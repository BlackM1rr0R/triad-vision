import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Gauge, Minus } from 'lucide-react';
import { currentLocale, registerCopy, type Locale } from '@/i18n';
import { pagesTeam } from '@/i18n/pagesTeam';
import { adminCopy } from '@/i18n/admin'; // status / event labels (also used inside the workspace)
import { money } from '@/components/agents/format';
import { fmtMinutes, statusLabel } from '@/components/admin/labels';
import { ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import { TONE_TEXT } from '@/components/ui/status';
import { Sparkline } from './Sparkline';
import { STAGES, bakuMonth, shiftMonth, type Delta, type KpiMetrics, type NumericKey, type StaffKpiCard } from './api';

registerCopy(adminCopy);
registerCopy(pagesTeam);

const INTL: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

/** "Oktyabr 2026" in the UI language. */
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat(INTL[currentLocale()], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));
export const monthShort = (month: string) => new Intl.DateTimeFormat(INTL[currentLocale()], { month: 'short', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));

const num = (v: number | null, digits = 1) => (v === null ? '—' : new Intl.NumberFormat(INTL[currentLocale()], { maximumFractionDigits: digits }).format(v));

export interface MetricDef {
  key: NumericKey;
  /** Higher is better ("up") or lower is better ("down"); neutral metrics get no colour. */
  better: 'up' | 'down' | 'none';
  fmt: (v: number | null) => string;
}

/** The KPI tiles in display order (shared by the card, the leaderboard and its CSV-like table). */
export const METRICS: MetricDef[] = [
  { key: 'closed', better: 'up', fmt: (v) => num(v, 0) },
  { key: 'assigned', better: 'none', fmt: (v) => num(v, 0) },
  { key: 'avgCaseDays', better: 'down', fmt: (v) => num(v) },
  { key: 'docsReviewed', better: 'up', fmt: (v) => num(v, 0) },
  { key: 'avgFirstResponseHours', better: 'down', fmt: (v) => num(v) },
  { key: 'csat', better: 'up', fmt: (v) => num(v) },
  { key: 'nps', better: 'up', fmt: (v) => num(v, 0) },
  { key: 'revenueCents', better: 'up', fmt: (v) => (v === null ? '—' : money(v)) },
  { key: 'marginCents', better: 'up', fmt: (v) => (v === null ? '—' : money(v)) },
  { key: 'minutes', better: 'none', fmt: (v) => fmtMinutes(v) },
  { key: 'tasksDone', better: 'up', fmt: (v) => num(v, 0) },
  { key: 'tasksOverdue', better: 'down', fmt: (v) => num(v, 0) },
  { key: 'approvalsGiven', better: 'up', fmt: (v) => num(v, 0) },
];

/** Arrow + percent (or absolute change) against the previous month, green when it moved the good way. */
export const DeltaBadge = ({ d, better, className }: { d: Delta | undefined; better: MetricDef['better']; className?: string }) => {
  const { t } = useTranslation();
  if (!d || d.diff === null) return <span className={clsx('text-[11px] text-muted', className)}>—</span>;
  const Icon = d.diff > 0 ? ArrowUpRight : d.diff < 0 ? ArrowDownRight : Minus;
  const good = better === 'none' || d.diff === 0 ? null : (d.diff > 0) === (better === 'up');
  const text = d.pct !== null ? `${d.pct > 0 ? '+' : ''}${d.pct}%` : `${d.diff > 0 ? '+' : ''}${num(d.diff)}`;
  return (
    <span
      className={clsx('inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums', good === null ? 'text-muted' : good ? TONE_TEXT.success : TONE_TEXT.danger, className)}
      title={t('team.kpi.vsPrevious')}
    >
      <Icon className="size-3" aria-hidden />
      {text}
    </span>
  );
};

/** Month switcher: ‹ Oktyabr 2026 › (never past the current month). */
export const MonthSwitcher = ({ month, onChange }: { month: string; onChange: (m: string) => void }) => {
  const { t } = useTranslation();
  const now = bakuMonth();
  return (
    <div className="inline-flex items-center gap-1">
      <button type="button" className="btn-secondary btn-sm px-2" aria-label={t('team.kpi.prevMonth')} onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-32 text-center text-sm font-semibold text-ink capitalize">{monthLabel(month)}</span>
      <button type="button" className="btn-secondary btn-sm px-2" aria-label={t('team.kpi.nextMonth')} disabled={month >= now} onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
};

const Tile = ({ def, data }: { def: MetricDef; data: StaffKpiCard }) => {
  const { t } = useTranslation();
  const cur = data.current[def.key] as number | null;
  const avg = data.team.average[def.key] as number | null;
  const series = data.series.map((s) => s[def.key] as number | null);
  const label = t(`team.kpi.m.${def.key}`);
  const extra =
    def.key === 'closed'
      ? t('team.kpi.closedSplit', { approved: data.current.approved, rejected: data.current.rejected, cancelled: data.current.cancelled })
      : def.key === 'docsReviewed'
        ? t('team.kpi.docsSplit', { accepted: data.current.docsAccepted, rejected: data.current.docsRejected })
        : def.key === 'avgFirstResponseHours'
          ? t('team.kpi.replies', { count: data.current.responses })
          : def.key === 'csat' || def.key === 'nps'
            ? t('team.kpi.surveys', { count: data.current.surveys })
            : null;
  return (
    <div className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-line bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-snug font-medium text-muted">{label}</p>
        <DeltaBadge d={data.deltas[def.key]} better={def.better} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-xl font-bold text-ink tabular-nums">{def.fmt(cur)}</p>
          {extra && <p className="mt-0.5 truncate text-[11px] text-muted">{extra}</p>}
          <p className="mt-0.5 truncate text-[11px] text-muted">{t('team.kpi.teamAvg', { value: def.fmt(avg) })}</p>
        </div>
        <Sparkline values={series} width={72} label={t('team.kpi.trendAria', { metric: label, values: series.map((v) => def.fmt(v)).join(', ') })} />
      </div>
    </div>
  );
};

/** Average days per stage (this month, the team, the previous month). */
const StageTable = ({ data }: { data: StaffKpiCard }) => {
  const { t } = useTranslation();
  const rows = STAGES.filter((s) => data.current.stageDays[s] !== undefined || data.team.average.stageDays[s] !== undefined);
  if (!rows.length) return <p className="text-sm text-muted">{t('team.kpi.noStages')}</p>;
  const max = Math.max(...rows.map((s) => Math.max(data.current.stageDays[s] ?? 0, data.team.average.stageDays[s] ?? 0)), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((s) => {
        const mine = data.current.stageDays[s];
        const team = data.team.average.stageDays[s];
        return (
          <li key={s} className="text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate font-medium text-ink">{statusLabel(s)}</span>
              <span className="shrink-0 text-muted tabular-nums">
                {t('team.kpi.stageValue', { mine: num(mine ?? null), team: num(team ?? null) })}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-surface">
              {mine !== undefined && <div className="absolute inset-y-0 left-0 rounded-full bg-brand-500" style={{ width: `${(mine / max) * 100}%` }} />}
              {team !== undefined && <div className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded bg-ink/60" style={{ left: `calc(${(team / max) * 100}% - 1px)` }} title={t('team.kpi.teamMarker')} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/** The KPI card of one staff member: tiles with month-over-month change, 6-month sparklines, team context, stages. */
export const KpiCard = ({
  data,
  isLoading,
  error,
  onRetry,
  month,
  onMonth,
  title,
}: {
  data: StaffKpiCard | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
  month: string;
  onMonth: (m: string) => void;
  title?: string;
}) => {
  const { t } = useTranslation();
  return (
    <Panel title={title ?? t('team.kpi.cardTitle')} icon={Gauge} actions={<MonthSwitcher month={month} onChange={onMonth} />}>
      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={onRetry} />
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-muted">{t('team.kpi.cardHint', { previous: monthLabel(data.months[data.months.length - 2]), size: data.team.size })}</p>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {METRICS.map((m) => (
              <Tile key={m.key} def={m} data={data} />
            ))}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t('team.kpi.stagesTitle')}</h3>
            <StageTable data={data} />
          </div>
        </div>
      )}
    </Panel>
  );
};

export type { KpiMetrics };
