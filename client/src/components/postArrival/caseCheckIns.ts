import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RiskReason } from './RiskBadge';

// Data of the case card's "After arrival" tab (no UI / copy here, so the case page can read the tab badge
// without loading the panel chunk).

export interface CaseCheckIn {
  id: string;
  audience: 'WORKER' | 'EMPLOYER';
  offsetDays: number;
  dueAt: string;
  sentAt: string | null;
  answer: 'OK' | 'ISSUE' | null;
  topics: string[] | null;
  comment: string | null;
  answeredAt: string | null;
  resolvedAt: string | null;
}

export interface CaseFollowUp {
  id: string;
  arrivedAt: string;
  leftJobAt: string | null;
  leftReason: string | null;
  riskScore: number | null;
  riskLevel: string | null;
  riskReasons: RiskReason[] | null;
  riskAt: string | null;
  checkIns: CaseCheckIn[];
}

export const caseCheckInsKey = (caseId: string) => ['case-checkins', caseId] as const;

/** Follow-up of one case (GET /admin/check-ins/cases/:caseId); shared by the tab badge and the panel. */
export const useCaseCheckIns = (caseId: string, enabled = true) =>
  useQuery({
    queryKey: caseCheckInsKey(caseId),
    queryFn: async () => (await api.get<{ followUp: CaseFollowUp | null }>(`/admin/check-ins/cases/${caseId}`)).data.followUp,
    enabled,
    staleTime: 60_000,
  });

/** Problems reported after arrival that nobody marked as handled yet. */
export const openIssues = (f: CaseFollowUp | null | undefined) => (f?.checkIns ?? []).filter((c) => c.answer === 'ISSUE' && !c.resolvedAt).length;

