import type { CaseDetail } from '@/lib/types';
import { BallPanel } from '@/components/clientProcess/Ball';
import type { BallInCourt } from '@/components/clientProcess/api';
import { CaseAiSummary } from '@/components/aiStaff/CaseAiSummary';
import { CaseAiChecks } from '@/components/aiCase/CaseAiChecks';
import CaseDataPanel from '@/components/clientData/CaseDataPanel';
import GermanStaffPanel from '@/components/german/GermanStaffPanel';
import CaseCourseCard from '@/components/course/CaseCourseCard';
import { CandidateEvaluations } from '@/components/placement/Evaluations';
import CaseHousingCard from '@/components/housing/CaseHousingCard';
import { ActionPanel } from '../ActionPanel';
import { CaseStatsPanel } from '../CaseStats';
import type { CaseTabProps } from './types';

type Extra = CaseDetail & { parentCaseId?: string | null; ballInCourt?: BallInCourt | null };

/**
 * Ümumi: status actions, status timeline, client-data confirmation, German progress, interview evaluations,
 * the "ball in court" details and the AI summary / one-click AI checks. Family members live in the "Ailə"
 * tab, arrival plan / check-ins / renewal in "Gəlişdən sonra".
 */
export default function OverviewTab({ c, stats, goTo }: CaseTabProps) {
  const x = c as Extra;
  const member = !!x.parentCaseId;
  return (
    <div className="stack-page">
      <div id="case-actions">
        <ActionPanel c={c} />
      </div>
      <CaseStatsPanel id="case-stats" stats={stats} status={c.status} onOpenMessages={() => goTo('case-messages')} />
      {x.ballInCourt && (
        <div id="case-ball-details">
          <BallPanel ball={x.ballInCourt} />
        </div>
      )}
      {/* Mənzil & Anmeldung: status + two-week deadline (approved cases only; renders nothing before). */}
      <CaseHousingCard caseId={c.id} status={c.status} />
      <CaseDataPanel c={c} />
      {!member && <GermanStaffPanel userId={c.client.id} />}
      {!member && <CaseCourseCard userId={c.client.id} />}
      {/* Interview evaluations of the candidate (employer + team), only when there are any. */}
      {!member && <CandidateEvaluations candidateId={c.client.id} hideEmpty />}
      <div id="case-ai-summary">
        <CaseAiSummary caseId={c.id} />
      </div>
      <CaseAiChecks caseId={c.id} />
    </div>
  );
}
