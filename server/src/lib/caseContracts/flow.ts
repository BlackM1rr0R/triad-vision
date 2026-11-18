import type { CaseStatus, ContractKind, Locale } from '@prisma/client';

/**
 * Two-step case contracts — pure rules (no database), shared by the service, the routes and the unit tests.
 *
 *   1. LABOUR — "Əmək müqaviləsi" between Triad Vision and the client.
 *   2. WORK   — "İş müqaviləsi" (work contract; WORK or AUSBILDUNG template). Only after step 1 is approved.
 *
 * Both are signed in the same order: Triad Vision's signatory first (STAFF, order 1), then the client (CANDIDATE,
 * order 2), then a staff member approves. The employer is never a party or signer of these two contracts.
 */

export const STEPS = ['LABOUR', 'WORK'] as const;
export type Step = (typeof STEPS)[number];

/** Template kinds that may be used for each step. */
export const STEP_TEMPLATE_KINDS: Record<Step, ContractKind[]> = { LABOUR: ['LABOUR'], WORK: ['WORK', 'AUSBILDUNG'] };

export const stepOfKind = (k: ContractKind | null | undefined): Step | null => (k === 'LABOUR' ? 'LABOUR' : k === 'WORK' || k === 'AUSBILDUNG' ? 'WORK' : null);

/**
 * Sub-folder of the client's drive folder (inside "Anträge/…/<client folder>") holding the signed PDF. The drive
 * names folders in German, but these two carry the owner's own terms so staff find them under the same name as
 * in the admin panel.
 */
export const DRIVE_FOLDER: Record<Step, string> = { LABOUR: 'Əmək müqaviləsi', WORK: 'İş müqaviləsi' };

/** Case statuses in which step 1 is the case's contract step (moves the case to CONTRACT_SENT / CONTRACT_SIGNED). */
export const CONTRACT_STEP_STATUSES: CaseStatus[] = ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'];
const CLOSED: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];
/** Statuses in which an already approved Əmək müqaviləsi may be sent again (the case still waits for its contract). */
export const LABOUR_RESEND_STATUSES: CaseStatus[] = ['DOCUMENTS_REVIEW', 'CONTRACT_SENT'];

export type StepState =
  | 'NOT_SENT'
  | 'TRIAD_TO_SIGN' // waiting for the Triad Vision signature
  | 'CLIENT_TO_SIGN' // Triad Vision signed, waiting for the client
  | 'SIGNED' // both signed, waiting for staff approval
  | 'APPROVED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface SignerLite {
  role: string;
  status: string;
  order: number;
}
export interface RequestLite {
  status: string;
  createdAt: Date;
  approvedAt: Date | null;
  expiresAt: Date | null;
  signers: SignerLite[];
}

const isOpen = (s: SignerLite) => s.status === 'PENDING' || s.status === 'VIEWED';

/** The request that describes a step: the newest one that was sent and not superseded, else the newest. */
export const latestOf = <R extends RequestLite>(rows: R[]): R | null => {
  const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return sorted.find((r) => r.status !== 'CANCELLED' && r.status !== 'DRAFT') ?? sorted.find((r) => r.status !== 'DRAFT') ?? null;
};

export const stepState = (r: RequestLite | null, now = new Date()): StepState => {
  if (!r) return 'NOT_SENT';
  switch (r.status) {
    case 'COMPLETED':
      return r.approvedAt ? 'APPROVED' : 'SIGNED';
    case 'SENT':
      if (r.expiresAt && r.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
      return r.signers.some((s) => s.role === 'STAFF' && isOpen(s)) ? 'TRIAD_TO_SIGN' : 'CLIENT_TO_SIGN';
    case 'DECLINED':
      return 'DECLINED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'NOT_SENT';
  }
};

/**
 * Why a step cannot be sent now (null = it can). Step 2 needs step 1 approved; an approved step is final;
 * closed cases take no contract.
 */
export const sendBlockReason = (step: Step, states: Record<Step, StepState>, caseStatus: CaseStatus): string | null => {
  if (CLOSED.includes(caseStatus)) return 'CASE_CLOSED';
  // Step 1 sent before the contract step would never become the case contract (its approval could not move the case).
  if (step === 'LABOUR' && caseStatus === 'DOCUMENTS_PENDING') return 'NOT_CONTRACT_STEP';
  // An Əmək müqaviləsi approved outside this contract step (sent early, or before a reopen) did not move the case:
  // while the case is back at the contract step a new version may be sent, else the case would be stuck.
  if (states[step] === 'APPROVED' && !(step === 'LABOUR' && LABOUR_RESEND_STATUSES.includes(caseStatus))) return 'ALREADY_APPROVED';
  if (step === 'WORK' && states.LABOUR !== 'APPROVED') return 'LABOUR_NOT_APPROVED';
  return null;
};

/** Step 1 becomes the case's contract (case status flow) only while the case is in its contract step. */
export const isCaseContractFor = (step: Step, caseStatus: CaseStatus) => step === 'LABOUR' && CONTRACT_STEP_STATUSES.includes(caseStatus);

export interface PartyInput {
  name: string;
  email: string;
  phone?: string | null;
  userId?: string | null;
  locale?: Locale | null;
}

/** Signer order: Triad Vision's signatory first, the client second — nobody else (no employer). */
export const triadFirstSigners = (triad: PartyInput, client: PartyInput) => [
  { role: 'STAFF' as const, ...triad, order: 1 },
  { role: 'CANDIDATE' as const, ...client, order: 2 },
];

export const canApprove = (state: StepState) => state === 'SIGNED';

/** "Əmək müqaviləsi – TV-2026-0012 (imzalanmış).pdf" (drive file of the signed copy). */
export const signedFileName = (step: Step, caseNumber: string) => `${DRIVE_FOLDER[step]} – ${caseNumber} (imzalanmış).pdf`;

// ─── Whose turn is the case contract? ─────────────────────────────────

/**
 * Who has to act on the case contract while the case is CONTRACT_SENT:
 *   CLIENT  the client signs (legacy upload without e-sign request, or the request's current turn includes the client)
 *   TRIAD   Triad Vision (or another party) signs before the client — the client is not invited yet
 *   STAFF   the request is expired / declined / cancelled / completed without moving the case: staff send a new version
 * null: no open contract (none, or already signed).
 */
export type ContractTurn = 'CLIENT' | 'TRIAD' | 'STAFF';

export interface ContractRequestLite {
  status: string;
  order: string;
  expiresAt: Date | null;
  signers: SignerLite[];
}

export const caseContractTurn = (
  contract: { signedAt: Date | null; signatureRequestId: string | null } | null,
  request: ContractRequestLite | null,
  now = new Date(),
): ContractTurn | null => {
  if (!contract || contract.signedAt) return null;
  if (!contract.signatureRequestId) return 'CLIENT';
  if (!request || request.status !== 'SENT' || (request.expiresAt && request.expiresAt.getTime() <= now.getTime())) return 'STAFF';
  const open = request.signers.filter(isOpen);
  if (!open.length) return 'STAFF';
  const min = Math.min(...open.map((s) => s.order));
  const turn = request.order === 'PARALLEL' ? open : open.filter((s) => s.order === min);
  return turn.some((s) => s.role === 'CANDIDATE') ? 'CLIENT' : 'TRIAD';
};
