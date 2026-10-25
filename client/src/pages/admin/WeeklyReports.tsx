import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, CalendarRange, FileBarChart2, Languages, Lightbulb, Mail, Minus, RefreshCw, Settings2, TriangleAlert, Trophy, Users } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { currentLocale } from '@/i18n';
import { usePageTitle } from '@/lib/usePageTitle';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { fmtDateTime, statusLabel } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import type { CaseStatus } from '@/lib/types';
import { aiMgmtReason, fmtMoney } from '@/components/aiMgmt/shared';

type Pair = { cur: number; prev: number };
type MetricKey = 'inquiries' | 'registrations' | 'casesCreated' | 'approvals' | 'rejections' | 'bookingsHeld' | 'bookingsNoShow' | 'bookingsCancelled' | 'invoicesSent' | 'invoicesPaid' | 'aiSpendUsd';
const METRICS: MetricKey[] = ['inquiries', 'registrations', 'casesCreated', 'approvals', 'rejections', 'bookingsHeld', 'bookingsNoShow', 'bookingsCancelled', 'invoicesSent', 'invoicesPaid', 'aiSpendUsd'];
/** Metrics where a rise is bad news (coloured the other way round). */
const LOWER_IS_BETTER = new Set<MetricKey>(['rejections', 'bookingsNoShow', 'bookingsCancelled', 'aiSpendUsd']);

interface StaffRow {
  id: string;
  name: string;
  role: string;
  openCases: number;
  casesHandled: number;
  decisions: number;
  avgResponseHours: number | null;
  unanswered: number;
  overdueTasks: number;
  stuckCases: number;
  needsSupport: boolean;
  reasons: ('overdueTasks' | 'slowResponse' | 'unanswered' | 'stuckCases')[];
}

interface ReportData {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  metrics: Record<MetricKey, Pair>;
  money: { invoicesSent: { cur: Record<string, number>; prev: Record<string, number> }; invoicesPaid: { cur: Record<string, number>; prev: Record<string, number> }; overdue: { count: number; amount: Record<string, number> } };
  leadsBySource: { source: string; inquiries: number; registrations: number; bookings: number; total: number; prevTotal: number }[];
  casesByStatus: Partial<Record<CaseStatus, number>>;
  stepDurations: { status: CaseStatus; avgDays: number; transitions: number }[];
  stuck: { days: number; count: number; items: { id: string; number: string; client: string; status: CaseStatus; staff: string | null; idleDays: number }[] };
  overdueTasks: { total: number; perStaff: { staffId: string | null; name: string; count: number }[] };
  staff: StaffRow[];
  mailTriage: { cur: number; prev: number } | null;
}

interface Narrative {
  headline: string;
  highlights: string[];
  problems: string[];
  recommendations: { text: string; metric: string }[];
}

interface Report {
  id: string;
  weekStart: string;
  createdAt: string;
  updatedAt: string;
  sentTo: number;
  model: string | null;
  costUsd: number;
  data: ReportData;
  narrative: Narrative | null;
  narrativeLocales: string[];
}

interface ListItem {
  id: string;
  weekStart: string;
  weekEnd: string;
  createdAt: string;
  sentTo: number;
  hasNarrative: boolean;
  headline: string | null;
  key: { inquiries: Pair; casesCreated: Pair; approvals: Pair; stuck: number; overdueTasks: number };
}

interface ReportSettings {
  enabled: boolean;
  includeAdmins: boolean;
  stuckDays: number;
}

/** Baku calendar date of an instant, "13.10". */
const bakuDate = (iso: string, withYear = false) => {
  const d = new Date(new Date(iso).getTime() + 4 * 3600_000).toISOString();
  return `${d.slice(8, 10)}.${d.slice(5, 7)}${withYear ? `.${d.slice(0, 4)}` : ''}`;
};
const weekLabel = (start: string, end: string) => `${bakuDate(start)} – ${bakuDate(new Date(new Date(end).getTime() - 1).toISOString(), true)}`;

const Delta = ({ cur, prev, inverse }: { cur: number; prev: number; inverse?: boolean }) => {
  const d = Math.round((cur - prev) * 100) / 100;
  if (!d)
    return (
      <span className="inline-flex items-center gap-0.5 text-muted">
        <Minus className="size-3" aria-hidden /> 0
      </span>
    );
  const good = inverse ? d < 0 : d > 0;
  const Icon = d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx('inline-flex items-center gap-0.5 font-semibold', good ? 'text-success-fg' : 'text-danger-fg')}>
      <Icon className="size-3.5" aria-hidden />
      {d > 0 ? '+' : ''}
      {d}
      {prev ? <span className="font-normal text-muted">({d > 0 ? '+' : ''}{Math.round((d / prev) * 100)}%)</span> : null}
    </span>
  );
};

