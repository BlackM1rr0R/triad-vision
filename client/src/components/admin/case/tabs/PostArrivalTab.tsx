import { useTranslation } from 'react-i18next';
import { OnboardingAdminPanel } from '@/components/journey/OnboardingAdmin';
import RenewalPanel from '@/components/postArrival/RenewalPanel';
import PermitPanel from '@/components/postArrival/PermitPanel';
import CaseCheckInsPanel from '@/components/postArrival/CaseCheckInsPanel';
import type { CaseTabProps } from './types';

/**
 * Gəlişdən sonra: arrival plan / onboarding checklist, post-arrival check-ins with the churn risk, and the
 * residence-title renewal / probation end. Before the visa decision only a short note is shown.
 */
export default function PostArrivalTab({ c }: CaseTabProps) {
  const { t } = useTranslation();
  const approved = c.status === 'APPROVED';
  return (
    <div className="stack-page">
      {!approved && <p className="rounded-xl border border-dashed border-line bg-card px-4 py-6 text-center text-sm text-muted">{t('caseLayout.postArrival.notYet')}</p>}
      {approved && (
        <div id="case-onboarding">
          <OnboardingAdminPanel caseId={c.id} />
        </div>
      )}
      {approved && <CaseCheckInsPanel caseId={c.id} />}
      {/* Residence title expiry → renewal case, probation end, links to / from the renewal (renders nothing when not relevant). */}
      <RenewalPanel caseId={c.id} status={c.status} />
      {/* Expiry reminders: Blue Card / residence permit, health insurance, passport (90 / 60 / 30 days). */}
      <PermitPanel caseId={c.id} status={c.status} />
    </div>
  );
}
