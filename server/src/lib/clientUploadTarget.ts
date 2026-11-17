import type { CaseStatus, DocStage, DocStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { CLIENT_UPLOAD_STAGE, FINAL_STATUSES } from './caseFlow.js';
import { notifyStaff } from './notifications.js';

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
}

export const clientUploadStageFor = (status: CaseStatus, req: { stage: DocStage; documents: { status: DocStatus }[] }): UploadTarget | null => {
  const open = CLIENT_UPLOAD_STAGE[status];
  if (open && req.stage === open) return { stage: open, replacement: false };
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
 * Loads the requirement and applies clientUploadStageFor. null = not allowed (unknown requirement, other case,
 * wrong stage, nothing to replace); the caller keeps its error codes (409 UPLOAD_NOT_ALLOWED outside an upload
 * step, 400 INVALID_REQUIREMENT inside one).
 */
export const resolveClientUploadTarget = async (c: { id: string; status: CaseStatus }, requirementId: unknown) => {
  if (typeof requirementId !== 'string' || !requirementId) return null;
  const requirement = await prisma.documentRequirement.findUnique({ where: { id: requirementId }, include: { documents: { select: { status: true } } } });
  if (!requirement || requirement.caseId !== c.id) return null;
  const target = clientUploadStageFor(c.status, requirement);
  return target ? { ...target, requirement } : null;
};