const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => <th className={clsx('px-3 py-2 font-semibold', right && 'text-right')}>{children}</th>;
const Td = ({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) => <td className={clsx('px-3 py-2', right && 'text-right tabular-nums', className)}>{children}</td>;
const Table = ({ head, children }: { head: ReactNode; children: ReactNode }) => (
  <div className="overflow-x-auto rounded-lg border border-line">
    <table className="w-full min-w-[28rem] text-left text-sm">
      <thead className="bg-sunken text-xs text-muted">
        <tr>{head}</tr>
      </thead>
      <tbody className="[&>tr]:border-t [&>tr]:border-line">{children}</tbody>
    </table>
  </div>
);

const SettingsPanel = ({ settings }: { settings: ReportSettings }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [stuckDays, setStuckDays] = useState(settings.stuckDays);
  const [busy, setBusy] = useState(false);
  useEffect(() => setStuckDays(settings.stuckDays), [settings.stuckDays]);
  const save = async (patch: Partial<ReportSettings>) => {
    setBusy(true);
    try {
      await api.put('/admin/mgmt/reports-settings', patch);
      await qc.invalidateQueries({ queryKey: ['mgmt', 'reports'] });
      toast.success(t('aiMgmt.reports.settings.saved'));
    } catch (err) {
      toast.error(errorCode(err));
    } finally {
      setBusy(false);
    }
  };
  const row = (label: string, hint: string, control: ReactNode) => (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-sunken p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </div>
      {control}
    </div>
  );
  return (
    <Panel title={t('aiMgmt.reports.settings.title')} icon={Settings2} className="bg-card">
      <div className="space-y-3">
        {row(t('aiMgmt.reports.settings.enabled'), t('aiMgmt.reports.settings.enabledHint'), <Switch checked={settings.enabled} disabled={busy} onChange={(v) => void save({ enabled: v })} label={t('aiMgmt.reports.settings.enabled')} />)}
        {row(t('aiMgmt.reports.settings.includeAdmins'), t('aiMgmt.reports.settings.includeAdminsHint'), <Switch checked={settings.includeAdmins} disabled={busy} onChange={(v) => void save({ includeAdmins: v })} label={t('aiMgmt.reports.settings.includeAdmins')} />)}
        {row(
          t('aiMgmt.reports.settings.stuckDays'),
          t('aiMgmt.reports.settings.stuckDaysHint'),
          <input
            type="number"
            min={3}
            max={90}
            className="input !w-20 shrink-0"
            value={Number.isFinite(stuckDays) ? stuckDays : ''}
            aria-label={t('aiMgmt.reports.settings.stuckDays')}
            onChange={(e) => setStuckDays(Number(e.target.value))}
            onBlur={() => {
              if (Number.isInteger(stuckDays) && stuckDays >= 3 && stuckDays <= 90 && stuckDays !== settings.stuckDays) void save({ stuckDays });
            }}
          />,
        )}
      </div>
    </Panel>
  );
};

const ReportView = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const locale = currentLocale();
  const q = useQuery({ queryKey: ['mgmt', 'report', id, locale], queryFn: async () => (await api.get<{ report: Report }>(`/admin/mgmt/reports/${id}`, { params: { locale } })).data.report });
  const [busy, setBusy] = useState<'narrative' | 'email' | null>(null);

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const r = q.data;
  const d = r.data;
  const n = r.narrative;

  const writeNarrative = async () => {
    setBusy('narrative');
    try {
      const res = (await api.post<{ report: Report; reason: string | null }>(`/admin/mgmt/reports/${id}/narrative`, {}, { params: { locale } })).data;
      if (res.reason) toast.error(aiMgmtReason(t, res.reason));
      qc.setQueryData(['mgmt', 'report', id, locale], res.report);
      void qc.invalidateQueries({ queryKey: ['mgmt', 'reports'] });
    } catch (err) {
      toast.error(errorCode(err));
    } finally {
      setBusy(null);
    }
  };
  const emailMe = async () => {
    setBusy('email');
    try {
      const res = (await api.post<{ to: string }>(`/admin/mgmt/reports/${id}/email`, {}, { params: { locale } })).data;
      toast.success(t('aiMgmt.reports.emailed', { email: res.to }));
    } catch (err) {
      toast.error(errorCode(err));
    } finally {
      setBusy(null);
    }
  };

  const open = Object.entries(d.casesByStatus) as [CaseStatus, number][];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <CalendarRange className="size-5 text-link" aria-hidden /> {t('aiMgmt.reports.week')} {weekLabel(d.weekStart, d.weekEnd)}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {t('aiMgmt.reports.created')}: {fmtDateTime(r.updatedAt)} · {t('aiMgmt.reports.sentTo', { count: r.sentTo })}
            {r.costUsd > 0 && ` · ${t('aiMgmt.reports.cost')}: $${r.costUsd.toFixed(4)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!n && (
            <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void writeNarrative()}>
              {busy === 'narrative' ? <Spinner className="size-3.5" /> : <Languages className="size-3.5" aria-hidden />} {t('aiMgmt.reports.writeInMyLang')}
            </button>
          )}
          <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void emailMe()}>
            {busy === 'email' ? <Spinner className="size-3.5" /> : <Mail className="size-3.5" aria-hidden />} {t('aiMgmt.reports.emailMe')}
          </button>
        </div>
      </div>

      {n ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-line bg-card p-4 lg:col-span-3">
            <p className="text-base font-semibold text-ink">{n.headline}</p>
          </div>
          <div className="rounded-xl border border-success-border bg-success-bg/60 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-success-fg">
              <Trophy className="size-4" aria-hidden /> {t('aiMgmt.reports.highlights')}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink">{n.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
          </div>
          <div className="rounded-xl border border-warning-border bg-warning-bg/60 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-warning-fg">
              <TriangleAlert className="size-4" aria-hidden /> {t('aiMgmt.reports.problems')}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink">{n.problems.map((h, i) => <li key={i}>{h}</li>)}</ul>
          </div>
          <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-link">
              <Lightbulb className="size-4" aria-hidden /> {t('aiMgmt.reports.recommendations')}
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
              {n.recommendations.map((rec, i) => (
                <li key={i}>
                  {rec.text} <span className="ml-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-link">{t(`aiMgmt.reports.metrics.${rec.metric}`, { defaultValue: rec.metric })}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg">{t('aiMgmt.reports.noNarrative')}</p>
      )}

      <Panel title={t('aiMgmt.reports.keyNumbers')} icon={FileBarChart2} className="bg-card" bodyClassName="p-0 sm:p-0">
        <Table
          head={
            <>
              <Th>{t('aiMgmt.reports.metric')}</Th>
              <Th right>{t('aiMgmt.reports.thisWeek')}</Th>
              <Th right>{t('aiMgmt.reports.previous')}</Th>
              <Th right>{t('aiMgmt.reports.change')}</Th>
            </>
          }
        >
          {METRICS.map((k) => (
            <tr key={k}>
              <Td>{t(`aiMgmt.reports.metrics.${k}`)}</Td>
              <Td right className="font-semibold text-ink">{d.metrics[k].cur}</Td>
              <Td right>{d.metrics[k].prev}</Td>
              <Td right>
                <Delta cur={d.metrics[k].cur} prev={d.metrics[k].prev} inverse={LOWER_IS_BETTER.has(k)} />
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title={t('aiMgmt.reports.invoices')} className="bg-card">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t('aiMgmt.reports.sent')}</dt>
              <dd className="text-right tabular-nums">
                <span className="font-semibold text-ink">{fmtMoney(d.money.invoicesSent.cur, locale)}</span> <span className="text-xs text-muted">/ {fmtMoney(d.money.invoicesSent.prev, locale)}</span>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t('aiMgmt.reports.paid')}</dt>
              <dd className="text-right tabular-nums">
                <span className="font-semibold text-ink">{fmtMoney(d.money.invoicesPaid.cur, locale)}</span> <span className="text-xs text-muted">/ {fmtMoney(d.money.invoicesPaid.prev, locale)}</span>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className={clsx(d.money.overdue.count ? 'font-semibold text-danger-fg' : 'text-muted')}>{t('aiMgmt.reports.overdue', { count: d.money.overdue.count })}</dt>
              <dd className="text-right tabular-nums">{fmtMoney(d.money.overdue.amount, locale)}</dd>
            </div>
          </dl>
          {d.mailTriage && <p className="mt-4 border-t border-line pt-3 text-sm text-ink">{t('aiMgmt.reports.mailTriageLine', { cur: d.mailTriage.cur, prev: d.mailTriage.prev })}</p>}
        </Panel>

        <Panel title={t('aiMgmt.reports.leads')} className="bg-card" bodyClassName="p-0 sm:p-0">
          {d.leadsBySource.length ? (
            <Table
              head={
                <>
                  <Th>{t('aiMgmt.reports.source')}</Th>
                  <Th right>{t('aiMgmt.reports.leadInquiries')}</Th>
                  <Th right>{t('aiMgmt.reports.leadRegistrations')}</Th>
                  <Th right>{t('aiMgmt.reports.leadBookings')}</Th>
                  <Th right>{t('aiMgmt.reports.previous')}</Th>
                </>
              }
            >
              {d.leadsBySource.map((s) => (
                <tr key={s.source}>
                  <Td>{s.source}</Td>
                  <Td right>{s.inquiries}</Td>
                  <Td right>{s.registrations}</Td>
                  <Td right>{s.bookings}</Td>
                  <Td right className="text-muted">{s.prevTotal}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="p-5 text-sm text-muted">—</p>
          )}
        </Panel>

        <Panel title={t('aiMgmt.reports.openByStatus')} className="bg-card">
          <ul className="space-y-1.5 text-sm">
            {open.map(([s, c]) => (
              <li key={s} className="flex justify-between gap-3">
                <Link to={`/admin/cases?status=${s}`} className="text-ink hover:text-link hover:underline">
                  {statusLabel(s)}
                </Link>
                <span className="font-semibold tabular-nums text-ink">{c}</span>
              </li>
            ))}
            {!open.length && <li className="text-muted">—</li>}
          </ul>
        </Panel>

        <Panel title={t('aiMgmt.reports.avgDays')} className="bg-card">
          <ul className="space-y-1.5 text-sm">
            {d.stepDurations.map((s) => (
              <li key={s.status} className="flex justify-between gap-3">
                <span>{statusLabel(s.status)}</span>
                <span className="tabular-nums">
                  <span className="font-semibold text-ink">{t('aiMgmt.reports.days', { n: s.avgDays })}</span> <span className="text-xs text-muted">· {s.transitions} {t('aiMgmt.reports.transitions')}</span>
                </span>
              </li>
            ))}
            {!d.stepDurations.length && <li className="text-muted">—</li>}
          </ul>
        </Panel>
      </div>

      <Panel title={`${t('aiMgmt.reports.stuck', { days: d.stuck.days })} · ${d.stuck.count}`} icon={TriangleAlert} className="bg-card" bodyClassName="p-0 sm:p-0">
        {d.stuck.items.length ? (
          <ul className="divide-y divide-line">
            {d.stuck.items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <Link to={`/admin/cases/${c.id}`} className="font-semibold text-link hover:underline">
                  {c.number} · {c.client}
                </Link>
                <span className="text-xs text-muted">
                  {statusLabel(c.status)} · {c.staff ?? t('aiMgmt.reports.unassigned')} · {t('aiMgmt.reports.idle', { n: c.idleDays })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-muted">{t('aiMgmt.reports.noStuck')}</p>
        )}
      </Panel>

      <Panel title={`${t('aiMgmt.reports.overdueTasks')} · ${d.overdueTasks.total}`} className="bg-card">
        <ul className="flex flex-wrap gap-2 text-sm">
          {d.overdueTasks.perStaff.map((p) => (
            <li key={p.staffId ?? '-'} className="rounded-full border border-line bg-sunken px-3 py-1">
              {p.staffId ? p.name : t('aiMgmt.reports.unassigned')} · <span className="font-semibold tabular-nums">{p.count}</span>
            </li>
          ))}
          {!d.overdueTasks.perStaff.length && <li className="text-muted">—</li>}
        </ul>
      </Panel>

      {d.staff.length > 0 && (
        <Panel title={t('aiMgmt.reports.staff')} icon={Users} className="bg-card">
          <p className="mb-3 text-xs text-muted">{t('aiMgmt.reports.staffNote')}</p>
          <Table
            head={
              <>
                <Th>{t('aiMgmt.reports.cols.name')}</Th>
                <Th right>{t('aiMgmt.reports.cols.open')}</Th>
                <Th right>{t('aiMgmt.reports.cols.handled')}</Th>
                <Th right>{t('aiMgmt.reports.cols.decisions')}</Th>
                <Th right>{t('aiMgmt.reports.cols.response')}</Th>
                <Th right>{t('aiMgmt.reports.cols.unanswered')}</Th>
                <Th right>{t('aiMgmt.reports.cols.overdue')}</Th>
                <Th>{t('aiMgmt.reports.cols.note')}</Th>
              </>
            }
          >
            {d.staff.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link to={`/admin/oversight/staff/${s.id}`} className="font-semibold text-ink hover:text-link hover:underline">
                    {s.name}
                  </Link>
                </Td>
                <Td right>{s.openCases}</Td>
                <Td right>{s.casesHandled}</Td>
                <Td right>{s.decisions}</Td>
                <Td right>{s.avgResponseHours === null ? '—' : t('aiMgmt.reports.hours', { n: s.avgResponseHours })}</Td>
                <Td right>{s.unanswered}</Td>
                <Td right>{s.overdueTasks}</Td>
                <Td>
                  {s.needsSupport ? (
                    <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning-fg">
                      {t('aiMgmt.reports.needsSupport')}: {s.reasons.map((x) => t(`aiMgmt.reports.reasons.${x}`)).join(', ')}
                    </span>
                  ) : (
                    <span className="text-xs text-success-fg">{t('aiMgmt.reports.ok')}</span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
};

/** Admin → Weekly reports (super admin): archive of the Monday management reports, "Generate now", settings. */
export default function AdminWeeklyReports() {
  const { t } = useTranslation();
  usePageTitle(t('aiMgmt.reports.title'));
  const qc = useQueryClient();
  const locale = currentLocale();
  const [params, setParams] = useSearchParams();
  const list = useQuery({
    queryKey: ['mgmt', 'reports', locale],
    queryFn: async () => (await api.get<{ items: ListItem[]; settings: ReportSettings }>('/admin/mgmt/reports', { params: { locale } })).data,
  });
  const [generating, setGenerating] = useState(false);
  const selected = params.get('id') ?? list.data?.items[0]?.id ?? null;

  const generate = async () => {
    setGenerating(true);
    try {
      const res = (await api.post<{ report: Report; reason: string | null }>('/admin/mgmt/reports/generate', {}, { params: { locale } })).data;
      if (res.reason) toast.warning(`${t('aiMgmt.reports.numbersOnly')} ${aiMgmtReason(t, res.reason)}`);
      else toast.success(t('aiMgmt.reports.generated'));
      qc.setQueryData(['mgmt', 'report', res.report.id, locale], res.report);
      await qc.invalidateQueries({ queryKey: ['mgmt', 'reports'] });
      setParams({ id: res.report.id }, { replace: true });
    } catch (err) {
      toast.error(errorCode(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHead
        title={t('aiMgmt.reports.title')}
        subtitle={t('aiMgmt.reports.subtitle')}
        actions={
          <button type="button" className="btn-primary btn-sm" disabled={generating} onClick={() => void generate()}>
            {generating ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" aria-hidden />} {generating ? t('aiMgmt.reports.generating') : t('aiMgmt.reports.generate')}
          </button>
        }
      />
      {list.isLoading ? (
        <LoadingBlock />
      ) : list.error ? (
        <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">
            {selected ? (
              <ReportView id={selected} />
            ) : (
              <Panel className="bg-card">
                <EmptyState icon={FileBarChart2} title={t('aiMgmt.reports.empty')}>
                  {t('aiMgmt.reports.emptyHint')}
                </EmptyState>
              </Panel>
            )}
          </div>
          <div className="space-y-6">
            <Panel title={t('aiMgmt.reports.history')} icon={CalendarRange} className="bg-card" bodyClassName="p-0 sm:p-0">
              {list.data?.items.length ? (
                <ul className="divide-y divide-line">
                  {list.data.items.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setParams({ id: r.id }, { replace: true })}
                        className={clsx('block w-full px-4 py-3 text-left text-sm transition hover:bg-sunken', r.id === selected && 'bg-primary/[0.06]')}
                        aria-current={r.id === selected ? 'true' : undefined}
                      >
                        <span className="block font-semibold text-ink">{weekLabel(r.weekStart, r.weekEnd)}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {t('aiMgmt.reports.metrics.inquiries')}: {r.key.inquiries.cur} · {t('aiMgmt.reports.metrics.approvals')}: {r.key.approvals.cur} · {t('aiMgmt.reports.metrics.stuckCases')}: {r.key.stuck}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-sm text-muted">—</p>
              )}
            </Panel>
            {list.data && <SettingsPanel settings={list.data.settings} />}
          </div>
        </div>
      )}
    </div>
  );
}
