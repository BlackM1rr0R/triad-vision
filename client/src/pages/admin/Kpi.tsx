import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Download, Gauge, Trophy } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesTeam } from '@/i18n/pagesTeam';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { DeltaBadge, METRICS, MonthSwitcher, monthShort, type MetricDef } from '@/components/team/KpiCard';
import { Sparkline } from '@/components/team/Sparkline';
import { bakuMonth, useTeamKpi, type NumericKey, type TeamKpi } from '@/components/team/api';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { PerformanceReport } from '@/components/staffOps/PerformanceReport'; // free-period staff performance report + CSV

registerCopy(pagesTeam);

type Row = TeamKpi['rows'][number];

const sortValue = (r: Row, key: NumericKey) => {
  const v = r.current[key] as number | null;
  return v === null ? -Infinity : v;
};

/** Admin → KPI: every active staff member for a month, sortable by any metric, with team averages and CSV. */
export default function AdminKpi() {
  const { t } = useTranslation();
  usePageTitle(t('team.kpi.pageTitle'));
  const { user } = useAuth();
  const [month, setMonth] = useState(bakuMonth());
  const [sortKey, setSortKey] = useState<NumericKey>('closed');
  const [spark, setSpark] = useState<NumericKey>('closed');
  const { data, isLoading, error, refetch } = useTeamKpi(month);
  const [tab, setTab] = useTabParam('tab', ['leaderboard', 'report'] as const, 'leaderboard');

  const def = (key: NumericKey) => METRICS.find((m) => m.key === key)!;
  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])];
    const d = def(sortKey);
    // "Lower is better" metrics rank the smallest value first (people without a value last).
    list.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (d.better === 'down') return (va === -Infinity ? Infinity : va) - (vb === -Infinity ? Infinity : vb);
      return vb - va;
    });
    return list;
  }, [data, sortKey]);

  const sparkDef = def(spark);
  const exportUrl = `/api/admin/kpi/team/export.csv?month=${month}`;

  return (
    <div className="space-y-5">
      <PageHead
        title={t('team.kpi.pageTitle')}
        subtitle={t('team.kpi.pageSubtitle')}
        actions={
          tab === 'leaderboard' ? (
            <div className="flex flex-wrap items-center gap-2">
              <MonthSwitcher month={month} onChange={setMonth} />
              <a href={exportUrl} className="btn-secondary btn-sm" download>
                <Download className="size-3.5" /> {t('team.kpi.csv')}
              </a>
            </div>
          ) : undefined
        }
      />
      <Tabs
        label={t('team.kpi.pageTitle')}
        items={[
          { key: 'leaderboard', label: t('staffOps.perf.tabLeaderboard') },
          { key: 'report', label: t('staffOps.perf.tabReport') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'report' ? (
        <PerformanceReport />
      ) : isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data.rows.length ? (
        <EmptyState icon={Gauge} title={t('team.kpi.empty')} />
      ) : (
        <>
          <Panel
            title={t('team.kpi.leaderboard')}
            icon={Trophy}
            bodyClassName="p-0"
            actions={
              <label className="flex items-center gap-2 text-xs text-muted">
                {t('team.kpi.sparkMetric')}
                <select className="input h-8 py-0 text-xs" value={spark} onChange={(e) => setSpark(e.target.value as NumericKey)}>
                  {METRICS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {t(`team.kpi.m.${m.key}`)}
                    </option>
                  ))}
                </select>
              </label>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-xs">
                <thead className="border-b border-line bg-surface/70 text-xs font-medium whitespace-nowrap text-muted">
                  <tr>
                    <th className="sticky left-0 z-10 bg-sunken px-4 py-2">{t('team.kpi.staff')}</th>
                    {METRICS.map((m) => (
                      <th key={m.key} className="px-2 py-2 text-right" aria-sort={sortKey === m.key ? 'descending' : undefined}>
                        <button type="button" onClick={() => setSortKey(m.key)} className={clsx('inline-flex min-h-8 items-center uppercase hover:text-ink', sortKey === m.key && 'text-link')}>
                          {t(`team.kpi.short.${m.key}`)}
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right">{t('team.kpi.trend', { months: data.months.length })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r, i) => (
                    <tr key={r.staff.id} className={clsx(r.staff.id === user?.id && 'bg-primary/[0.04]')}>
                      <td className="sticky left-0 z-10 bg-card px-4 py-2">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span className="w-5 text-right text-muted tabular-nums">{i + 1}</span>
                          {user?.role === 'SUPER_ADMIN' ? (
                            <Link to={`/admin/oversight/staff/${r.staff.id}`} className="font-semibold text-ink hover:text-link hover:underline">
                              {r.staff.name}
                            </Link>
                          ) : (
                            <span className="font-semibold text-ink">{r.staff.name}</span>
                          )}
                        </span>
                      </td>
                      {METRICS.map((m) => (
                        <Cell key={m.key} def={m} row={r} />
                      ))}
                      <td className="px-3 py-2 text-right">
                        <Sparkline
                          values={r.series.map((s) => s[spark] as number | null)}
                          label={t('team.kpi.trendAria', { metric: t(`team.kpi.m.${spark}`), values: r.series.map((s) => `${monthShort(s.month)} ${sparkDef.fmt(s[spark] as number | null)}`).join(', ') })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-line bg-surface/60 font-semibold">
                  <tr>
                    <td className="sticky left-0 z-10 bg-sunken px-4 py-2 whitespace-nowrap text-ink">{t('team.kpi.teamAverage', { count: data.team.size })}</td>
                    {METRICS.map((m) => (
                      <td key={m.key} className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                        {m.fmt(data.team.average[m.key] as number | null)}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
          <p className="text-xs text-muted">{t('team.kpi.attributionNote')}</p>
        </>
      )}
    </div>
  );
}

const Cell = ({ def, row }: { def: MetricDef; row: Row }) => (
  <td className="px-2 py-2 text-right whitespace-nowrap">
    <span className="block font-semibold text-ink tabular-nums">{def.fmt(row.current[def.key] as number | null)}</span>
    <DeltaBadge d={row.deltas[def.key]} better={def.better} />
  </td>
);
