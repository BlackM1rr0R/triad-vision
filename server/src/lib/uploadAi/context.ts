import fs from 'node:fs/promises';
import type { DocStage } from '@prisma/client';
import { prisma } from '../../db.js';
import { docFilePath } from '../drive/cases.js';
import { storagePath } from '../drive/storage.js';

/**
 * What the recogniser looks at: the file (a case Document or a drive file inside a client folder) and the
 * case it belongs to — client name, requirements, the requirement the file was uploaded for. Only this one
 * case is ever loaded: nothing of other cases reaches the AI or the proposals.
 */

export interface CaseContext {
  id: string;
  number: string;
  clientId: string;
  assignedStaffId: string | null;
  driveFolderId: string | null;
  client: { firstName: string; lastName: string; locale: string };
  requirements: { id: string; key: string | null; stage: DocStage; title: unknown; docs: { status: string }[] }[];
}

export type Subject =
  | {
      kind: 'document';
      id: string;
      name: string;
      mimeType: string;
      path: string;
      stage: DocStage;
      requirementId: string | null;
      status: string;
      uploadedById: string;
      expiresAt: Date | null;
      ocr: unknown;
      ocrAt: Date | null;
      checks: unknown;
    }
  | {
      kind: 'drive';
      id: string;
      name: string;
      mimeType: string;
      path: string;
      parentId: string | null;
      documentId: string | null;
      uploadedById: string | null;
      textContent: string | null;
    };

export const loadCaseContext = async (caseId: string | null | undefined): Promise<CaseContext | null> => {
  if (!caseId) return null;
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      number: true,
      clientId: true,
      assignedStaffId: true,
      driveFolderId: true,
      client: { select: { firstName: true, lastName: true, locale: true } },
      requirements: {
        orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, key: true, stage: true, title: true, documents: { select: { status: true } } },
      },
    },
  });
  if (!c) return null;
  return { ...c, requirements: c.requirements.map((r) => ({ id: r.id, key: r.key, stage: r.stage, title: r.title, docs: r.documents })) };
};

export const loadDocumentSubject = async (documentId: string): Promise<{ subject: Subject; caseId: string } | null> => {
  const d = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, caseId: true, originalName: true, storedName: true, mimeType: true, stage: true, requirementId: true, status: true, uploadedById: true, expiresAt: true, ocr: true, ocrAt: true, checks: true },
  });
  if (!d) return null;
  return {
    caseId: d.caseId,
    subject: {
      kind: 'document',
      id: d.id,
      name: d.originalName,
      mimeType: d.mimeType,
      path: docFilePath(d.storedName),
      stage: d.stage,
      requirementId: d.requirementId,
      status: d.status,
      uploadedById: d.uploadedById,
      expiresAt: d.expiresAt,
      ocr: d.ocr,
      ocrAt: d.ocrAt,
      checks: d.checks,
    },
  };
};

/** The case whose client folder contains `folderId` (the folder itself or any ancestor), or null. */
export const caseOfFolder = async (folderId: string | null | undefined): Promise<{ caseId: string; clientFolderId: string } | null> => {
  let id = folderId ?? null;
  for (let depth = 0; id && depth < 12; depth++) {
    const c = await prisma.case.findUnique({ where: { driveFolderId: id }, select: { id: true } });
    if (c) return { caseId: c.id, clientFolderId: id };
    const n = await prisma.driveNode.findUnique({ where: { id }, select: { parentId: true, deletedAt: true } });
    if (!n || n.deletedAt) return null;
    id = n.parentId;
  }
  return null;
};

export const loadDriveSubject = async (nodeId: string): Promise<{ subject: Subject; caseId: string | null; clientFolderId: string | null } | null> => {
  const n = await prisma.driveNode.findUnique({
    where: { id: nodeId },
    select: { id: true, kind: true, name: true, mimeType: true, storageKey: true, parentId: true, documentId: true, createdById: true, textContent: true, deletedAt: true },
  });
  if (!n || n.kind !== 'FILE' || !n.storageKey || n.deletedAt) return null;
  const owner = await caseOfFolder(n.parentId);
  return {
    caseId: owner?.caseId ?? null,
    clientFolderId: owner?.clientFolderId ?? null,
    subject: {
      kind: 'drive',
      id: n.id,
      name: n.name,
      mimeType: n.mimeType ?? 'application/octet-stream',
      path: storagePath(n.storageKey),
      parentId: n.parentId,
      documentId: n.documentId,
      uploadedById: n.createdById,
      textContent: n.textContent,
    },
  };
};

export const readSubject = (s: Subject) => fs.readFile(s.path);
