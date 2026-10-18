import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowRight, BadgeCheck, Briefcase, CalendarDays, CheckCircle2, Clock3, HandCoins, Users, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { money, day } from '@/components/agents/format';
import type { PartnerDashboard, PartnerMe } from '@/components/partnerPortal/api';
import { ErrorRetry, Kpi, Loading, Section, StatusPill } from '@/components/partnerPortal/ui';

export default function PartnerDashboardPage({ me }: { me: PartnerMe }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['partner-portal', 'dashboard'], queryFn: async () => (await api.get<PartnerDashboard>('/partner/dashboard')).data });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorRetry onRetry={() => q.refetch()} />;
  const d = q.data;
  const cur = d.currency;

  const eventLabel = (e: PartnerDashboard['recent'][number]) =>
    e.toStatus ? t(`partnerPortal.status.${e.toStatus}`) : t(`partnerPortal.event.${e.type}`, { defaultValue: t('partnerPortal.event.other') });

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Kpi label={t('partnerPortal.dashboard.clients')} value={d.counts.clients} icon={Users} />
        <Kpi label={t('partnerPortal.dashboard.activeCases')} value={d.counts.activeCases} icon={Briefcase} tone="bg-amber-100 text-amber-700" />
        <Kpi label={t('partnerPortal.dashboard.approvedVisas')} value={d.counts.approvedVisas} icon={BadgeCheck} tone="bg-emerald-100 text-emerald-700" />
      </div>

      <Section
        title={t('partnerPortal.dashboard.commissions')}
        icon={HandCoins}
        actions={
          <Link to="/partner/commissions" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
            {t('partnerPortal.dashboard.viewCommissions')} <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Kpi label={t('partnerPortal.dashboard.pending')} value={money(d.commissions.pendingCents, cur)} icon={Clock3} tone="bg-amber-100 text-amber-700" />
          <Kpi label={t('partnerPortal.dashboard.approved')} value={money(d.commissions.approvedCents, cur)} icon={CheckCircle2} />
          <Kpi label={t('partnerPortal.dashboard.paid')} value={money(d.commissions.paidCents, cur)} icon={Wallet} tone="bg-emerald-100 text-emerald-700" />
          <Kpi label={t('partnerPortal.dashboard.thisMonth')} value={money(d.commissions.thisMonthCents, cur)} icon={CalendarDays} tone="bg-violet-100 text-violet-700" />
        </div>
        {me.partner.commissionCents != null && me.partner.commissionCents > 0 && (
          <p className="mt-4 text-sm text-muted">{t('partnerPortal.dashboard.defaultCommission', { amount: money(me.partner.commissionCents, me.partner.currency) })}</p>
        )}
      </Section>

      <Section
        title={t('partnerPortal.dashboard.recent')}
        icon={Activity}
        actions={
          <Link to="/partner/clients" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
            {t('partnerPortal.dashboard.viewClients')} <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      >
        {d.recent.length === 0 ? (
          <p className="text-sm text-muted">{t('partnerPortal.dashboard.recentEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.recent.map((e) => (
              <li key={e.id}>
                <Link to={`/partner/clients/${e.caseId}`} className="-mx-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 hover:bg-surface">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{e.client}</span>
                    <span className="block text-xs text-muted">
                      <span className="font-mono">{e.caseNumber}</span> · {day(e.createdAt)}
                    </span>
                  </span>
                  {e.toStatus ? <StatusPill status={e.toStatus} /> : <span className="text-sm text-ink/80">{eventLabel(e)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
