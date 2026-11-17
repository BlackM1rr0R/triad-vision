import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesDriveClientFolders } from '@/i18n/pagesDriveClientFolders';
import { errorMessage } from '@/components/admin/labels';
import { refreshProcessing, isProcessingStage, type ProcessingStage } from '@/components/caseProcessing/api';
import type { DriveItem } from '../types';

registerCopy(pagesDriveClientFolders);

/**
 * Client folder actions of the documents section without opening the folder (server routes/admin/clientFolders):
 * partner set / change / remove, the team workflow stage for several folders, "Müştəriyə göndər" (the Fertig
 * documents → the client's portal). Every bulk call answers per case (ok / skipped / error code).
 */

export interface CaseResult {
  caseId: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
  number?: string;
  name?: string;
}
export interface BulkSummary {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
}
export interface BulkResponse {
  results: CaseResult[];
  summary: BulkSummary;
}

/** A drive client folder as a target of these actions. */
export interface FolderTarget {
  caseId: string;
  folderId: string;
  name: string;
  number?: string;
  stage: ProcessingStage | null;
  assigneeId: string | null;
  partner: { id: string; name: string } | null;
  readySentAt: string | null;
}

export const targetOf = (i: DriveItem): FolderTarget | null => {
  if (i.kind !== 'FOLDER' || !i.caseId || !i.caseInfo) return null;
  const stage = i.caseInfo.processing?.stage;
  return {
    caseId: i.caseId,
    folderId: i.id,
    name: i.caseInfo.clientName || i.name,
    number: i.caseNumber,
    stage: isProcessingStage(stage) ? stage : null,
    assigneeId: i.caseInfo.processing?.assigneeId ?? null,
    partner: i.caseInfo.partner ?? null,
    readySentAt: i.caseInfo.readySentAt ?? null,
  };
};

export const targetsOf = (list: DriveItem[]) => list.map(targetOf).filter((x): x is FolderTarget => !!x);

/** Translated reason of a failed case. */
export const reasonOf = (code: string | undefined) =>
  code && i18n.exists(`clientFolders.errors.${code}`) ? i18n.t(`clientFolders.errors.${code}`) : code && i18n.exists(`admin.errors.${code}`) ? i18n.t(`admin.errors.${code}`) : i18n.t('admin.common.opFailed');

/** Message of a request that failed as a whole (403 NO_PERMISSION, …). */
export const requestError = (err: unknown) => {
  const code = errorCode(err);
  return code && i18n.exists(`clientFolders.errors.${code}`) ? i18n.t(`clientFolders.errors.${code}`) : errorMessage(err);
};

export const setPartner = async (cases: string[], partnerId: string | null, note?: string) =>
  (await api.post<BulkResponse>('/admin/client-folders/partner', { cases, partnerId, ...(note ? { note } : {}) })).data;

export const moveStages = async (cases: string[], stage: ProcessingStage, assigneeId: string | null, note: string | null) =>
  (await api.post<BulkResponse>('/admin/client-folders/processing', { cases, stage, assigneeId, note })).data;

export const sendReady = async (cases: string[], resend: boolean) => (await api.post<BulkResponse>('/admin/client-folders/ready-docs/send', { cases, resend })).data;

export interface ReadyDocsView {
  caseId: string;
  number: string;
  stage: ProcessingStage | null;
  folder: { id: string; name: string } | null;
  files: { nodeId: string; name: string; path: string; version: number; size: number | null; mimeType: string | null; updatedAt: string; sent: boolean }[];
  newCount: number;
  sends: { id: string; at: string; by: string | null; fileCount: number; newCount: number; resend: boolean }[];
}

export const useReadyDocs = (caseId: string | null) =>
  useQuery({
    queryKey: ['drive', 'ready-docs', caseId],
    queryFn: async () => (await api.get<ReadyDocsView>(`/admin/client-folders/cases/${encodeURIComponent(caseId!)}/ready-docs`)).data,
    enabled: !!caseId,
    staleTime: 5_000,
  });

/** After any of these actions: the drive listing, the stage views, case lists, partner lists. */
export const refreshAfter = (qc: QueryClient) => {
  refreshProcessing(qc); // admin-cases, board, referral-partners, my-work, admin-case, drive
  void qc.invalidateQueries({ queryKey: ['referral-partners'] });
};
