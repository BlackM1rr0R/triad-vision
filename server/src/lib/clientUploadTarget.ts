import type { CaseStatus, DocStage, DocStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { CLIENT_UPLOAD_STAGE, FINAL_STATUSES } from './caseFlow.js';
import { notifyStaff } from './notifications.js';
import { EARLY_EMBASSY_STATUSES } from './earlyEmbassy/rules.js'; // embassy documents while waiting for the contract
import { earlyEmbassyOpenFor } from './earlyEmbassy/service.js';

/**
 * Where a client upload for one requirement may go.
 *
 * Normal rule: only the open upload step of the case (CLIENT_UPLOAD_STAGE: DOCUMENTS_PENDING → INITIAL,
 * EMBASSY_DOCUMENTS → EMBASSY). Replacement rule: when the team rejected the requirement's document
 * ("not accepted, upload again") the client may upload a new one for that requirement while the case is still
 * open — also after the documents were handed in (DOCUMENTS_REVIEW, EMBASSY_REVIEW, later steps), where staff
 * usually review and reject without sending the whole case back. The rejected file stays (history); the new one
 * is PENDING, so the requirement is back in review.
 *
 * Early rule (lib/earlyEmbassy): while the case waits for the work contract (CONTRACT_SENT, CONTRACT_SIGNED, or
 * DOCUMENTS_REVIEW with every required initial document accepted) the client may already upload EMBASSY documents
 * (ctx.earlyEmbassy, computed by the caller); staff review them as usual and the hand-in ("submit") still opens only
 * in EMBASSY_DOCUMENTS.
 *
 * Pure part shared by POST /api/cases/:id/documents, the scan endpoint and "use from my vault"; the client
 * portal mirrors it (client/src/lib/docReplace.ts).
 */

const UPLOADABLE: DocStage[] = ['INITIAL', 'EMBASSY'];

/** The requirement's documents were all rejected (at least one): it waits for a replacement. */
export const awaitsReplacement = (docs: { status: DocStatus }[]) => docs.length > 0 && docs.every((d) => d.status === 'REJECTED');

export interface UploadTarget {
  stage: DocStage;
  /** true = replacing a rejected document outside the open upload step (staff are told; no "submit" follows). */
  replacement: boolean;
  /** true = an embassy document uploaded early, while the case waits for the work contract (lib/earlyEmbassy). */
  early?: boolean;
}

export const clientUploadStageFor = (
  status: CaseStatus,
  req: { stage: DocStage; documents: { status: DocStatus }[] },
  ctx: { earlyEmbassy?: boolean } = {},
): UploadTarget | null => {
  const open = CLIENT_UPLOAD_STAGE[status];
  if (open && req.stage === open) return { stage: open, replacement: false };
  if (req.stage === 'EMBASSY' && ctx.earlyEmbassy && EARLY_EMBASSY_STATUSES.includes(status)) return { stage: 'EMBASSY', replacement: false, early: true };
  if (FINAL_STATUSES.includes(status) || !UPLOADABLE.includes(req.stage)) return null;
  return awaitsReplacement(req.documents) ? { stage: req.stage, replacement: true } : null;
};

/**
 * A replacement outside the open upload step: no "submit" follows, so the case's staff (assignee + admins) are told
 * right away that a new file waits for review (in-app, push, admin mail — notifyStaff).
 */
export const notifyReplacement = async (
  c: { id: string; number: string },
  requirement: { title: unknown },
  fileName: string,
) => {
  const title = (requirement.title as Record<string, string> | null)?.az ?? fileName;
  await notifyStaff(`${c.number}: rədd edilmiş sənəd yenidən yükləndi`, `Müştəri «${title}» üçün yeni fayl yüklədi (${fileName}). Yoxlayın.`, {
    caseId: c.id,
    link: `/admin/cases/${c.id}`,
    type: 'DOCUMENT_REPLACED',
  });
};

/**
 * An embassy document uploaded early (the case still waits for the work contract): no "submit" follows yet, so the
 * case's staff are told that a file waits for review.
 */
export const notifyEarlyEmbassyUpload = async (c: { id: string; number: string }, requirement: { title: unknown }, fileName: string) => {
  const title = (requirement.title as Record<string, string> | null)?.az ?? fileName;
  await notifyStaff(`${c.number}: səfirlik sənədi erkən yükləndi`, `Müştəri müqaviləni gözləyərkən «${title}» üçün fayl yüklədi (${fileName}). Yoxlayın.`, {
    caseId: c.id,
    link: `/admin/cases/${c.id}`,
    type: 'DOCUMENT_EARLY_EMBASSY',
  });
};

/**
 * Loads the requirement and applies clientUploadStageFor. null = not allowed (unknown requirement, other case,
 * wrong stage, nothing to replace); the caller keeps its error codes (409 UPLOAD_NOT_ALLOWED outside an upload
 * step, 400 INVALID_REQUIREMENT inside one).
 */
export const resolveClientUploadTarget = async (c: { id: string; status: CaseStatus }, requirementId: unknown) => {
  if (typeof requirementId !== 'string' || !requirementId) return null;
  const requirement = await prisma.documentRequirement.findUnique({ where: { id: requirementId }, include: { documents: { select: { status: true } } } });
  if (!requirement || requirement.caseId !== c.id) return null;
  const target = clientUploadStageFor(c.status, requirement, { earlyEmbassy: requirement.stage === 'EMBASSY' && (await earlyEmbassyOpenFor(c)) });
  return target ? { ...target, requirement } : null;
};

/**
 * After a client upload that no hand-in ("submit") follows — a replacement for a rejected document, or an embassy
 * document uploaded early — the case's staff are told. Shared by every client upload path (case upload, scan, vault).
 */
export const notifyClientUpload = async (
  c: { id: string; number: string },
  target: Pick<UploadTarget, 'replacement' | 'early'>,
  requirement: { title: unknown },
  fileName: string,
) => {
  if (target.replacement) await notifyReplacement(c, requirement, fileName);
  else if (target.early) await notifyEarlyEmbassyUpload(c, requirement, fileName);
};

/**
 * Pure: the requirements a client may upload to right now, with their target (clientUploadStageFor): the open step, an
 * early embassy document, or a replacement for a rejected one. `earlyEmbassy` = lib/earlyEmbassy says the case waits
 * for the work contract. Drives "use from my vault" suggestions, so they match what POST /vault/:id/use accepts.
 */
export const uploadableRequirements = <R extends { stage: DocStage; documents: { status: DocStatus }[] }>(
  status: CaseStatus,
  requirements: R[],
  earlyEmbassy: boolean,
): { requirement: R; target: UploadTarget }[] =>
  requirements.flatMap((requirement) => {
    const target = clientUploadStageFor(status, requirement, { earlyEmbassy: requirement.stage === 'EMBASSY' && earlyEmbassy });
    return target ? [{ requirement, target }] : [];
  });
