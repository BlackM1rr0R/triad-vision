import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowRight, BadgeCheck, Ban, Briefcase, CalendarDays, CheckCircle2, Clock3, HandCoins, Layers, TrendingUp, Users, Wallet } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesDashboards } from '@/i18n/pagesDashboards';
import { AreaChart, VIZ, type ChartSeries } from '@/components/charts';
import { useL10n } from '@/lib/l10n';
import { api } from '@/lib/api';
import { money, day } from '@/components/agents/format';
import { accessOf, type PartnerDashboard, type PartnerMe } from '@/components/partnerPortal/api';
import { ErrorRetry, Kpi, Loading, Section, StatusPill } from '@/components/partnerPortal/ui';
import { EmptyState } from '@/components/ui';
import { EmptyInbox } from '@/components/illustrations';

registerCopy(pagesDashboards);

const monthLabel = (m: string) => `${m.slice(5, 7)}.${m.slice(2, 4)}`;

/** Monthly trend line of the partner's own clients, cases and granted visas (the visa line only with the case-stage permission). */
const TrendSection = ({ trend }: { trend: NonNullable<PartnerDashboard['trend']> }) => {
  const { t } = useTranslation();
  const series: ChartSeries[] = [
    { key: 'clients', label: t('dash.trend.clients'), color: VIZ[0] },
    { key: 'cases', label: t('dash.trend.cases'), color: VIZ[1] },
    ...(trend.approved ? [{ key: 'approved', label: t('dash.trend.approved'), color: VIZ[2] }] : []),
  ];
  const points = trend.months.map((x, i) => ({ x, values: { clients: trend.clients[i], cases: trend.cases[i], ...(trend.approved ? { approved: trend.approved[i] } : {}) } }));
  const empty = !trend.clients.some(Boolean) && !trend.cases.some(Boolean) && !trend.approved?.some(Boolean);
  return (
    <Section title={t('dash.trend.title')} icon={TrendingUp}>
      {empty ? (
        <p className="py-6 text-center text-sm text-muted">{t('dash.trend.empty')}</p>
      ) : (
        <AreaChart mode="line" points={points} series={series} xLabel={monthLabel} ariaLabel={t('dash.trend.aria')} height={220} />
      )}
    </Section>
  );
};

export default function PartnerDashboardPage({ me }: { me: PartnerMe }) {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const q = useQuery({ queryKey: ['partner-portal', 'dashboard'], queryFn: async () => (await api.get<PartnerDashboard>('/partner/dashboard')).data });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorRetry onRetry={() => q.refetch()} />;
  const d = q.data;
  const cur = d.currency;
  // Figures the permission set does not include come back empty from the server; their blocks are left out.
  const perms = accessOf(me).permissions;
  const stage = perms.caseStage && d.counts.activeCases != null;
  const commissions = perms.payments ? d.commissions : null;

  const eventLabel = (e: PartnerDashboard['recent'][number]) =>
    e.toStatus ? t(`partnerPortal.status.${e.toStatus}`) : t(`partnerPortal.event.${e.type}`, { defaultValue: t('partnerPortal.event.other') });

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label={t('partnerPortal.dashboard.clients')} value={d.counts.clients} icon={Users} />
        {stage ? (
          <>
            <Kpi label={t('partnerPortal.dashboard.activeCases')} value={d.counts.activeCases ?? 0} icon={Briefcase} tone="bg-warning-bg text-warning-fg" />
            <Kpi label={t('partnerPortal.dashboard.approvedVisas')} value={d.counts.approvedVisas ?? 0} icon={BadgeCheck} tone="bg-success-bg text-success-fg" />
            <Kpi label={t('partnerPortal.dashboard.rejected')} value={d.counts.rejected ?? 0} icon={Ban} tone="bg-danger-bg text-danger-fg" />
          </>
        ) : (
          <p className="col-span-2 self-center text-sm text-muted lg:col-span-3">{t('partnerAccess.noStage')}</p>
        )}
      </div>

      {d.trend && <TrendSection trend={d.trend} />}

      {!!d.byVisa?.length && (
        <Section title={t('partnerPortal.dashboard.byVisa')} icon={Layers}>
          <ul className="divide-y divide-line">
            {d.byVisa.map((f) => (
              <li key={f.key} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0 font-semibold text-ink">
                  {f.visaCategory ? tr(f.visaCategory.title) : t(`partnerPortal.types.${f.visaType}`, { defaultValue: f.visaType })}
                  {f.visaCategory && <span className="ml-1.5 text-xs font-normal text-muted">{f.visaCategory.visaLabel}</span>}
                </span>
                <span className="flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
                  <span>
                    {t('partnerPortal.dashboard.clients')}: <b className="text-ink">{f.count}</b>
                  </span>
                  {stage && (
                    <>
                      <span>
                        {t('partnerPortal.dashboard.activeCases')}: <b className="text-warning-fg">{f.active}</b>
                      </span>
                      <span>
                        {t('partnerPortal.dashboard.approvedVisas')}: <b className="text-success-fg">{f.approved}</b>
                      </span>
                      <span>
                        {t('partnerPortal.clients.refused')}: <b className="text-danger-fg">{f.refused}</b>
                      </span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {commissions && (
        <Section
          title={t('partnerPortal.dashboard.commissions')}
          icon={HandCoins}
          actions={
            <Link to="/partner/commissions" className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
              {t('partnerPortal.dashboard.viewCommissions')} <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Kpi label={t('partnerPortal.dashboard.pending')} value={money(commissions.pendingCents, cur)} icon={Clock3} tone="bg-warning-bg text-warning-fg" />
            <Kpi label={t('partnerPortal.dashboard.approved')} value={money(commissions.approvedCents, cur)} icon={CheckCircle2} />
            <Kpi label={t('partnerPortal.dashboard.paid')} value={money(commissions.paidCents, cur)} icon={Wallet} tone="bg-success-bg text-success-fg" />
            <Kpi label={t('partnerPortal.dashboard.thisMonth')} value={money(commissions.thisMonthCents, cur)} icon={CalendarDays} tone="bg-accent-bg text-accent-fg" />
          </div>
          {me.partner.commissionCents != null && me.partner.commissionCents > 0 && (
            <p className="mt-4 text-sm text-muted">{t('partnerPortal.dashboard.defaultCommission', { amount: money(me.partner.commissionCents, me.partner.currency) })}</p>
          )}
        </Section>
      )}

      {perms.clientList !== 'none' && stage && (
        <Section
          title={t('partnerPortal.dashboard.recent')}
          icon={Activity}
          actions={
            <Link to="/partner/clients" className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
              {t('partnerPortal.dashboard.viewClients')} <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        >
          {d.recent.length === 0 ? (
            <EmptyState compact illustration={<EmptyInbox className="w-28" />} title={t('partnerPortal.dashboard.recentEmpty')} />
          ) : (
            <ul className="divide-y divide-line">
              {d.recent.map((e) => (
                <li key={e.id}>
                  <Link to={`/partner/clients/${e.caseId}`} className="-mx-2 flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-3 transition-colors hover:bg-sunken">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{e.client}</span>
                      <span className="block text-xs text-muted">
                        <span className="font-mono">{e.caseNumber}</span> · {day(e.createdAt)}
                      </span>
                    </span>
                    {e.toStatus ? <StatusPill status={e.toStatus} /> : <span className="text-sm text-muted">{eventLabel(e)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}
