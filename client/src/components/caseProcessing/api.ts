import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesCaseProcessing } from '@/i18n/pagesCaseProcessing';
import { pagesDriveProcessing } from '@/i18n/pagesDriveProcessing';
import type { BadgeTone } from '@/components/ui/status';
import type { CaseStatus, DocStatus, L10n } from '@/lib/types';
import { toastError } from '@/components/admin/labels';

registerCopy(pagesCaseProcessing);
registerCopy(pagesDriveProcessing); // "İş axını" of the documents section, claim, board drag & drop

/**
 * Team document workflow of a case (server lib/caseProcessing): In Bearbeitung → Schon geschrieben → Fertig,
 * and Ablehnung. The German stage names are the labels in every language (the team uses them).
 */
export const PROCESSING_STAGES = ['IN_PROGRESS', 'WRITTEN', 'DONE', 'REFUSED'] as const;
export type ProcessingStage = (typeof PROCESSING_STAGES)[number];
export const isProcessingStage = (v: string | null | undefined): v is ProcessingStage => !!v && (PROCESSING_STAGES as readonly string[]).includes(v);

export const STAGE_TONE: Record<ProcessingStage, BadgeTone> = { IN_PROGRESS: 'neutral', WRITTEN: 'info', DONE: 'success', REFUSED: 'danger' };

export interface Person {
  id: string;
  name: string;
}

/** Row summary on the cases list, the partner detail and the board. */
export interface ProcessingSummary {
  stage: ProcessingStage | null;
  at: string | null;
  by: Person | null;
  assignee: Person | null;
}

export type StageCounts = Record<ProcessingStage, number>;

export interface ProcessingMove {
  id: string;
  fromStage: ProcessingStage | null;
  toStage: ProcessingStage;
  by: Person | null;
  assignee: Person | null;
  note: string | null;
  createdAt: string;
}

export interface ProcessingFile {
  id: string;
  name: string;
  parentId: string;
  path: string;
  mimeType: string | null;
  size: number | null;
  updatedAt: string;
  workflowStage: string | null;
  link: string;
}

export interface ProcessingUpload {
  id: string;
  name: string;
  status: DocStatus;
  stage: string;
  mimeType: string;
  size: number;
  createdAt: string;
  requirement: L10n | null;
  url: string;
}

export interface ProcessingView {
  stage: ProcessingStage | null;
  stored: ProcessingStage | null;
  at: string | null;
  by: Person | null;
  assignee: Person | null;
  refused: boolean;
  history: ProcessingMove[];
  documents: { folderId: string | null; files: ProcessingFile[]; uploads: ProcessingUpload[] };
}

export interface BoardItem {
  id: string;
  number: string;
  visaType: string;
  status: CaseStatus;
  client: { firstName: string; lastName: string };
  visaCategory: { id: string; title: L10n; visaLabel: string } | null;
  partner: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
  processing: ProcessingSummary;
  lastNote: string | null;
}

export interface BoardColumn {
  stage: ProcessingStage;
  total: number;
  items: BoardItem[];
}

export const stageLabel = (s: ProcessingStage | null | undefined) => (s ? i18n.t(`caseProcessing.stages.${s}`) : i18n.t('caseProcessing.none'));

export const processingKey = (caseId: string) => ['case-processing', caseId] as const;

export const useProcessing = (caseId: string) =>
  useQuery({
    queryKey: processingKey(caseId),
    queryFn: async () => (await api.get<{ processing: ProcessingView }>(`/admin/cases/${caseId}/processing`)).data.processing,
    staleTime: 15_000,
  });

export interface MoveInput {
  stage: ProcessingStage;
  assigneeId: string | null;
  note: string | null;
  /** 'drive': made in the documents section — the notification links to the client folder there. */
  origin?: 'case' | 'drive';
}

/** Everything that shows a processing stage: case card, lists, board, "my work", the drive (folders, İş axını). */
const PROCESSING_DEPENDENTS = ['admin-cases', 'case-processing-board', 'referral-partners', 'my-work', 'admin-case', 'drive'];
export const refreshProcessing = (qc: QueryClient) => {
  for (const key of PROCESSING_DEPENDENTS) void qc.invalidateQueries({ queryKey: [key] });
};

/** POST /admin/cases/:id/processing (no toast / refresh: callers moving several cases do that once). */
export const postMove = async (caseId: string, v: MoveInput) => (await api.post<{ processing: ProcessingView }>(`/admin/cases/${caseId}/processing`, v)).data.processing;

/** POST /admin/cases/:id/processing — refreshes the case card, the lists, the board, "my work" and the drive. */
export const useMoveStage = (caseId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: MoveInput) => postMove(caseId, v),
    onSuccess: (data, v) => {
      qc.setQueryData(processingKey(caseId), data);
      toast.success(i18n.t('caseProcessing.moved', { stage: stageLabel(v.stage) }));
      refreshProcessing(qc);
    },
    onError: (e) => toastError(e),
  });
};

/** POST /admin/cases/:id/processing/claim — "Götür" (force: take it from a colleague). */
export const postClaim = async (caseId: string, v: { force?: boolean; origin?: 'case' | 'drive' } = {}) =>
  (await api.post<{ claimed: boolean; processing: ProcessingView }>(`/admin/cases/${caseId}/processing/claim`, v)).data;

export const useClaim = (caseId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { force?: boolean; origin?: 'case' | 'drive' }) => postClaim(caseId, v),
    onSuccess: (data) => {
      qc.setQueryData(processingKey(caseId), data.processing);
      toast.success(i18n.t(data.claimed ? 'driveProcessing.toasts.claimed' : 'driveProcessing.toasts.already'));
      refreshProcessing(qc);
    },
    onError: (e) => toastError(e),
  });
};

// ─── "İş axını" of the documents section ──────────────────────────────

export interface ProcessingFolder {
  caseId: string;
  number: string;
  folderId: string;
  folderName: string;
  clientName: string;
  visaType: string;
  visaCategory: { id: string; title: L10n; visaLabel: string } | null;
  partner: { id: string; name: string } | null;
  status: CaseStatus;
  processing: ProcessingSummary;
  lastNote: string | null;
  fileCount: number;
}

export interface ProcessingFolders {
  stage: ProcessingStage;
  counts: StageCounts;
  waitingForMe: number;
  total: number;
  limit: number;
  recentDays: number;
  items: ProcessingFolder[];
}

/** GET /admin/case-processing/folders — counts per stage and the client folders of one stage. */
export const useProcessingFolders = (p: { stage: ProcessingStage; mine?: boolean; search?: string }, enabled = true) =>
  useQuery({
    // under the drive keys: the drive's refresh / invalidateDrive reloads it too
    queryKey: ['drive', 'processing-folders', p],
    queryFn: async () =>
      (await api.get<ProcessingFolders>('/admin/case-processing/folders', { params: { stage: p.stage, mine: p.mine ? '1' : undefined, search: p.search || undefined } })).data,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled,
  });
