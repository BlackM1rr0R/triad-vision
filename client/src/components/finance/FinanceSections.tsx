import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BadgeEuro,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  FolderPlus,
  HandCoins,
  Handshake,
  Languages,
  Layers,
  LineChart as LineIcon,
  Percent,
  Receipt,
  Scale,
  Table2,
  Timer,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { EmptyState, ErrorBlock, LoadingBlock, Panel, StatTile } from '@/components/admin/ui';
import { LineChart, SERIES_COLORS, type Series } from '@/components/admin/charts';
import { statusTone, TONE_BORDER, TONE_CLASS } from '@/components/ui/status';
import { useFinanceFormat } from './format';
import type { AgingBucket, ByTypeResponse, CommissionsResponse, FinanceMonth, FinanceRange, FinanceSummary, ReceivablesResponse, StaffRow, TypeRow } from './types';

const useFinance = <T,>(path: string, range: FinanceRange) =>
  useQuery({
    queryKey: ['admin-finance', path, range.from, range.to],
    queryFn: async () => (await api.get<T>(`/admin/finance/${path}`, { params: range })).data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

/** Loading / error / fade-while-refetching wrapper shared by every section. */
const Async = <T,>({ q, children }: { q: ReturnType<typeof useFinance<T>>; children: (data: T) => ReactNode }) => {
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  return <div className={clsx('space-y-6 transition-opacity', q.isFetching && 'opacity-70')}>{children(q.data)}</div>;
};

const TH = 'px-3 py-2 text-right whitespace-nowrap';
const TH_FIRST = 'px-5 py-2 text-left whitespace-nowrap sm:px-6';
const TD = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
const TD_FIRST = 'px-5 py-2 sm:px-6';

const Table = ({ minWidth, head, children, foot }: { minWidth: number; head: ReactNode; children: ReactNode; foot?: ReactNode }) => (
  <div className="-mx-5 overflow-x-auto sm:-mx-6">
    <table className="w-full text-sm" style={{ minWidth }}>
      <thead className="text-xs font-medium text-muted">
        <tr>{head}</tr>
      </thead>
      <tbody className="divide-y divide-line">{children}</tbody>
      {foot && <tfoot className="border-t-2 border-line font-semibold text-ink">{foot}</tfoot>}
    </table>
  </div>
);

// ─── Overview: KPI cards, monthly chart and table ───────────────────────

export const FinanceOverview = ({ range }: { range: FinanceRange }) => {
  const { t } = useTranslation();
  const f = useFinanceFormat();
  const summary = useFinance<{ summary: FinanceSummary }>('summary', range);
  const monthly = useFinance<{ months: FinanceMonth[] }>('monthly', range);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(['invoiced']));
  const series = useMemo<Series[]>(
    () => [
      { key: 'paid', label: t('finance.chart.paid'), color: SERIES_COLORS[0] },
      { key: 'outstanding', label: t('finance.chart.outstanding'), color: SERIES_COLORS[1] },
      { key: 'commissions', label: t('finance.chart.commissions'), color: SERIES_COLORS[2] },
      { key: 'translation', label: t('finance.chart.translation'), color: SERIES_COLORS[3] },
      { key: 'invoiced', label: t('finance.chart.invoiced'), color: SERIES_COLORS[6] },
    ],
    [t],
  );
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-6">
      <Async q={summary}>
        {({ summary: s }) => (
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatTile icon={BadgeEuro} tone="good" label={t('finance.kpi.revenue')} value={f.money(s.revenue.grossCents)} hint={t('finance.kpi.revenueHint', { net: f.money(s.revenue.netCents), count: s.revenue.count })} />
            <StatTile
              icon={Receipt}
              tone={s.receivables.overdueGrossCents > 0 ? 'warn' : undefined}
              label={t('finance.kpi.receivables')}
              value={f.money(s.receivables.grossCents)}
              hint={t('finance.kpi.receivablesHint', { count: s.receivables.count, overdue: f.money(s.receivables.overdueGrossCents) })}
            />
            <StatTile icon={Languages} label={t('finance.kpi.translation')} value={f.money(s.translation.cents)} hint={t('finance.kpi.translationHint', { count: s.translation.count })} />
            <StatTile
              icon={HandCoins}
              label={t('finance.kpi.commissions')}
              value={f.money(s.commissions.paidCents)}
              hint={t('finance.kpi.commissionsHint', { pending: f.money(s.commissions.pendingCents), approved: f.money(s.commissions.approvedCents) })}
            />
            {s.partnerCommissions && (
              <StatTile
                icon={Handshake}
                label={t('finance.kpi.partnerCommissions')}
                value={f.money(s.partnerCommissions.paidCents)}
                hint={t('finance.kpi.partnerCommissionsHint', { pending: f.money(s.partnerCommissions.pendingCents), approved: f.money(s.partnerCommissions.approvedCents) })}
              />
            )}
            <StatTile icon={Scale} tone={s.netResultCents < 0 ? 'danger' : 'good'} label={t('finance.kpi.net')} value={f.money(s.netResultCents)} hint={t('finance.kpi.netHint')} />
            <StatTile icon={FolderPlus} label={t('finance.kpi.newCases')} value={s.cases.new} />
            <StatTile icon={CheckCircle2} tone="good" label={t('finance.kpi.approved')} value={s.cases.approved} hint={t('finance.kpi.approvedHint', { rejected: s.cases.rejected })} />
            <StatTile icon={Percent} label={t('finance.kpi.conversion')} value={f.pct(s.cases.conversionPct)} hint={t('finance.kpi.conversionHint', { decided: s.cases.decided })} />
            <StatTile icon={Timer} label={t('finance.kpi.avgDays')} value={s.cases.avgDaysToDecision == null ? '—' : t('finance.receivables.days', { count: s.cases.avgDaysToDecision })} hint={t('finance.kpi.avgDaysHint')} />
          </div>
        )}
      </Async>

      <Async q={monthly}>
        {({ months }) => {
          const points = months.map((m) => ({
            x: m.month,
            values: {
              paid: Math.round(m.paidCents / 100),
              outstanding: Math.round((m.outstandingCents ?? 0) / 100),
              // Agent and referral-partner payouts together.
              commissions: Math.round((m.commissionsPaidCents + (m.partnerCommissionsPaidCents ?? 0)) / 100),
              translation: Math.round(m.translationCents / 100),
              invoiced: Math.round(m.invoicedCents / 100),
            },
          }));
          const empty = months.every((m) => !m.invoicedCents && !m.paidCents && !m.outstandingCents && !m.translationCents && !m.commissionsPaidCents && !m.partnerCommissionsPaidCents && !m.newCases);
          return (
            <>
              <Panel title={t('finance.chart.title')} icon={LineIcon}>
                {empty ? (
                  <EmptyState icon={LineIcon} title={t('finance.empty')} />
                ) : (
                  <LineChart points={points} series={series} hidden={hidden} onToggle={toggle} xLabel={f.month} xTitle={f.month} ariaLabel={t('finance.chart.aria')} emptyText={t('finance.empty')} />
                )}
              </Panel>
              <Panel title={t('finance.monthTable.title')} icon={Table2}>
                <Table
                  minWidth={760}
                  head={
                    <>
                      <th className={TH_FIRST}>{t('finance.monthTable.month')}</th>
                      <th className={TH}>{t('finance.monthTable.invoiced')}</th>
                      <th className={TH}>{t('finance.monthTable.paid')}</th>
                      <th className={TH}>{t('finance.monthTable.outstanding')}</th>
                      <th className={TH}>{t('finance.monthTable.translation')}</th>
                      <th className={TH}>{t('finance.monthTable.commissions')}</th>
                      <th className={TH}>{t('finance.monthTable.newCases')}</th>
                      <th className={clsx(TH, 'pr-5 sm:pr-6')}>{t('finance.monthTable.approved')}</th>
                    </>
                  }
                >
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td className={clsx(TD_FIRST, 'font-medium text-ink')}>{f.month(m.month)}</td>
                      <td className={TD}>{f.money(m.invoicedCents)}</td>
                      <td className={clsx(TD, 'text-success-fg')}>{f.money(m.paidCents)}</td>
                      <td className={TD}>{f.money(m.outstandingCents)}</td>
                      <td className={TD}>{f.money(m.translationCents)}</td>
                      <td className={TD}>{f.money(m.commissionsPaidCents + (m.partnerCommissionsPaidCents ?? 0))}</td>
                      <td className={TD}>{m.newCases}</td>
                      <td className={clsx(TD, 'pr-5 sm:pr-6')}>{m.approved}</td>
                    </tr>
                  ))}
                </Table>
              </Panel>
            </>
          );
        }}
      </Async>
    </div>
  );
};

