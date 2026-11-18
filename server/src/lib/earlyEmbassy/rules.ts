import type { CaseStatus } from '@prisma/client';

/**
 * Early embassy documents (owner decision 2026-11): while the client waits for the work contract they may already
 * upload the embassy documents. Pure rules (no database), shared by the upload checks (lib/clientUploadTarget.ts),
 * the process overview (lib/docProgress) and the creation of the EMBASSY requirement rows (./service.ts). The client
 * portal mirrors them in client/src/lib/docReplace.ts.
 *
 * "Waiting for the work contract" (the same state lib/docProgress/build.ts calls waitingForContract):
 *   - CONTRACT_SENT or CONTRACT_SIGNED, or
 *   - DOCUMENTS_REVIEW with every required INITIAL requirement accepted (at least one required requirement).
 * In that state the case gets its EMBASSY requirement rows (once) and the client may upload files for them; staff review
 * them as usual. Handing the embassy documents in ("submit") still opens only in EMBASSY_DOCUMENTS.
 */

export const EARLY_EMBASSY_STATUSES: CaseStatus[] = ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'];

type Req = { required: boolean; documents: readonly { status: string }[] };

/** Every required initial requirement has an accepted file (and there is at least one required requirement). */
export const initialDocsAccepted = (initial: readonly Req[]) => {
  const required = initial.filter((r) => r.required);
  return required.length > 0 && required.every((r) => r.documents.some((d) => d.status === 'ACCEPTED'));
};

/** The case waits for the work contract: embassy documents may be collected and uploaded early. */
export const earlyEmbassyOpen = (status: CaseStatus | string, initial: readonly Req[]) => {
  if (status === 'CONTRACT_SENT' || status === 'CONTRACT_SIGNED') return true;
  return status === 'DOCUMENTS_REVIEW' && initialDocsAccepted(initial);
};
