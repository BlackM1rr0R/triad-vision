import { lazy, Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Route } from 'lucide-react';
import { api } from '@/lib/api';
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

// Team tasks linked to this case (own chunk).
const CaseTasks = lazy(() => import('@/components/tasks/CaseTasks').then((m) => ({ default: m.CaseTasks })));

export default function CaseAdmin() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
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

      <Panel title={t('admin.cases.workflow')} icon={Route}>
        <WorkflowStepper status={c.status} />
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <ActionPanel c={c} />
          {embassyFirst && showEmbassy && <RequirementsSection c={c} stage="EMBASSY" />}
          <RequirementsSection c={c} stage="INITIAL" />
          <ContractBox c={c} />
          {!embassyFirst && showEmbassy && <RequirementsSection c={c} stage="EMBASSY" />}
          <ClientFiles c={c} />
        </div>
        <div className="min-w-0 space-y-6">
          <CaseStatsPanel stats={data.stats} />
          <FamilyPanel caseId={c.id} parentCaseId={family.parentCaseId} />
          {c.status === 'APPROVED' && <OnboardingAdminPanel caseId={c.id} />}
          <Suspense fallback={null}>
            <CaseTasks caseId={c.id} number={c.number} clientName={`${c.client.firstName} ${c.client.lastName}`.trim()} />
          </Suspense>
          <Messages c={c} />
          <InternalNotes c={c} />
          <Timeline c={c} />
        </div>
      </div>
    </div>
  );
}