// ─── Receivables ────────────────────────────────────────────────────────

const BUCKET_TONE: Record<AgingBucket, string> = Object.fromEntries(
  (['0-30', '31-60', '61-90', '90+'] as AgingBucket[]).map((b) => {
    const tone = statusTone('aging', b);
    return [b, `${TONE_CLASS[tone]} ${TONE_BORDER[tone]}`];
  }),
) as Record<AgingBucket, string>;

const BucketChip = ({ bucket }: { bucket: AgingBucket }) => {
  const { t } = useTranslation();
  return <span className={clsx('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', BUCKET_TONE[bucket])}>{t(`finance.receivables.bucket.${bucket}`)}</span>;
};

export const FinanceReceivables = ({ range }: { range: FinanceRange }) => {
  const { t } = useTranslation();
  const f = useFinanceFormat();
  const q = useFinance<ReceivablesResponse>('receivables', range);
  return (
    <Async q={q}>
      {(r) => (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t('finance.receivables.aging')}>
            {r.aging.map((a) => (
              <div key={a.bucket} className="rounded-xl border border-line bg-card p-4">
                <BucketChip bucket={a.bucket} />
                <p className="mt-2 font-display text-xl font-bold text-ink tabular-nums">{f.money(a.grossCents)}</p>
                <p className="text-[11px] text-muted">{a.count}</p>
              </div>
            ))}
          </div>
          <Panel
            title={t('finance.receivables.title')}
            icon={FileWarning}
            actions={
              <>
                <span className="text-xs text-muted">{t('finance.receivables.asOf', { date: f.day(r.asOf) })}</span>
                <Link to="/admin/invoices" className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
                  {t('finance.receivables.openInvoices')} <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              </>
            }
          >
            {r.rows.length === 0 ? (
              <EmptyState icon={Receipt} title={t('finance.receivables.empty')}>
                {t('finance.receivables.emptyHint')}
              </EmptyState>
            ) : (
              <Table
                minWidth={720}
                head={
                  <>
                    <th className={TH_FIRST}>{t('finance.receivables.number')}</th>
                    <th className="px-3 py-2 text-left">{t('finance.receivables.company')}</th>
                    <th className={TH}>{t('finance.receivables.issued')}</th>
                    <th className={TH}>{t('finance.receivables.due')}</th>
                    <th className={TH}>{t('finance.receivables.daysOverdue')}</th>
                    <th className={clsx(TH, 'pr-5 sm:pr-6')}>{t('finance.receivables.amount')}</th>
                  </>
                }
                foot={
                  <tr>
                    <td className={TD_FIRST} colSpan={5}>
                      {t('finance.receivables.total')} ({r.count})
                    </td>
                    <td className={clsx(TD, 'pr-5 sm:pr-6')}>{f.money(r.totalGrossCents)}</td>
                  </tr>
                }
              >
                {r.rows.map((row) => (
                  <tr key={row.id}>
                    <td className={TD_FIRST}>
                      <Link to="/admin/invoices" className="code-id text-xs font-medium text-link hover:underline whitespace-nowrap">
                        {row.number}
                      </Link>
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2 text-ink">{row.companyName}</td>
                    <td className={TD}>{f.day(row.issueDate)}</td>
                    <td className={TD}>{f.day(row.dueDate)}</td>
                    <td className={TD}>
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs text-muted">{row.daysOverdue > 0 ? t('finance.receivables.days', { count: row.daysOverdue }) : t('finance.receivables.notDue')}</span>
                        <BucketChip bucket={row.bucket} />
                      </span>
                    </td>
                    <td className={clsx(TD, 'pr-5 font-semibold text-ink sm:pr-6')}>{f.money(row.grossCents)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        </>
      )}
    </Async>
  );
};

// ─── Commissions per agent ──────────────────────────────────────────────

export const FinanceCommissions = ({ range }: { range: FinanceRange }) => {
  const { t } = useTranslation();
  const f = useFinanceFormat();
  const q = useFinance<CommissionsResponse>('commissions', range);
  return (
    <Async q={q}>
      {(r) => (
        <div className="space-y-6">
        <Panel title={t('finance.commissions.title')} icon={HandCoins}>
          {r.rows.length === 0 ? (
            <EmptyState icon={HandCoins} title={t('finance.commissions.empty')}>
              {t('finance.commissions.emptyHint')}
            </EmptyState>
          ) : (
            <Table
              minWidth={760}
              head={
                <>
                  <th className={TH_FIRST}>{t('finance.commissions.agent')}</th>
                  <th className={TH}>{t('finance.commissions.referrals')}</th>
                  <th className={TH}>{t('finance.commissions.pending')}</th>
                  <th className={TH}>{t('finance.commissions.approved')}</th>
                  <th className={TH}>{t('finance.commissions.paid')}</th>
                  <th className={TH}>{t('finance.commissions.cancelled')}</th>
                  <th className={clsx(TH, 'pr-5 sm:pr-6')}>{t('finance.commissions.total')}</th>
                </>
              }
              foot={
                <tr>
                  <td className={TD_FIRST}>{t('finance.commissions.total')}</td>
                  <td className={TD}>{r.totals.referralsInRange}</td>
                  <td className={TD}>{f.money(r.totals.pendingCents)}</td>
                  <td className={TD}>{f.money(r.totals.approvedCents)}</td>
                  <td className={TD}>{f.money(r.totals.paidCents)}</td>
                  <td className={TD}>{f.money(r.totals.cancelledCents)}</td>
                  <td className={clsx(TD, 'pr-5 sm:pr-6')}>{f.money(r.totals.totalCents)}</td>
                </tr>
              }
            >
              {r.rows.map((a) => (
                <tr key={a.id}>
                  <td className={TD_FIRST}>
                    <Link to={`/admin/agents/${a.id}`} className="font-medium text-link hover:underline">
                      {a.name}
                    </Link>
                    <span className="ml-1.5 code-id text-[11px] text-muted">{a.code}</span>
                    {a.status !== 'ACTIVE' && <span className="ml-1.5 text-[11px] text-warning-fg">({t('finance.commissions.paused')})</span>}
                    {a.region && <span className="block text-[11px] text-muted">{a.region}</span>}
                  </td>
                  <td className={TD}>
                    {a.referralsInRange} <span className="text-[11px] text-muted">· {t('finance.commissions.referralsTotal', { count: a.referralsTotal })}</span>
                  </td>
                  <td className={TD}>{f.money(a.pendingCents)}</td>
                  <td className={TD}>{f.money(a.approvedCents)}</td>
                  <td className={clsx(TD, 'text-success-fg')}>{f.money(a.paidCents)}</td>
                  <td className={clsx(TD, 'text-muted')}>{f.money(a.cancelledCents)}</td>
                  <td className={clsx(TD, 'pr-5 font-semibold text-ink sm:pr-6')}>{f.money(a.totalCents)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
        {r.partners && <PartnerCommissionsPanel data={r.partners} />}
        </div>
      )}
    </Async>
  );
};

/** Referral partners (middlemen) — their own commissions, separate from the agent programme. */
const PartnerCommissionsPanel = ({ data }: { data: NonNullable<CommissionsResponse['partners']> }) => {
  const { t } = useTranslation();
  const f = useFinanceFormat();
  return (
    <Panel
      title={t('finance.partnerCommissions.title')}
      icon={Handshake}
      actions={
        <Link to="/admin/partners/commissions" className="text-xs font-semibold text-link hover:underline">
          {t('finance.partnerCommissions.manage')}
        </Link>
      }
    >
      {data.rows.length === 0 ? (
        <EmptyState icon={Handshake} title={t('finance.partnerCommissions.empty')}>
          {t('finance.partnerCommissions.emptyHint')}
        </EmptyState>
      ) : (
        <Table
          minWidth={640}
          head={
            <>
              <th className={TH_FIRST}>{t('finance.partnerCommissions.partner')}</th>
              <th className={TH}>{t('finance.commissions.pending')}</th>
              <th className={TH}>{t('finance.commissions.approved')}</th>
              <th className={TH}>{t('finance.commissions.paid')}</th>
              <th className={TH}>{t('finance.commissions.cancelled')}</th>
              <th className={clsx(TH, 'pr-5 sm:pr-6')}>{t('finance.commissions.total')}</th>
            </>
          }
          foot={
            <tr>
              <td className={TD_FIRST}>{t('finance.commissions.total')}</td>
              <td className={TD}>{f.money(data.totals.pendingCents)}</td>
              <td className={TD}>{f.money(data.totals.approvedCents)}</td>
              <td className={TD}>{f.money(data.totals.paidCents)}</td>
              <td className={TD}>{f.money(data.totals.cancelledCents)}</td>
              <td className={clsx(TD, 'pr-5 sm:pr-6')}>{f.money(data.totals.totalCents)}</td>
            </tr>
          }
        >
          {data.rows.map((p) => (
            <tr key={p.id}>
              <td className={TD_FIRST}>
                <Link to={`/admin/partners/${p.id}`} className="font-medium text-link hover:underline">
                  {p.name}
                </Link>
              </td>
              <td className={TD}>{f.money(p.pendingCents)}</td>
              <td className={TD}>{f.money(p.approvedCents)}</td>
              <td className={clsx(TD, 'text-success-fg')}>{f.money(p.paidCents)}</td>
              <td className={clsx(TD, 'text-muted')}>{f.money(p.cancelledCents)}</td>
              <td className={clsx(TD, 'pr-5 font-semibold text-ink sm:pr-6')}>{f.money(p.totalCents)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
};

// ─── Staff league (sortable) ────────────────────────────────────────────

type StaffKey = 'name' | 'activeCases' | 'newCases' | 'approved' | 'rejected' | 'approvalPct' | 'avgDaysToDecision' | 'documentsReviewed' | 'satisfactionAvg';
const STAFF_COLS: { key: StaffKey; label: string }[] = [
  { key: 'activeCases', label: 'active' },
  { key: 'newCases', label: 'newCases' },
  { key: 'approved', label: 'approved' },
  { key: 'rejected', label: 'rejected' },
  { key: 'approvalPct', label: 'approvalPct' },
  { key: 'avgDaysToDecision', label: 'avgDays' },
  { key: 'documentsReviewed', label: 'docs' },
  { key: 'satisfactionAvg', label: 'satisfaction' },
];

export const FinanceStaff = ({ range }: { range: FinanceRange }) => {
  const { t } = useTranslation();
  const f = useFinanceFormat();
  const q = useFinance<{ staff: StaffRow[] }>('staff', range);
  const [sort, setSort] = useState<{ key: StaffKey; dir: 'asc' | 'desc' }>({ key: 'approved', dir: 'desc' });
  const click = (key: StaffKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'avgDaysToDecision' ? 'asc' : 'desc' }));

  const SortTh = ({ k, label, first }: { k: StaffKey; label: string; first?: boolean }) => {
    const active = sort.key === k;
    const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th className={first ? TH_FIRST : TH} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => click(k)} className={clsx('inline-flex items-center gap-1 uppercase hover:text-ink', active && 'text-ink')} title={t('finance.staff.sortBy', { column: label })}>
          {label} <Icon className="size-3" aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <Async q={q}>
      {({ staff }) => {
        const rows = [...staff].sort((a, b) => {
          const va = a[sort.key];
          const vb = b[sort.key];
          // Missing values (no decisions / no survey answers) always go last.
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          const c = typeof va === 'string' ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
          return sort.dir === 'asc' ? c : -c;
        });
        return (
          <Panel title={t('finance.staff.title')} icon={Users}>
            <p className="-mt-1 mb-4 text-xs text-muted">{t('finance.staff.note')}</p>
            {rows.length === 0 ? (
              <EmptyState icon={Users} title={t('finance.staff.empty')} />
            ) : (
              <Table
                minWidth={880}
                head={
                  <>
                    <SortTh k="name" label={t('finance.staff.name')} first />
                    {STAFF_COLS.map((c) => (
                      <SortTh key={c.key} k={c.key} label={t(`finance.staff.${c.label}`)} />
                    ))}
                  </>
                }
              >
                {rows.map((s, i) => (
                  <tr key={s.id}>
                    <td className={TD_FIRST}>
                      <span className="mr-2 inline-block w-5 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                      <span className="font-medium text-ink">{s.name}</span>
                      {!s.isActive && <span className="ml-1.5 text-[11px] text-muted">({t('finance.staff.inactive')})</span>}
                    </td>
                    <td className={TD}>{s.activeCases}</td>
                    <td className={TD}>{s.newCases}</td>
                    <td className={clsx(TD, 'text-success-fg')}>{s.approved}</td>
                    <td className={clsx(TD, 'text-danger-fg')}>{s.rejected}</td>
                    <td className={TD}>{f.pct(s.approvalPct)}</td>
                    <td className={TD}>{f.num(s.avgDaysToDecision)}</td>
                    <td className={TD}>{s.documentsReviewed}</td>
                    <td className={TD}>
                      {s.satisfactionAvg == null ? (
                        '—'
                      ) : (
                        <span title={t('finance.staff.satisfactionCount', { count: s.satisfactionCount })}>
                          {f.num(s.satisfactionAvg)} <span className="text-[11px] text-muted">/ 10</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        );
      }}
    </Async>
  );
};

// ─── By visa type / category ────────────────────────────────────────────

const TypeTable = ({ rows, label, first }: { rows: TypeRow[]; label: (r: TypeRow) => ReactNode; first: string }) => {
  const { t } = useTranslation();
  const f = useFinanceFormat();
  if (rows.length === 0) return <EmptyState icon={Layers} title={t('finance.byType.empty')} />;
  return (
    <Table
      minWidth={900}
      head={
        <>
          <th className={TH_FIRST}>{first}</th>
          <th className={TH}>{t('finance.byType.newCases')}</th>
          <th className={TH}>{t('finance.byType.active')}</th>
          <th className={TH}>{t('finance.byType.approved')}</th>
          <th className={TH}>{t('finance.byType.rejected')}</th>
          <th className={TH}>{t('finance.byType.approvalPct')}</th>
          <th className={TH}>{t('finance.byType.invoiceRevenue')}</th>
          <th className={TH}>{t('finance.byType.translation')}</th>
          <th className={TH}>{t('finance.byType.revenue')}</th>
          <th className={clsx(TH, 'pr-5 sm:pr-6')}>{t('finance.byType.commissions')}</th>
        </>
      }
    >
      {rows.map((r) => (
        <tr key={r.key ?? 'none'}>
          <td className={TD_FIRST}>{label(r)}</td>
          <td className={TD}>{r.newCases}</td>
          <td className={TD}>{r.active}</td>
          <td className={clsx(TD, 'text-success-fg')}>{r.approved}</td>
          <td className={clsx(TD, 'text-danger-fg')}>{r.rejected}</td>
          <td className={TD}>{f.pct(r.approvalPct)}</td>
          <td className={TD}>{f.money(r.invoiceRevenueCents)}</td>
          <td className={TD}>{f.money(r.translationCents)}</td>
          <td className={clsx(TD, 'font-semibold text-ink')}>{f.money(r.revenueCents)}</td>
          <td className={clsx(TD, 'pr-5 sm:pr-6')}>{f.money(r.commissionsPaidCents)}</td>
        </tr>
      ))}
    </Table>
  );
};

export const FinanceByType = ({ range }: { range: FinanceRange }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const q = useFinance<ByTypeResponse>('by-type', range);
  const none = <span className="text-muted">{t('finance.byType.none')}</span>;
  return (
    <Async q={q}>
      {(r) => (
        <>
          <Panel title={t('finance.byType.visaType')} icon={Layers}>
            <TypeTable rows={r.byVisaType} first={t('finance.byType.type')} label={(row) => (row.key ? <span className="font-medium text-ink">{t(`portal.visaTypes.${row.key}`)}</span> : none)} />
          </Panel>
          <Panel title={t('finance.byType.category')} icon={CalendarClock}>
            <TypeTable
              rows={r.byCategory}
              first={t('finance.byType.categoryCol')}
              label={(row) => {
                const c = r.byCategory.find((x) => x.key === row.key);
                if (!c?.title) return row.key ? <span className="text-muted">{c?.slug ?? row.key}</span> : none;
                return (
                  <>
                    <span className="font-medium text-ink">{tr(c.title as never)}</span>
                    {c.visaLabel && <span className="ml-1.5 code-id text-[11px] text-muted">{c.visaLabel}</span>}
                  </>
                );
              }}
            />
          </Panel>
          <p className="text-xs text-muted">{t('finance.byType.note')}</p>
        </>
      )}
    </Async>
  );
};
