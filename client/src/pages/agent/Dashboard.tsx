import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { BadgeCheck, Briefcase, CalendarPlus, CheckCircle2, Clock3, HandCoins, Percent, Users, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { ErrorRetry, Loading, Section, type AgentDashboard, type AgentMe } from '@/components/agents/portal';
import { ShareBox } from '@/components/agents/ShareBox';
import { MiniBars } from '@/components/agents/MiniBars';
import { money, monthLabel, percent } from '@/components/agents/format';

const Kpi = ({ label, value, icon: Icon, tone = 'chip-sky text-ink' }: { label: string; value: string | number; icon: LucideIcon; tone?: string }) => (
  <div className="flex h-full items-start justify-between gap-3 rounded-2xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] sm:p-5">
    <div className="min-w-0">
      <p className="text-xs leading-snug font-medium text-muted">{label}</p>
      <p className="num mt-1.5 text-2xl leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[1.75rem]">{value}</p>
    </div>
    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}>
      <Icon className="size-5" aria-hidden />
    </span>
  </div>
);

export default function AgentDashboardPage({ me }: { me: AgentMe }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['agent-dashboard'], queryFn: async () => (await api.get<AgentDashboard>('/agent/dashboard')).data });
  const a = me.agent;
  const cur = a.currency;

  return (
    <>
      <ShareBox link={me.shareLink} code={a.code} />

      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <ErrorRetry onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Kpi label={t('agents.dash.kpi.referrals')} value={q.data.counts.referrals} icon={Users} />
            <Kpi label={t('agents.dash.kpi.thisMonth')} value={q.data.counts.registeredThisMonth} icon={CalendarPlus} tone="bg-accent-bg text-accent-fg" />
            <Kpi label={t('agents.dash.kpi.activeCases')} value={q.data.counts.activeCases} icon={Briefcase} tone="bg-warning-bg text-warning-fg" />
            <Kpi label={t('agents.dash.kpi.approvedVisas')} value={q.data.counts.approvedVisas} icon={BadgeCheck} tone="bg-success-bg text-success-fg" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            <Kpi label={t('agents.dash.earn.pending')} value={money(q.data.earnings.pendingCents, cur)} icon={Clock3} tone="bg-warning-bg text-warning-fg" />
            <Kpi label={t('agents.dash.earn.approved')} value={money(q.data.earnings.approvedCents, cur)} icon={CheckCircle2} />
            <Kpi label={t('agents.dash.earn.paid')} value={money(q.data.earnings.paidCents, cur)} icon={Wallet} tone="bg-success-bg text-success-fg" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section>
              <MiniBars label={t('agents.dash.chartReferrals')} bars={q.data.series.map((s) => ({ key: s.month, label: monthLabel(s.month), value: s.referrals }))} />
            </Section>
            <Section>
              <MiniBars
                label={t('agents.dash.chartEarnings')}
                color="bg-success"
                format={(v) => money(v, cur)}
                bars={q.data.series.map((s) => ({ key: s.month, label: monthLabel(s.month), value: s.earningsCents }))}
              />
            </Section>
          </div>
        </>
      )}

      <Section title={t('agents.dash.terms.title')} icon={HandCoins}>
        {a.commissionValue > 0 ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-lg font-semibold text-ink">
              {a.commissionType === 'PERCENT' ? <Percent className="size-5 text-primary" aria-hidden /> : <Wallet className="size-5 text-primary" aria-hidden />}
              {a.commissionType === 'PERCENT'
                ? t('agents.dash.terms.percent', { pct: percent(a.commissionValue) })
                : t('agents.dash.terms.fixed', { amount: money(a.commissionValue, cur) })}
            </p>
            <div>
              <p className="text-xs font-semibold text-muted">{t('agents.dash.terms.events')}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {a.payoutEvents.map((e) => (
                  <li key={e} className="badge bg-sunken text-ink">
                    {t(`agents.events.${e}`)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('agents.dash.terms.none')}</p>
        )}
      </Section>
    </>
  );
}
