import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Handshake, Hourglass, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { STEP_KEYS } from '@/lib/caseStatus';
import { useL10n } from '@/lib/l10n';
import type { CaseStatus, L10n } from '@/lib/types';
import { CaseStepper } from '@/components/portal/CaseStepper';
import { fmtDate } from '@/components/admin/labels';
import { Empty, Loading, Section } from './shared';

interface Worker {
  id: string;
  name: string;
  profession: string;
  status: CaseStatus;
  step: number;
  startedAt: string;
  appointmentAt: string | null;
  decisionAt: string | null;
  visaValidFrom: string | null;
  expectedDecision: { from: string; to: string } | null;
  vacancy: { id: string; title: L10n } | null;
  visa: { title: L10n; visaLabel: string } | null;
}

export const CompanyWorkers = () => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { data, isLoading } = useQuery({
    queryKey: ['company-workers'],
    queryFn: async () => (await api.get<{ items: Worker[]; stepCount: number }>('/company/workers')).data,
  });
  if (isLoading || !data) return <Loading />;

  return (
    <Section title={t('jobsArea.portal.workers.title')} icon={Handshake}>
      <p className="-mt-2 mb-5 text-sm text-muted">{t('jobsArea.portal.workers.subtitle')}</p>
      {data.items.length === 0 ? (
        <Empty icon={Handshake} title={t('jobsArea.portal.workers.empty')} text={t('jobsArea.portal.workers.emptyText')} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.items.map((w) => (
            <li key={w.id} className="min-w-0 rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold text-navy-900">{w.name}</p>
                  <p className="truncate text-sm text-muted">
                    {[w.profession, w.vacancy ? tr(w.vacancy.title) : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {w.visa && <span className="badge bg-navy-900 text-white">{w.visa.visaLabel}</span>}
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-navy-900">
                    {w.step >= 0 ? t(`portal.steps.${STEP_KEYS[w.step]}`) : t('portal.status.CANCELLED')}
                  </span>
                  {w.step >= 0 && <span className="text-muted tabular-nums">{t('jobsArea.portal.workers.step', { n: w.step + 1, total: data.stepCount })}</span>}
                </div>
                <CaseStepper status={w.status} variant="mini" />
                <p className="mt-2 text-xs text-muted">{t(`portal.status.${w.status}`)}</p>
              </div>
              <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-xs text-ink/80">
                <li className="flex items-center gap-2">
                  <CalendarClock className="size-3.5 shrink-0 text-brand-600" aria-hidden /> {t('jobsArea.portal.workers.started', { date: fmtDate(w.startedAt) })}
                </li>
                {w.appointmentAt && w.status === 'APPOINTMENT_SCHEDULED' && (
                  <li className="flex items-center gap-2">
                    <CalendarClock className="size-3.5 shrink-0 text-violet-600" aria-hidden /> {t('jobsArea.portal.workers.appointment', { date: fmtDate(w.appointmentAt) })}
                  </li>
                )}
                {w.expectedDecision && (
                  <li className="flex items-center gap-2">
                    <Hourglass className="size-3.5 shrink-0 text-amber-600" aria-hidden />{' '}
                    {t('jobsArea.portal.workers.expected', { from: fmtDate(w.expectedDecision.from), to: fmtDate(w.expectedDecision.to) })}
                  </li>
                )}
                {w.status === 'APPROVED' && (
                  <li className="flex items-center gap-2 font-semibold text-emerald-700">
                    <ShieldCheck className="size-3.5 shrink-0" aria-hidden />{' '}
                    {w.visaValidFrom ? t('jobsArea.portal.workers.visaFrom', { date: fmtDate(w.visaValidFrom) }) : t('portal.status.APPROVED')}
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};
