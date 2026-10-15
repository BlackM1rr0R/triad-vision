import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Briefcase, CalendarCheck, Handshake, Plus, UserCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { STEP_KEYS } from '@/lib/caseStatus';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { fmtDate } from '@/components/admin/labels';
import { ScorePill } from '@/components/jobs/MatchMeter';
import type { AnonProfile } from '@/components/jobs/types';
import { Empty, Kpi, Loading, Section } from './shared';

interface Dashboard {
  company: { status: string; name: string };
  vacancies: Partial<Record<'DRAFT' | 'PENDING' | 'OPEN' | 'CLOSED', number>>;
  applications: Partial<Record<'PROPOSED' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED', number>>;
  workers: { total: number; approved: number; byStep: number[] };
  awaitingDecision: { id: string; matchScore: number | null; updatedAt: string; vacancy: { id: string; title: L10n }; candidate: AnonProfile }[];
}

export const CompanyDashboard = () => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { data, isLoading } = useQuery({
    queryKey: ['company-dashboard'],
    queryFn: async () => (await api.get<Dashboard>('/company/dashboard')).data,
  });
  if (isLoading || !data) return <Loading />;
  const maxStep = Math.max(1, ...data.workers.byStep);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi
          label={t('jobsArea.portal.dashboard.openVacancies')}
          value={data.vacancies.OPEN ?? 0}
          hint={t('jobsArea.portal.dashboard.pendingHint', { count: data.vacancies.PENDING ?? 0 })}
          icon={Briefcase}
        />
        <Kpi label={t('jobsArea.portal.dashboard.proposed')} value={data.applications.PROPOSED ?? 0} hint={t('jobsArea.portal.dashboard.proposedHint')} icon={UserCheck} tone="violet" />
        <Kpi label={t('jobsArea.portal.dashboard.interviews')} value={data.applications.INTERVIEW ?? 0} icon={CalendarCheck} tone="warn" />
        <Kpi
          label={t('jobsArea.portal.dashboard.workers')}
          value={data.workers.total}
          hint={t('jobsArea.portal.dashboard.approvedHint', { count: data.workers.approved })}
          icon={Handshake}
          tone="good"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Section
          title={t('jobsArea.portal.dashboard.awaiting')}
          icon={Users}
          actions={
            <Link to="/company/candidates" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
              {t('jobsArea.portal.dashboard.viewAll')} <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {data.awaitingDecision.length === 0 ? (
            <Empty icon={UserCheck} title={t('jobsArea.portal.dashboard.noAwaiting')} text={t('jobsArea.portal.dashboard.noAwaitingText')} />
          ) : (
            <ul className="divide-y divide-line">
              {data.awaitingDecision.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy-900">{a.candidate.name}</p>
                    <p className="truncate text-xs text-muted">
                      {[a.candidate.profession, tr(a.vacancy.title)].filter(Boolean).join(' · ')} · {fmtDate(a.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ScorePill score={a.matchScore} />
                    <Link to="/company/candidates" className="btn-ghost btn-sm">
                      {t('jobsArea.portal.dashboard.decide')}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('jobsArea.portal.dashboard.workersByStep')} icon={Handshake}>
          {data.workers.total === 0 ? (
            <Empty icon={Handshake} title={t('jobsArea.portal.workers.empty')} text={t('jobsArea.portal.workers.emptyText')} />
          ) : (
            <ul className="space-y-3">
              {STEP_KEYS.map((k, i) => (
                <li key={k} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 text-sm">
                  <span className="truncate text-ink/80">{t(`portal.steps.${k}`)}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface">
                    <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(data.workers.byStep[i] / maxStep) * 100}%` }} />
                  </span>
                  <span className="text-right font-semibold text-navy-900 tabular-nums">{data.workers.byStep[i]}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/company/vacancies/new" className="btn-primary">
          <Plus className="size-4" /> {t('jobsArea.portal.vacancies.new')}
        </Link>
        <Link to="/company/workers" className="btn-ghost">
          {t('jobsArea.portal.nav.workers')} <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
};
