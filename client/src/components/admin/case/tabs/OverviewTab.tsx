import type { CaseDetail } from '@/lib/types';
import { BallPanel } from '@/components/clientProcess/Ball';
import type { BallInCourt } from '@/components/clientProcess/api';
import { CaseAiSummary } from '@/components/aiStaff/CaseAiSummary';
import { CaseAiChecks } from '@/components/aiCase/CaseAiChecks';
import CaseDataPanel from '@/components/clientData/CaseDataPanel';
import FamilyAdminPanel from '@/components/family/FamilyAdminPanel';
import { FamilyPanel } from '@/components/journey/Family';
import GermanStaffPanel from '@/components/german/GermanStaffPanel';
import { OnboardingAdminPanel } from '@/components/journey/OnboardingAdmin';
import RenewalPanel from '@/components/postArrival/RenewalPanel';
import { CandidateEvaluations } from '@/components/placement/Evaluations';
import { ActionPanel } from '../ActionPanel';
import { CaseStatsPanel } from '../CaseStats';
import type { CaseTabProps } from './types';

type Extra = CaseDetail & { parentCaseId?: string | null; ballInCourt?: BallInCourt | null };

/**
 * Ümumi: status actions, status timeline, client-data confirmation, family, German progress, the
 * "ball in court" details and the AI summary / one-click AI checks.
 */
export default function OverviewTab({ c, stats, goTo }: CaseTabProps) {
  const x = c as Extra;
  const member = !!x.parentCaseId;
  return (
    <div className="stack-page">
      {/* After the visa the onboarding / arrival checklist is the work that is left. */}
      {c.status === 'APPROVED' && (
        <div id="case-onboarding">
          <OnboardingAdminPanel caseId={c.id} />
        </div>
      )}
      {/* After the visa: residence title expiry → renewal case, probation end, links to / from the renewal. */}
      <RenewalPanel caseId={c.id} status={c.status} />
      <div id="case-actions">
        <ActionPanel c={c} />
      </div>
      <CaseStatsPanel id="case-stats" stats={stats} status={c.status} onOpenMessages={() => goTo('case-messages')} />
      {x.ballInCourt && (
        <div id="case-ball-details">
          <BallPanel ball={x.ballInCourt} />
        </div>
      )}
      <CaseDataPanel c={c} />
      {/* Main case: members with their checklists; member case: who it is for + the group links. */}
      <FamilyAdminPanel caseId={c.id} parentCaseId={x.parentCaseId} />
      {member && <FamilyPanel caseId={c.id} parentCaseId={x.parentCaseId} />}
      {!member && <GermanStaffPanel userId={c.client.id} />}
      {/* Interview evaluations of the candidate (employer + team), only when there are any. */}
      {!member && <CandidateEvaluations candidateId={c.client.id} hideEmpty />}
      <div id="case-ai-summary">
        <CaseAiSummary caseId={c.id} />
      </div>
      <CaseAiChecks caseId={c.id} />
    </div>
  );
}
