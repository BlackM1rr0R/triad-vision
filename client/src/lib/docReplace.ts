/**
 * May the client upload a file for this requirement now? Mirrors the server rule (server/src/lib/clientUploadTarget.ts):
 *   - the open upload step of the case (DOCUMENTS_PENDING → INITIAL, EMBASSY_DOCUMENTS → EMBASSY), or
 *   - a replacement: every file of the requirement was rejected by the team ("not accepted, upload again") and the
 *     case is not closed — also after the documents were handed in (DOCUMENTS_REVIEW, EMBASSY_REVIEW, later steps).
 * The rejected file stays in the list (history, with the reason) until and after the new one arrives.
 * Pure, no imports: unit-tested in docReplace.test.ts.
 */

export type UploadDocStage = 'INITIAL' | 'EMBASSY';

const OPEN_STAGE: Record<string, UploadDocStage | undefined> = { DOCUMENTS_PENDING: 'INITIAL', EMBASSY_DOCUMENTS: 'EMBASSY' };
const CLOSED = ['APPROVED', 'REJECTED', 'CANCELLED'];

/** Every file of the requirement was rejected (and there is at least one): it waits for a new upload. */
export const awaitsReplacement = (docs: readonly { status: string }[]) => docs.length > 0 && docs.every((d) => d.status === 'REJECTED');

export const clientUploadMode = (caseStatus: string, req: { stage: string; documents: readonly { status: string }[] }): 'open' | 'replace' | null => {
  if (OPEN_STAGE[caseStatus] === req.stage) return 'open';
  if (CLOSED.includes(caseStatus) || (req.stage !== 'INITIAL' && req.stage !== 'EMBASSY')) return null;
  return awaitsReplacement(req.documents) ? 'replace' : null;
};

/** Approved, refused or cancelled: nothing can be uploaded any more. */
export const isClosedCase = (caseStatus: string) => CLOSED.includes(caseStatus);
