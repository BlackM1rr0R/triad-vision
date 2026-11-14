import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Activity, ArrowRight, Ban, ChartColumn, Coins, FileSignature, FolderPlus, MessageSquareText, Target, UserPlus, Users, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPartnerDashboard } from '@/i18n/pagesPartnerDashboard';
import type { CaseStatus } from '@/lib/types';
import { ErrorBlock, KpiCell, KpiStrip, LoadingBlock, Panel } from '@/components/admin/ui';
import { BarChart, type Bar } from '@/components/admin/charts';
import { HBarList, VIZ, useVizFormat } from '@/components/charts';
import { fmtDate, fmtRelative, statusLabel } from '@/components/admin/labels';
import { money } from '@/components/agents/format';
import { QuotaMeter } from '../QuotaMeter';
import type { PartnerQuota } from '../api';

registerCopy(pagesPartnerDashboard);

/** Pipeline order of the status chart (server CaseStatus). */
const STATUS_ORDER: CaseStatus[] = [
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

interface MoneySeries {
  currency: string;
  cents: number[];
  totalCents: number;
  otherCurrencyRows: number;
}

type Activity =
  | { id: string; kind: 'case'; at: string; caseId: string; caseNumber: string; clientName: string }
  | { id: string; kind: 'status'; at: string; caseId: string; caseNumber: string; clientName: string; toStatus: CaseStatus }
  | { id: string; kind: 'note'; at: string; noteKind: string; text: string }
  | { id: string; kind: 'commission'; at: string; caseId: string | null; caseNumber: string | null; amountCents: number; currency: string; status: string };

/** GET /admin/partners/:id/dashboard (server lib/partners/dashboard.ts). */
export interface PartnerDashboard {
  months: string[];
  cases: { total: number; byStatus: Partial<Record<CaseStatus, number>> };
  refusal: { refused: number; approved: number; decided: number; rate: number | null };
  clients: { total: number; newPerMonth: number[]; newInWindow: number };
  commissions: MoneySeries;
  /** null for STAFF (client payments are ADMIN+). */
  revenue: MoneySeries | null;
  quota: PartnerQuota;
  activity: Activity[];
}

export const PARTNER_DASHBOARD_KEY = (id: string) => ['referral-partners', 'dashboard', id] as const;

/** Refusal rates from this share up are shown in the danger tone (a third of decided cases). */
const REFUSAL_ALERT = 33;

const ACTIVITY_ICON: Record<Activity['kind'], LucideIcon> = { case: FolderPlus, status: FileSignature, note: MessageSquareText, commission: Coins };

const MonthBars = ({ months, values, format, ariaLabel }: { months: string[]; values: number[]; format: (v: number) => string; ariaLabel: string }) => {
  const f = useVizFormat();
  const bars: Bar[] = months.map((m, i) => ({ label: f.monthShort(m), title: f.monthLong(m), value: values[i] ?? 0, emphasis: i === months.length - 1 }));
  return <BarChart bars={bars} height={180} format={format} axisFormat={f.tick} ariaLabel={ariaLabel} tableLabel={ariaLabel} />;
};

const MoneyPanel = ({ title, icon, note, series, months, ariaLabel }: { title: string; icon: LucideIcon; note: string; series: MoneySeries; months: string[]; ariaLabel: string }) => {
  const { t } = useTranslation();
  const cur = series.currency;
  return (
    <Panel title={title} icon={icon} actions={<span className="text-sm font-semibold text-ink tabular-nums">{money(series.totalCents, cur)}</span>}>
      <MonthBars months={months} values={series.cents.map((c) => c / 100)} format={(v) => money(Math.round(v * 100), cur)} ariaLabel={ariaLabel} />
      <p className="mt-2 text-[11px] text-muted">
        {note}
        {series.otherCurrencyRows > 0 && ` ${t('partnerDash.otherCurrency', { count: series.otherCurrencyRows })}`}
      </p>
    </Panel>
  );
};

const ActivityRow = ({ a }: { a: Activity }) => {
  const { t } = useTranslation();
  const Icon = ACTIVITY_ICON[a.kind];
  let text: string;
  let to: string | null = null;
  if (a.kind === 'case') {
    text = t('partnerDash.activity.case', { client: a.clientName });
    to = `/admin/cases/${a.caseId}`;
  } else if (a.kind === 'status') {
    text = t('partnerDash.activity.status', { client: a.clientName, status: statusLabel(a.toStatus) });
    to = `/admin/cases/${a.caseId}`;
  } else if (a.kind === 'note') {
    text = `${t(`partnerDash.activity.note.${a.noteKind}`, { defaultValue: a.noteKind })}: ${a.text}`;
  } else {
    text = `${t('partnerDash.activity.commission', { amount: money(a.amountCents, a.currency) })} · ${t(`partnerDash.activity.commissionStatus.${a.status}`, { defaultValue: a.status })}`;
    to = a.caseId ? `/admin/cases/${a.caseId}` : null;
  }
  const number = a.kind === 'note' ? null : a.caseNumber;
  const body = (
    <>
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-sunken text-muted" aria-hidden>
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm break-words text-ink">{text}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted">
          <time dateTime={a.at} title={fmtDate(a.at)}>
            {fmtRelative(a.at)}
          </time>
          {number && <span className="code-id">{number}</span>}
        </span>
      </span>
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-sunken focus-visible:bg-sunken">
          {body}
        </Link>
      ) : (
        <div className="flex items-start gap-3 py-2">{body}</div>
      )}
    </li>
  );
};

