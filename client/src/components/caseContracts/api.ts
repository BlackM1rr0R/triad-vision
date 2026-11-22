import { errorCode } from '@/lib/api';
import type { ContractKind } from '@/components/contracts/shared';

/** Two-step case contracts (server lib/caseContracts): Əmək müqaviləsi → İş müqaviləsi. */
export type Step = 'LABOUR' | 'WORK';
export const STEPS: Step[] = ['LABOUR', 'WORK'];
export type StepState = 'NOT_SENT' | 'TRIAD_TO_SIGN' | 'CLIENT_TO_SIGN' | 'SIGNED' | 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED' | 'RETURNED';
/** "V2": staff's own uploaded PDF, the client signs first (null = old template flow). */
export type ContractFlow = 'V2' | null;

/** Signature place on a page (PDF points, bottom-left origin) — server lib/esign/placements.ts. */
export interface Placement {
  role: 'CANDIDATE' | 'STAFF';
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  field?: string;
}

/** POST /admin/case-contracts/inspect */
export interface PdfInspect {
  pageCount: number;
  pages: { width: number; height: number; x: number; y: number }[];
  fields: { name: string; type: 'signature' | 'text' | 'other'; page: number; x: number; y: number; w: number; h: number }[];
}

export interface SignerInfo {
  signerId: string;
  name: string;
  userId: string | null;
  status: string;
  signedAt: string | null;
  invitedAt: string | null;
}

export interface StaffStep {
  step: Step;
  state: StepState;
  driveFolder: string;
  blockedReason: string | null;
  templates: { id: string; name: string; kind: ContractKind; language: string; isDefault: boolean }[];
  request: null | {
    id: string;
    title: string;
    status: string;
    isCaseContract: boolean;
    sentAt: string | null;
    expiresAt: string | null;
    completedAt: string | null;
    approvedAt: string | null;
    approvedBy: string | null;
    finalDocumentId: string | null;
    driveNodeId: string | null;
    driveFolderNodeId: string | null;
    flow: ContractFlow;
    originalName: string;
    returnedAt: string | null;
    returnReason: string | null;
    state: StepState;
    triad: SignerInfo | null;
    client: SignerInfo | null;
    others: { name: string; role: string; status: string; signedAt: string | null }[];
  };
  versions: number;
  flow: ContractFlow;
  /** V2 İş müqaviləsi: the documents of the set. */
  documents: StaffDoc[];
  canTriadSign: boolean;
  canApprove: boolean;
  canReturn: boolean;
}

export interface StaffDoc {
  id: string;
  title: string;
  status: string;
  state: StepState;
  originalName: string;
  sentAt: string | null;
  completedAt: string | null;
  approvedAt: string | null;
  finalDocumentId: string | null;
  returnedAt: string | null;
  returnReason: string | null;
  client: SignerInfo | null;
}

export interface StaffOverview {
  caseId: string;
  caseStatus: string;
  driveFolderId: string | null;
  triadSignatory: { id: string; name: string } | null;
  steps: StaffStep[];
}

export interface ClientStep {
  step: Step;
  state: StepState;
  title: string | null;
  sentAt: string | null;
  expiresAt: string | null;
  triadSignedAt: string | null;
  clientSignedAt: string | null;
  approvedAt: string | null;
  signerId: string | null;
  myTurn: boolean;
  signedDocumentId: string | null;
  flow?: ContractFlow;
  returnReason?: string | null;
  /** V2 İş müqaviləsi: every document to sign. */
  documents?: ClientDoc[];
}

export interface ClientDoc {
  id: string;
  title: string;
  state: StepState;
  clientSignedAt: string | null;
  approvedAt: string | null;
  signerId: string | null;
  myTurn: boolean;
  signedDocumentId: string | null;
  returnReason: string | null;
}

export const staffKey = (caseId: string) => ['case-contracts', 'staff', caseId] as const;
export const clientKey = (caseId: string) => ['case-contracts', 'client', caseId] as const;

/** Error text from this feature's copy (falls back to a generic message). */
export const ccError = (t: (k: string, o?: Record<string, unknown>) => string, err: unknown) => {
  const code = errorCode(err);
  const text = t(`caseContracts.errors.${code}`, { defaultValue: '' }) || t(`caseContracts.v2.errors.${code}`, { defaultValue: '' });
  return text || t('caseContracts.errors.fallback');
};
