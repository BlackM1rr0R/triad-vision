/**
 * May the client upload a file for this requirement now? Mirrors the server rule (server/src/lib/clientUploadTarget.ts):
 *   - the open upload step of the case (DOCUMENTS_PENDING → INITIAL, EMBASSY_DOCUMENTS → EMBASSY), or
 *   - a replacement: every file of the requirement was rejected by the team ("not accepted, upload again") and the
 *     case is not closed — also after the documents were handed in (DOCUMENTS_REVIEW, EMBASSY_REVIEW, later steps).
 *   - early embassy documents: while the case waits for the work contract (CONTRACT_SENT, CONTRACT_SIGNED, or
 *     DOCUMENTS_REVIEW with every required initial document accepted) EMBASSY documents can already be uploaded
 *     (server lib/earlyEmbassy); the hand-in still opens in EMBASSY_DOCUMENTS.
 * The rejected file stays in the list (history, with the reason) until and after the new one arrives.
 * Pure, no imports: unit-tested in docReplace.test.ts.
 */

export type UploadDocStage = 'INITIAL' | 'EMBASSY';

const OPEN_STAGE: Record<string, UploadDocStage | undefined> = { DOCUMENTS_PENDING: 'INITIAL', EMBASSY_DOCUMENTS: 'EMBASSY' };
const CLOSED = ['APPROVED', 'REJECTED', 'CANCELLED'];

/** Every file of the requirement was rejected (and there is at least one): it waits for a new upload. */
export const awaitsReplacement = (docs: readonly { status: string }[]) => docs.length > 0 && docs.every((d) => d.status === 'REJECTED');

type Req = { stage: string; required?: boolean; documents: readonly { status: string }[] };

/** The case waits for the work contract: embassy documents may be uploaded early (mirror of server lib/earlyEmbassy/rules.ts). */
export const embassyUploadsEarly = (caseStatus: string, requirements: readonly Req[]) => {
  if (caseStatus === 'CONTRACT_SENT' || caseStatus === 'CONTRACT_SIGNED') return true;
  if (caseStatus !== 'DOCUMENTS_REVIEW') return false;
  const required = requirements.filter((r) => r.stage === 'INITIAL' && r.required);
  return required.length > 0 && required.every((r) => r.documents.some((d) => d.status === 'ACCEPTED'));
};

export const clientUploadMode = (caseStatus: string, req: Req, ctx: { earlyEmbassy?: boolean } = {}): 'open' | 'early' | 'replace' | null => {
  if (OPEN_STAGE[caseStatus] === req.stage) return 'open';
  if (req.stage === 'EMBASSY' && ctx.earlyEmbassy && ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'].includes(caseStatus)) return 'early';
  if (CLOSED.includes(caseStatus) || (req.stage !== 'INITIAL' && req.stage !== 'EMBASSY')) return null;
  return awaitsReplacement(req.documents) ? 'replace' : null;
};

/** Approved, refused or cancelled: nothing can be uploaded any more. */
export const isClosedCase = (caseStatus: string) => CLOSED.includes(caseStatus);
