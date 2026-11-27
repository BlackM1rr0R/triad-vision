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

/** "Geri qaytar": the cases leave the workflow, their workflow documents go back to the client folders. */
export const returnToClient = async (cases: string[], note: string | null) => (await api.post<BulkResponse>('/admin/client-folders/return', { cases, note })).data;

/** Several folders: their Fertig files; one folder with `fileIds`: exactly the picked files (server checks they belong to that case). */
export const sendReady = async (cases: string[], resend: boolean, fileIds?: string[]) =>
  (await api.post<BulkResponse>('/admin/client-folders/ready-docs/send', { cases, resend, ...(fileIds ? { fileIds } : {}) })).data;

/** Where a sendable file lives: a stage folder of the workflow or the client's own drive folder. */
export type FileSource = 'DONE' | 'IN_PROGRESS' | 'WRITTEN' | 'CLIENT';

export interface ReadyFileView {
  nodeId: string;
  name: string;
  path: string;
  version: number;
  size: number | null;
  mimeType: string | null;
  updatedAt: string;
  sent: boolean;
  source: FileSource;
}

export interface ReadyDocsView {
  caseId: string;
  number: string;
  stage: ProcessingStage | null;
  folder: { id: string; name: string } | null;
  /** The Fertig folder's files. */
  files: ReadyFileView[];
  /** Everything else that can be picked: the case's other workflow folders and the client's own folder (Arbeitsvertrag, …). */
  others: ReadyFileView[];
  newCount: number;
  /** Single-contract flow: the client has not paid yet (the send dialog warns; the send is not blocked). */
  paymentDue?: boolean;
  sends: { id: string; at: string; by: string | null; fileCount: number; newCount: number; resend: boolean; documents: { documentId: string; name: string; size: number | null; mimeType: string | null; available: boolean }[] }[];
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
