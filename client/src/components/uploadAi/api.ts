import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';

/** Smart uploads API (/api/upload-ai): recognition proposals and scan quality of uploads. */

export const DOC_TYPES = [
  'PASSPORT', 'ID_CARD', 'BIRTH_CERT', 'DIPLOMA', 'TRANSCRIPT', 'VOCATIONAL_CERT', 'DRIVING_LICENCE', 'CV', 'PHOTO',
  'EMPLOYMENT_CONTRACT', 'JOB_OFFER', 'EMPLOYMENT_REFERENCE', 'LANGUAGE_CERT', 'RECOGNITION_DECISION', 'INSURANCE',
  'BANK_STATEMENT', 'POLICE_CERT', 'MARRIAGE_CERT', 'VISA', 'RESIDENCE_PERMIT', 'OTHER',
] as const;
export type DocType = (typeof DOC_TYPES)[number];
export type InsightAction = 'rename' | 'link' | 'move' | 'expiry';
export type QualityLevel = 'OK' | 'WARN' | 'BAD';

export interface QualityReason {
  code: string;
  level: 'WARN' | 'BAD';
  params?: Record<string, string | number>;
}
export interface Quality {
  level: QualityLevel;
  reasons: QualityReason[];
  kind?: 'image' | 'pdf' | 'other';
}

export interface ClientInsight {
  documentId: string;
  ready: boolean;
  docType: DocType | null;
  expiryDate: string | null;
  expectedType: DocType | null;
  flags: string[];
  quality: Quality | null;
  acknowledged: boolean;
}

export interface StaffInsight {
  id: string;
  documentId: string | null;
  driveNodeId: string | null;
  caseId: string | null;
  folderId: string | null;
  docType: DocType;
  confidence: number;
  source: string;
  fields: Partial<Record<'holderName' | 'firstName' | 'lastName' | 'documentNumber' | 'birthDate' | 'issueDate' | 'expiryDate' | 'issuingCountry' | 'issuingAuthority' | 'language', string>>;
  proposedName: string | null;
  proposedRequirementId: string | null;
  proposals: {
    actions: InsightAction[];
    currentName: string;
    folder?: { parentId: string; name: string; id: string | null };
    requirement?: { id: string; title: Record<string, string> | null; stage: string };
    expected?: { requirementId: string; docType: DocType | null };
  };
  expiryDate: string | null;
  flags: string[];
  quality: Quality | null;
  qualityLevel: QualityLevel | null;
  status: 'PENDING' | 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'AUTO_APPLIED' | 'FAILED';
  costUsd: number;
  error: string | null;
  createdAt: string;
}

/** The chip summary drive listings carry on file items (`item.uploadAi`). */
export interface UploadAiChipData {
  id: string;
  docType: DocType;
  status: StaffInsight['status'];
  qualityLevel: QualityLevel | null;
  open: number;
  flags: string[];
}

export const uploadAiKeys = {
  all: ['upload-ai'] as const,
  case: (caseId: string, scope: 'client' | 'staff') => ['upload-ai', 'case', scope, caseId] as const,
  folder: (folderId: string) => ['upload-ai', 'folder', folderId] as const,
  node: (nodeId: string) => ['upload-ai', 'node', nodeId] as const,
  settings: ['upload-ai', 'settings'] as const,
};

/** Recognition of a case's uploads; refreshed by the realtime event and, while something is pending, by polling. */
export function useCaseInsights(caseId: string, scope: 'client'): ReturnType<typeof useQuery<{ insights: ClientInsight[] }>>;
export function useCaseInsights(caseId: string, scope: 'staff'): ReturnType<typeof useQuery<{ insights: StaffInsight[]; open: number }>>;
export function useCaseInsights(caseId: string, scope: 'client' | 'staff') {
  const qc = useQueryClient();
  useRealtime('upload-ai.ready', (p) => {
    if (p.caseId === caseId) void qc.invalidateQueries({ queryKey: ['upload-ai', 'case'] });
  });
  return useQuery({
    queryKey: uploadAiKeys.case(caseId, scope),
    queryFn: async () => (await api.get(`/upload-ai/cases/${caseId}`)).data,
    staleTime: 20_000,
    // Fallback when the realtime stream is down: poll while something is still being recognised (at most ~2 min).
    refetchInterval: (q) => {
      const list = ((q.state.data as { insights?: (ClientInsight | StaffInsight)[] } | undefined)?.insights ?? []) as (ClientInsight & StaffInsight)[];
      const pending = list.some((i) => (scope === 'client' ? !i.ready : i.status === 'PENDING'));
      return pending && q.state.dataUpdateCount < 25 ? 5000 : false;
    },
  });
}

export const fetchNodeInsight = async (nodeId: string) => (await api.get<{ insight: StaffInsight }>(`/upload-ai/nodes/${nodeId}`)).data.insight;
export const acceptInsight = async (id: string, actions?: InsightAction[]) =>
  (await api.post<{ insight: StaffInsight }>(`/upload-ai/insights/${id}/accept`, actions ? { actions } : {})).data.insight;
export const rejectInsight = async (id: string) => (await api.post<{ insight: StaffInsight }>(`/upload-ai/insights/${id}/reject`)).data.insight;
export const changeInsightType = async (id: string, docType: DocType) => (await api.post<{ insight: StaffInsight }>(`/upload-ai/insights/${id}/type`, { docType })).data.insight;
export const reanalyzeInsight = async (id: string) => (await api.post<{ insight: StaffInsight }>(`/upload-ai/insights/${id}/reanalyze`)).data.insight;
export const requestReupload = async (docId: string) => (await api.post<{ note: string }>(`/upload-ai/documents/${docId}/request-reupload`)).data;
export const acceptAllInCase = async (caseId: string) => (await api.post<{ accepted: number }>(`/upload-ai/cases/${caseId}/accept-all`)).data;
export const acceptAllInFolder = async (folderId: string) => (await api.post<{ accepted: number }>(`/upload-ai/folders/${folderId}/accept-all`)).data;
export const ackDocument = async (docId: string) => (await api.post(`/upload-ai/documents/${docId}/ack`)).data;

export interface UploadAiSettings {
  enabled: boolean;
  aiEnabled: boolean;
  qualityEnabled: boolean;
  autoApply: { enabled: boolean; threshold: number; rename: boolean; link: boolean; move: boolean; expiry: boolean };
}
export const fetchUploadAiSettings = async () => (await api.get<{ settings: UploadAiSettings }>('/upload-ai/settings')).data.settings;
export const saveUploadAiSettings = async (patch: Partial<Omit<UploadAiSettings, 'autoApply'>> & { autoApply?: Partial<UploadAiSettings['autoApply']> }) =>
  (await api.put<{ settings: UploadAiSettings }>('/upload-ai/settings', patch)).data.settings;

/** The quality block of an upload response (`{ document, checks, quality }`). */
export const qualityOf = (data: unknown): Quality | null => {
  const q = (data as { quality?: unknown } | null)?.quality as Quality | null | undefined;
  return q && typeof q === 'object' && (q.level === 'OK' || q.level === 'WARN' || q.level === 'BAD') && Array.isArray(q.reasons) ? q : null;
};