/**
 * "Panel" tab of the partner profile: clients, refusal rate, commission (and client payments for admins)
 * as key figures; cases by status, new clients and money per month (last 12 months, current month
 * emphasised) as charts; the client quota and the latest activity. Charts use the admin kit (one
 * series = slot 1, table view, keyboard readout); separate charts per measure — never a second axis.
 */
export const DashboardTab = ({ partnerId, onOpenHistory, onEdit }: { partnerId: string; onOpenHistory: () => void; onEdit?: () => void }) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const q = useQuery({
    queryKey: PARTNER_DASHBOARD_KEY(partnerId),
    queryFn: async () => (await api.get<{ dashboard: PartnerDashboard }>(`/admin/partners/${partnerId}/dashboard`)).data.dashboard,
  });
  const statusRows = useMemo(
    () =>
      q.data
        ? STATUS_ORDER.filter((s) => (q.data.cases.byStatus[s] ?? 0) > 0).map((s) => ({ key: s, label: statusLabel(s), name: statusLabel(s), value: q.data.cases.byStatus[s] ?? 0, color: VIZ[0] }))
        : [],
    [q.data],
  );

  if (q.isLoading) return <LoadingBlock className="min-h-[20vh]" />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const rate = d.refusal.rate;

  return (
    <div className="space-y-4">
      <KpiStrip cols={4}>
        <KpiCell label={t('partnerDash.kpi.clients')} icon={Users} value={f.num(d.clients.total)} hint={`${t('partnerDash.kpi.newClients')}: ${f.num(d.clients.newInWindow)}`} />
        <KpiCell
          label={t('partnerDash.kpi.refusalRate')}
          icon={Ban}
          value={rate == null ? '—' : f.pct(rate)}
          tone={rate != null && rate >= REFUSAL_ALERT ? 'danger' : undefined}
          hint={rate == null ? t('partnerDash.kpi.noDecision') : t('partnerDash.kpi.refusalHint', { refused: d.refusal.refused, decided: d.refusal.decided })}
        />
        <KpiCell label={t('partnerDash.kpi.commissions')} icon={Coins} value={money(d.commissions.totalCents, d.commissions.currency)} />
        {d.revenue ? (
          <KpiCell label={t('partnerDash.kpi.revenue')} icon={Wallet} value={money(d.revenue.totalCents, d.revenue.currency)} />
        ) : (
          <KpiCell
            label={t('partnerDash.quota.title')}
            icon={Target}
            value={d.quota.needed == null ? '—' : `${f.num(d.quota.assigned)} / ${f.num(d.quota.needed)}`}
            tone={d.quota.filled ? 'success' : undefined}
          />
        )}
      </KpiStrip>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('partnerDash.status.title')} icon={ChartColumn} actions={<span className="text-sm font-semibold text-ink tabular-nums">{f.num(d.cases.total)}</span>}>
          {statusRows.length ? (
            <div role="figure" aria-label={t('partnerDash.status.aria')}>
              <HBarList rows={statusRows} />
            </div>
          ) : (
            <p className="text-sm text-muted">{t('partnerDash.status.empty')}</p>
          )}
        </Panel>
        <Panel title={t('partnerDash.newClients.title')} icon={UserPlus} actions={<span className="text-sm font-semibold text-ink tabular-nums">{f.num(d.clients.newInWindow)}</span>}>
          <MonthBars months={d.months} values={d.clients.newPerMonth} format={f.num} ariaLabel={t('partnerDash.newClients.aria')} />
        </Panel>
        <MoneyPanel title={t('partnerDash.commissions.title')} icon={Coins} note={t('partnerDash.commissions.note')} series={d.commissions} months={d.months} ariaLabel={t('partnerDash.commissions.aria')} />
        {d.revenue && <MoneyPanel title={t('partnerDash.revenue.title')} icon={Wallet} note={t('partnerDash.revenue.note')} series={d.revenue} months={d.months} ariaLabel={t('partnerDash.revenue.aria')} />}
        <Panel title={t('partnerDash.quota.title')} icon={Target} className={clsx(d.revenue && 'lg:col-span-2')}>
          {d.quota.needed != null ? (
            <QuotaMeter quota={d.quota} />
          ) : (
            <div className="text-sm text-muted">
              <p>{t('partnerDash.quota.none')}</p>
              {onEdit && (
                <button type="button" className="btn-ghost btn-sm mt-2 !px-0 text-link" onClick={onEdit}>
                  {t('partnerDash.quota.set')}
                </button>
              )}
            </div>
          )}
        </Panel>
        <Panel
          title={t('partnerDash.activity.title')}
          icon={Activity}
          className="lg:col-span-2"
          actions={
            <button type="button" className="btn-ghost btn-sm" onClick={onOpenHistory}>
              {t('partnerDash.activity.more')} <ArrowRight className="size-3.5" aria-hidden />
            </button>
          }
        >
          {d.activity.length ? (
            <ul className="divide-y divide-line">
              {d.activity.map((a) => (
                <ActivityRow key={a.id} a={a} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t('partnerDash.activity.empty')}</p>
          )}
        </Panel>
      </div>
    </div>
  );
};
