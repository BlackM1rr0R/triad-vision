import { lazy, Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Route } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { STATUS_STEP } from '@/lib/caseStatus';
import type { CaseDetail } from '@/lib/types';
import { ActionPanel } from '@/components/admin/case/ActionPanel';
import { CaseHeader } from '@/components/admin/case/CaseHeader';
import { ClientFiles } from '@/components/admin/case/ClientFiles';
import { InternalNotes, Messages, Timeline } from '@/components/admin/case/Communication';
import { CaseStatsPanel } from '@/components/admin/case/CaseStats';
import { ContractBox } from '@/components/admin/case/Contract';
import { RequirementsSection } from '@/components/admin/case/Requirements';
import { WorkflowStepper } from '@/components/admin/case/WorkflowStepper';
import { caseKey, type CaseDetailResponse } from '@/components/admin/case/shared';
import { ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import { FamilyPanel } from '@/components/journey/Family';
import { OnboardingAdminPanel } from '@/components/journey/OnboardingAdmin';
import { SignaturesPanel } from '@/components/esign/CaseSignatures';

// Team tasks linked to this case (own chunk).
const CaseTasks = lazy(() => import('@/components/tasks/CaseTasks').then((m) => ({ default: m.CaseTasks })));
// AI summary of the case (staff AI, own chunk).
// Physical originals, acts and QR labels (own chunk).
const CaseOriginalsPanel = lazy(() => import('@/components/originals/CaseOriginalsPanel'));
const CaseAiSummary = lazy(() => import('@/components/aiStaff/CaseAiSummary').then((m) => ({ default: m.CaseAiSummary })));
// One-click AI checks: consistency, contract, VIDEX (own chunk).
const CaseAiChecks = lazy(() => import('@/components/aiCase/CaseAiChecks').then((m) => ({ default: m.CaseAiChecks })));
// "Next step" card (rules + AI explanation) and the one-click embassy package (own chunks).
const NextStepCard = lazy(() => import('@/components/caseNext/NextStepCard').then((m) => ({ default: m.NextStepCard })));
// "Possible duplicate" badge of the client (ADMIN+, own chunk).
const DuplicateBadge = lazy(() => import('@/components/duplicates/DuplicateBadge'));
const EmbassyPackagePanel = lazy(() => import('@/components/caseNext/EmbassyPackagePanel').then((m) => ({ default: m.EmbassyPackagePanel })));
const CaseProfitCard = lazy(() => import('@/components/reports/CaseProfitCard'));
// Field-level change history + one-click revert (own chunk).
const CaseHistoryPanel = lazy(() => import('@/components/history/CaseHistoryPanel'));

export default function CaseAdmin() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: caseKey(id),
    queryFn: async () => (await api.get<CaseDetailResponse>(`/admin/cases/${id}`)).data,
    enabled: !!id,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  const c: CaseDetail = data.case;
  const family = c as CaseDetail & { parentCaseId?: string | null };

  const step = STATUS_STEP[c.status];
  const hasEmbassy = c.requirements.some((r) => r.stage === 'EMBASSY');
  // Show the embassy section once the case reached it (or it was reopened there / requirements exist).
  const showEmbassy = hasEmbassy || step >= 2;
  // Put the stage being worked on first.
  const embassyFirst = c.status === 'EMBASSY_DOCUMENTS' || c.status === 'EMBASSY_REVIEW';

  return (
    <div className="space-y-6">
      <Link to="/admin/cases" className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-navy-900">
        <ArrowLeft className="size-3.5" /> {t('admin.cases.back')}
      </Link>

      <CaseHeader key={c.id} c={c} />
      <Suspense fallback={null}>
        <DuplicateBadge userId={c.client.id} className="-mt-3" />
      </Suspense>

      <Suspense fallback={null}>
        <NextStepCard key={`next-${c.id}`} c={c} />
      </Suspense>

      <Suspense fallback={null}>
        <CaseAiSummary key={`ai-${c.id}`} caseId={c.id} />
      </Suspense>

      <Panel title={t('admin.cases.workflow')} icon={Route}>
        <WorkflowStepper status={c.status} />
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <div id="case-actions" className="scroll-mt-24">
            <ActionPanel c={c} />
          </div>
          <Suspense fallback={null}>
            <CaseAiChecks key={`ai-checks-${c.id}`} caseId={c.id} />
          </Suspense>
          <Suspense fallback={null}>
            <EmbassyPackagePanel key={`pkg-${c.id}`} c={c} />
          </Suspense>
          {embassyFirst && showEmbassy && <RequirementsSection c={c} stage="EMBASSY" />}
          <RequirementsSection c={c} stage="INITIAL" />
          <ContractBox c={c} />
          <SignaturesPanel caseId={c.id} />
          {!embassyFirst && showEmbassy && <RequirementsSection c={c} stage="EMBASSY" />}
          <ClientFiles c={c} />
        </div>
        <div className="min-w-0 space-y-6">
          <CaseStatsPanel stats={data.stats} />
          <FamilyPanel caseId={c.id} parentCaseId={family.parentCaseId} />
          <Suspense fallback={null}>
            <CaseOriginalsPanel caseId={c.id} />
          </Suspense>
          {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
            <Suspense fallback={null}>
              <CaseProfitCard key={`profit-${c.id}`} caseId={c.id} />
            </Suspense>
          )}
                    {c.status === 'APPROVED' && (
            <div id="case-onboarding" className="scroll-mt-24">
              <OnboardingAdminPanel caseId={c.id} />
            </div>
          )}
          <div id="case-tasks" className="scroll-mt-24">
            <Suspense fallback={null}>
              <CaseTasks caseId={c.id} number={c.number} clientName={`${c.client.firstName} ${c.client.lastName}`.trim()} />
            </Suspense>
          </div>
          <div id="case-messages" className="scroll-mt-24">
            <Messages c={c} />
          </div>
          <InternalNotes c={c} />
          <Timeline c={c} />
          <Suspense fallback={null}>
            <CaseHistoryPanel key={`history-${c.id}`} caseId={c.id} clientId={c.client.id} clientName={`${c.client.firstName} ${c.client.lastName}`.trim()} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
