import type { CaseStatus, ContractKind, Locale } from '@prisma/client';

/**
 * Case contracts — pure rules (no database), shared by the service, the routes and the unit tests.
 *
 *   1. LABOUR — "Əmək müqaviləsi" between Triad Vision and the client: THE ONLY contract of a case.
 *   2. WORK   — "İş müqaviləsi": RETIRED (owner's rule). New cases never get one: the German documents (Arbeitsvertrag …)
 *               are prepared in the drive workflow (Schon geschrieben → In Bearbeitung → Fertig) and sent to the client
 *               from there, which moves the case to the embassy documents. The WORK step stays in the code only so that
 *               old cases where an İş müqaviləsi was already sent / signed keep their data and can be finished.
 *
 * Old flow (contractFlow null, template PDF): Triad Vision's signatory first (STAFF, order 1), then the client
 * (CANDIDATE, order 2), then a staff member approves.
 *
 * V2 (contractFlow "V2", the owner's flow for every new contract): staff upload their OWN PDF and mark the signature
 * places (lib/esign/placements.ts).
 *   LABOUR  one PDF; the client signs first (order 1), then Triad Vision (order 2) if it agrees — that signature
 *           completes the request and approves it at once. Staff may instead send it back with a reason (RETURNED).
 *   WORK    1–10 PDFs (one request each), only the client signs; staff review the whole set and approve it (no
 *           Triad Vision signature) or send one document back with a reason (legacy only, see above). Approval = İş müqaviləsi approved: the
 *           employer becomes visible to the client and the case moves on to the embassy documents.
 * The employer is never a party or signer of these contracts.
 */

export const FLOW_V2 = 'V2';
export const MAX_WORK_DOCS = 10;

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
  | 'CANCELLED'
  | 'RETURNED'; // V2: staff sent it back with a reason (a new version is due)

export interface SignerLite {
  role: string;
  status: string;
  order: number;
}
export interface RequestLite {
  status: string;
  order?: string;
  returnedAt?: Date | null;
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
    {
      // Whoever's turn it is (old flow: Triad Vision first; V2: the client first).
      const open = r.signers.filter(isOpen);
      if (!open.length) return 'SIGNED';
      const min = Math.min(...open.map((s) => s.order));
      const turn = r.order === 'PARALLEL' ? open : open.filter((s) => s.order === min);
      return turn.some((s) => s.role === 'CANDIDATE') ? 'CLIENT_TO_SIGN' : 'TRIAD_TO_SIGN';
    }
    case 'DECLINED':
      return 'DECLINED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'CANCELLED':
      return r.returnedAt ? 'RETURNED' : 'CANCELLED';
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

/**
 * The İş müqaviləsi is retired: it can only be (re)sent while the case already has one (legacy data). A case with
 * none (state NOT_SENT) gets no new one — blockedReason in the staff overview and a 409 in the send / upload routes.
 */
export const WORK_RETIRED = 'WORK_CONTRACT_RETIRED';
export const workRetired = (step: Step, states: Record<Step, StepState>) => step === 'WORK' && states.WORK === 'NOT_SENT';

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

/** V2 Əmək müqaviləsi signers: the client first, Triad Vision second. */
export const clientFirstSigners = (client: PartyInput, triad: PartyInput) => [
  { role: 'CANDIDATE' as const, ...client, order: 1 },
  { role: 'STAFF' as const, ...triad, order: 2 },
];

// ─── V2 İş müqaviləsi: a set of documents ─────────────────────────────

export interface WorkDocLite extends RequestLite {
  contractFlow?: string | null;
  supersededAt?: Date | null;
}

/**
 * The documents that make up the İş müqaviləsi now: V2 requests that were sent and are not cancelled — plus the
 * ones staff sent back that were not replaced / dropped yet (they block the approval).
 */
export const activeWorkSet = <R extends WorkDocLite>(rows: R[]): R[] =>
  rows
    .filter((r) => r.contractFlow === FLOW_V2 && r.status !== 'DRAFT' && (r.status !== 'CANCELLED' || (!!r.returnedAt && !r.supersededAt)))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

/** One state for the whole set (staff overview, client overview). */
export const workSetState = (set: WorkDocLite[], now = new Date()): StepState => {
  if (!set.length) return 'NOT_SENT';
  const states = set.map((r) => stepState(r, now));
  if (states.every((s) => s === 'APPROVED')) return 'APPROVED';
  if (states.includes('CLIENT_TO_SIGN')) return 'CLIENT_TO_SIGN';
  if (states.includes('RETURNED')) return 'RETURNED';
  if (states.includes('DECLINED')) return 'DECLINED';
  if (states.includes('EXPIRED')) return 'EXPIRED';
  if (states.every((s) => s === 'SIGNED' || s === 'APPROVED')) return 'SIGNED';
  return 'CANCELLED';
};

/** Why staff cannot approve the set now (null = they can): every document signed by the client, nothing sent back. */
export const workApproveBlock = (set: WorkDocLite[], now = new Date()): string | null => {
  if (!set.length) return 'NOTHING_TO_APPROVE';
  const states = set.map((r) => stepState(r, now));
  if (states.every((s) => s === 'APPROVED')) return 'ALREADY_APPROVED';
  if (states.includes('RETURNED')) return 'DOCUMENT_RETURNED';
  if (!states.every((s) => s === 'SIGNED' || s === 'APPROVED')) return 'NOT_FULLY_SIGNED';
  return null;
};

/**
 * Whose turn the V2 İş müqaviləsi is (case in CONTRACT_SIGNED = Əmək müqaviləsi done):
 *   CLIENT  at least one document waits for the client's signature
 *   STAFF   nothing uploaded yet, a document was sent back / expired / declined, or everything is signed (review)
 *   null    approved
 */
export const workContractTurn = (set: WorkDocLite[], now = new Date()): ContractTurn | null => {
  const state = workSetState(set, now);
  if (state === 'APPROVED') return null;
  if (state === 'CLIENT_TO_SIGN') return 'CLIENT';
  return 'STAFF';
};

/** "Əmək müqaviləsi – TV-2026-0012 (imzalanmış).pdf" (drive file of the signed copy). */
export const signedFileName = (step: Step, caseNumber: string, docTitle?: string | null) =>
  `${DRIVE_FOLDER[step]}${docTitle ? ` – ${docTitle.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80)}` : ''} – ${caseNumber} (imzalanmış).pdf`;

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
