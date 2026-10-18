import type { Request } from 'express';
import { prisma } from '../db.js';
import { notFound } from './http.js';
import { audit } from './audit.js';
import { removeStoredFile } from '../jobs/retention.js';
import { removeDocumentCopy } from './drive/caseFolders.js';

/**
 * Permanently deletes one case document (row + file). Only super admins call this (routes check the
 * role): the case keeps an internal event so it is visible later who removed which file and when.
 * The document's copy in the shared drive (if any) is removed for good as well.
 */
export const deleteCaseDocument = async (req: Request, docId: string) => {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { id: true, caseId: true, originalName: true, storedName: true, stage: true, status: true, case: { select: { number: true } } },
  });
  if (!doc) throw notFound('DOCUMENT_NOT_FOUND');
  await prisma.$transaction([
    prisma.document.delete({ where: { id: doc.id } }),
    prisma.caseEvent.create({
      data: { caseId: doc.caseId, type: 'CASE_UPDATED', note: `Sənəd silindi: ${doc.originalName} (${doc.stage})`, actorId: req.user!.id, visibleToClient: false },
    }),
  ]);
  await removeStoredFile(doc.storedName).catch(() => 0);
  await removeDocumentCopy(doc.id).catch((err) => console.error('[drive] copy of a deleted case document could not be removed', err));
  await audit(req, 'CASE_DOCUMENT_DELETED', `case:${doc.caseId}`, { documentId: doc.id, name: doc.originalName, stage: doc.stage, status: doc.status, case: doc.case.number });
  return { name: doc.originalName, caseId: doc.caseId };
};
