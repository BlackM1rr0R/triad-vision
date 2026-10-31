import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarRange, Download, Filter, Users } from 'lucide-react';
import { errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesStaffOps } from '@/i18n/pagesStaffOps';
import { EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import { useStaffPerformance, type PerformanceKey, type PerformanceRow } from './api';

registerCopy(pagesStaffOps);

/** Today in Baku (UTC+4, no DST) as YYYY-MM-DD. */
const bakuToday = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Preset = 'thisMonth' | 'lastMonth' | 'last30' | 'last90' | 'thisYear';
const PRESETS: Preset[] = ['thisMonth', 'lastMonth', 'last30', 'last90', 'thisYear'];
const presetRange = (p: Preset): { from: string; to: string } => {
  const today = bakuToday();
  const [y, m] = today.split('-').map(Number);
  switch (p) {
    case 'thisMonth':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'lastMonth': {
      const first = new Date(Date.UTC(y, m - 2, 1));
      const last = new Date(Date.UTC(y, m - 1, 0));
      return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
    }
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'thisYear':
      return { from: `${y}-01-01`, to: today };
  }
};

const num = (v: number | null, digits = 1) => (v === null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits }));

interface Col {
  key: PerformanceKey;
  /** Lower is better (sorted ascending; people without a value last). */
  down?: boolean;
  digits?: number;
  /** Observation count shown under an average. */
  count?: PerformanceKey;
  hint?: boolean;
  /** Overdue counts are highlighted when above zero. */
  warn?: boolean;
}

const COLS: Col[] = [
  { key: 'casesClosed', digits: 0 },
  { key: 'approved', digits: 0 },
  { key: 'tasksDone', digits: 0 },
  { key: 'tasksMissed', down: true, digits: 0, hint: true, warn: true },
  { key: 'openOverdueTasks', down: true, digits: 0, hint: true, warn: true },
  { key: 'overdueCases', down: true, digits: 0, hint: true, warn: true },
  { key: 'avgMessageReplyHours', down: true, count: 'messageReplies', hint: true },
  { key: 'avgInquiryResponseHours', down: true, count: 'inquiryResponses', hint: true },
  { key: 'csat', count: 'surveys' },
  { key: 'nps', digits: 0, count: 'surveys' },
  { key: 'reviewAvg', count: 'reviews', hint: true },
  { key: 'docsReviewed', digits: 0 },
  { key: 'hours' },
];

/** Admin → KPI → "Performance report": every active staff member over a free period, sortable, with CSV. */
export const PerformanceReport = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [range, setRange] = useState(() => presetRange('thisMonth'));
  const [draft, setDraft] = useState(range);
  const [sortKey, setSortKey] = useState<PerformanceKey>('casesClosed');
  const { data, isLoading, error, refetch } = useStaffPerformance(range.from, range.to);

  const rows = useMemo(() => {
    const col = COLS.find((c) => c.key === sortKey)!;
    const val = (r: PerformanceRow) => r[sortKey] as number | null;
    return [...(data?.rows ?? [])].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === null && vb === null) return a.staff.name.localeCompare(b.staff.name);
      if (va === null) return 1;
      if (vb === null) return -1;
      return (col.down ? va - vb : vb - va) || a.staff.name.localeCompare(b.staff.name);
    });
  }, [data, sortKey]);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    if (draft.from && draft.to) setRange(draft);
  };
  const pick = (p: Preset) => {
    const r = presetRange(p);
    setDraft(r);
    setRange(r);
  };
  const exportUrl = `/api/admin/kpi/performance/export.csv?from=${range.from}&to=${range.to}`;
  const activePreset = PRESETS.find((p) => {
    const r = presetRange(p);
    return r.from === range.from && r.to === range.to;
  });

  return (
    <div className="space-y-5">
      <Panel title={t('staffOps.perf.title')} icon={CalendarRange}>
        <p className="text-sm text-muted">{t('staffOps.perf.intro')}</p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t('staffOps.perf.title')}>
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => pick(p)} aria-pressed={activePreset === p} className={clsx('btn-sm', activePreset === p ? 'btn-primary' : 'btn-secondary')}>
              {t(`staffOps.perf.presets.${p}`)}
            </button>
          ))}
        </div>
        <form onSubmit={apply} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="label">{t('staffOps.perf.from')}</span>
            <input type="date" className="input" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} required />
          </label>
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="label">{t('staffOps.perf.to')}</span>
            <input type="date" className="input" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} required />
          </label>
          <button type="submit" className="btn-primary min-h-10 sm:min-h-9">
            <Filter className="size-4" aria-hidden /> {t('staffOps.perf.apply')}
          </button>
          <a href={exportUrl} className="btn-secondary min-h-10 sm:min-h-9" download>
            <Download className="size-4" aria-hidden /> {t('staffOps.perf.csv')}
          </a>
        </form>
      </Panel>

      {isLoading ? (
        <LoadingBlock />
      ) : error && errorCode(error) === 'INVALID_RANGE' ? (
        <p className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg" role="alert">
          {t('staffOps.perf.invalidRange')}
        </p>
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data.rows.length ? (
        <EmptyState icon={Users} title={t('staffOps.perf.empty')} />
      ) : (
        <Panel title={`${data.from} – ${data.to}`} icon={Users} bodyClassName="p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs">
              <thead className="border-b border-line bg-surface/70 text-xs font-medium text-muted">
                <tr>
                  <th className="sticky left-0 z-10 bg-sunken px-4 py-2">{t('staffOps.perf.staff')}</th>
                  {COLS.map((c) => (
                    <th key={c.key} className="px-2 py-2 text-right align-bottom" aria-sort={sortKey === c.key ? (c.down ? 'ascending' : 'descending') : undefined}>
                      <button
                        type="button"
                        onClick={() => setSortKey(c.key)}
                        title={c.hint ? t(`staffOps.perf.hint.${c.key}`) : undefined}
                        className={clsx('inline-flex min-h-8 max-w-[7.5rem] items-end text-right leading-tight hover:text-ink', sortKey === c.key && 'text-link')}
                      >
                        {t(`staffOps.perf.col.${c.key}`)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.staff.id} className={clsx(r.staff.id === user?.id && 'bg-primary/[0.04]')}>
                    <td className="sticky left-0 z-10 bg-card px-4 py-2 font-semibold whitespace-nowrap text-ink">{r.staff.name}</td>
                    {COLS.map((c) => {
                      const v = r[c.key] as number | null;
                      return (
                        <td key={c.key} className="px-2 py-2 text-right whitespace-nowrap">
                          <span className={clsx('block font-semibold tabular-nums', c.warn && v ? 'text-danger-fg' : 'text-ink')}>{num(v, c.digits)}</span>
                          {c.count && v !== null && <span className="block text-[11px] text-muted">{t('staffOps.perf.count', { count: r[c.count] as number })}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line bg-surface/60 font-semibold">
                <tr>
                  <td className="sticky left-0 z-10 bg-sunken px-4 py-2 whitespace-nowrap text-ink">{t('staffOps.perf.team', { count: data.team.size })}</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                      {num(data.team.total[c.key], c.digits)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      )}
      <p className="text-xs text-muted">{t('staffOps.perf.note')}</p>
    </div>
  );
};
