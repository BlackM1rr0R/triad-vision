import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DocumentInsight, Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { audit } from '../audit.js';
import { notifyClient } from '../notifications.js';
import { checkName, findSibling, freeNameIn } from '../drive/names.js';
import { storagePath } from '../drive/storage.js';
import { logDriveActivity } from '../driveCollab/activity.js';
import { assertNotLockedByOther } from '../driveCollab/lock.js';
import { setDocumentExpiry } from '../expiry/index.js';
import { badRequest, conflict, notFound } from '../http.js';
import type { QualityReason } from './quality.js';
import { reuploadNote } from './texts.js';
import { ACTIONS, isDocType, type DocType, type InsightAction, type Proposals } from './types.js';

/**
 * Applying proposals — the only place smart uploads change anything, always on a staff click ("Accept",
 * "Accept all") or by the super admin's auto-apply setting. Every application is audited
 * (UPLOAD_AI_ACCEPTED / UPLOAD_AI_AUTO_APPLIED) with what changed from what to what.
 */

export interface Actor {
  /** Staff member who clicked; null for auto-apply (system). */
  id: string | null;
  ip?: string;
}

export type AppliedChange = { action: InsightAction; from: unknown; to: unknown };

export const proposalsOf = (insight: Pick<DocumentInsight, 'proposals'>): Proposals => {
  const p = (insight.proposals ?? {}) as Partial<Proposals>;
  return { actions: (Array.isArray(p.actions) ? p.actions : []).filter((a): a is InsightAction => (ACTIONS as readonly string[]).includes(a)), currentName: p.currentName ?? '', folder: p.folder, requirement: p.requirement, expected: p.expected };
};

const actionOrder: InsightAction[] = ['link', 'expiry', 'rename', 'move'];

const randomStored = (name: string) => `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8)}`;

/** Creates the case document of a drive file (attach to a requirement) and links the file to it. */
const linkDriveFile = async (insight: DocumentInsight, requirementId: string, actor: Actor) => {
  const node = await prisma.driveNode.findUnique({ where: { id: insight.driveNodeId! }, select: { id: true, name: true, storageKey: true, mimeType: true, size: true, documentId: true, createdById: true, deletedAt: true } });
  if (!node || node.deletedAt || !node.storageKey) throw notFound('NODE_NOT_FOUND');
  if (node.documentId) return { documentId: node.documentId, created: false };
  const req = await prisma.documentRequirement.findUnique({ where: { id: requirementId }, select: { id: true, caseId: true, stage: true } });
  if (!req || req.caseId !== insight.caseId) throw badRequest('INVALID_REQUIREMENT');
  const storedName = randomStored(node.name);
  await fs.copyFile(storagePath(node.storageKey), path.join(config.uploads.privateDir, storedName));
  const uploader = actor.id ?? node.createdById ?? insight.uploadedById;
  if (!uploader) throw badRequest('NO_UPLOADER');
  try {
    const doc = await prisma.document.create({
      data: { caseId: req.caseId, requirementId: req.id, stage: req.stage, originalName: node.name.slice(0, 200), storedName, mimeType: node.mimeType ?? 'application/octet-stream', size: node.size ?? 0, status: 'ACCEPTED', uploadedById: uploader },
    });
    await prisma.driveNode.update({ where: { id: node.id }, data: { documentId: doc.id } });
    await prisma.caseEvent.create({ data: { caseId: req.caseId, type: 'STAFF_DOCUMENT_UPLOADED', note: doc.originalName, actorId: uploader, visibleToClient: false } });
    return { documentId: doc.id, created: true };
  } catch (err) {
    await fs.unlink(path.join(config.uploads.privateDir, storedName)).catch(() => undefined);
    throw err;
  }
};

/** Renames a drive node to `wanted` (made unique among its siblings). */
const renameNode = async (nodeId: string, wanted: string, actor: Actor) => {
  const node = await prisma.driveNode.findUnique({ where: { id: nodeId }, select: { id: true, name: true, parentId: true } });
  if (!node || !node.parentId) return null;
  if (actor.id) await assertNotLockedByOther(node.id, actor.id);
  const clash = await findSibling(node.parentId, wanted, node.id);
  const name = clash ? await freeNameIn(node.parentId, checkName(wanted, 'FILE'), true) : checkName(wanted, 'FILE');
  if (name === node.name) return null;
  await prisma.driveNode.update({ where: { id: node.id }, data: { name } });
  await logDriveActivity({ nodeId: node.id, folderId: node.parentId, actorId: actor.id, action: 'RENAME', name, meta: { from: node.name, to: name, kind: 'FILE', by: 'upload-ai' } });
  return { from: node.name, to: name };
};

/** The live stage folder of the proposal (created inside the client folder when missing). */
const ensureStageFolder = async (folder: NonNullable<Proposals['folder']>, actor: Actor) => {
  if (folder.id) {
    const n = await prisma.driveNode.findUnique({ where: { id: folder.id }, select: { id: true, kind: true, deletedAt: true } });
    if (n && n.kind === 'FOLDER' && !n.deletedAt) return n.id;
  }
  const parent = await prisma.driveNode.findUnique({ where: { id: folder.parentId }, select: { id: true, space: true, ownerId: true, deletedAt: true } });
  if (!parent || parent.deletedAt) throw notFound('NODE_NOT_FOUND');
  const hit = await findSibling(parent.id, folder.name);
  if (hit?.kind === 'FOLDER') return hit.id;
  const created = await prisma.driveNode.create({ data: { space: parent.space, ownerId: parent.ownerId, kind: 'FOLDER', name: folder.name, parentId: parent.id, createdById: actor.id }, select: { id: true } });
  return created.id;
};

/**
 * Applies the given actions of an insight (default: all open ones) and records them. Returns the changes.
 * Actions that are not open any more are skipped; a failing action stops the rest (HttpError to the caller).
 */
export const applyInsight = async (insightId: string, actor: Actor, opts: { actions?: InsightAction[]; auto?: boolean } = {}) => {
  const insight = await prisma.documentInsight.findUnique({ where: { id: insightId } });
  if (!insight) throw notFound('INSIGHT_NOT_FOUND');
  if (insight.status !== 'PROPOSED') throw conflict('INSIGHT_NOT_OPEN');
  const p = proposalsOf(insight);
  const wanted = (opts.actions ?? p.actions).filter((a) => p.actions.includes(a));
  const changes: AppliedChange[] = [];
  // A drive file may already be the copy of a case document (its expiry / name live there).
  let documentId = insight.documentId;
  if (!documentId && insight.driveNodeId) {
    documentId = (await prisma.driveNode.findUnique({ where: { id: insight.driveNodeId }, select: { documentId: true } }))?.documentId ?? null;
  }
  let linkedId: string | null = null;

  for (const action of actionOrder.filter((a) => wanted.includes(a))) {
    if (action === 'link' && insight.proposedRequirementId) {
      if (insight.driveNodeId && !documentId) {
        const linked = await linkDriveFile(insight, insight.proposedRequirementId, actor);
        documentId = linked.documentId;
        if (linked.created) linkedId = linked.documentId;
        changes.push({ action, from: null, to: { requirementId: insight.proposedRequirementId, documentId } });
      } else if (documentId && !insight.driveNodeId) {
        const req = await prisma.documentRequirement.findUnique({ where: { id: insight.proposedRequirementId }, select: { id: true, caseId: true, stage: true } });
        const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { requirementId: true, caseId: true, stage: true } });
        if (!req || !doc || req.caseId !== doc.caseId) throw badRequest('INVALID_REQUIREMENT');
        await prisma.document.update({ where: { id: documentId }, data: { requirementId: req.id, stage: req.stage } });
        changes.push({ action, from: { requirementId: doc.requirementId, stage: doc.stage }, to: { requirementId: req.id, stage: req.stage } });
      }
    }
    if (action === 'expiry' && insight.expiryDate && documentId) {
      const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { expiresAt: true } });
      if (doc) {
        await setDocumentExpiry(documentId, insight.expiryDate);
        changes.push({ action, from: doc.expiresAt?.toISOString().slice(0, 10) ?? null, to: insight.expiryDate.toISOString().slice(0, 10) });
      }
    }
    if (action === 'rename' && insight.proposedName) {
      if (insight.driveNodeId) {
        const r = await renameNode(insight.driveNodeId, insight.proposedName, actor);
        if (r) changes.push({ action, ...r });
        if (documentId) await prisma.document.update({ where: { id: documentId }, data: { originalName: (r?.to ?? insight.proposedName).slice(0, 200) } }).catch(() => undefined);
      } else if (documentId) {
        const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { originalName: true } });
        if (doc) {
          await prisma.document.update({ where: { id: documentId }, data: { originalName: insight.proposedName.slice(0, 200) } });
          changes.push({ action, from: doc.originalName, to: insight.proposedName });
          // The drive copy of an accepted document follows the new name.
          const copy = await prisma.driveNode.findUnique({ where: { documentId }, select: { id: true, deletedAt: true } });
          if (copy && !copy.deletedAt) await renameNode(copy.id, insight.proposedName, { id: null }).catch(() => undefined);
        }
      }
    }
    if (action === 'move' && insight.driveNodeId && p.folder) {
      const node = await prisma.driveNode.findUnique({ where: { id: insight.driveNodeId }, select: { id: true, name: true, parentId: true } });
      if (node) {
        if (actor.id) await assertNotLockedByOther(node.id, actor.id);
        const target = await ensureStageFolder(p.folder, actor);
        if (target !== node.parentId) {
          const name = await freeNameIn(target, node.name, true);
          await prisma.driveNode.update({ where: { id: node.id }, data: { parentId: target, name } });
          await logDriveActivity({ nodeId: node.id, folderId: target, actorId: actor.id, action: 'MOVE', name, meta: { fromId: node.parentId, toId: target, toName: p.folder.name, kind: 'FILE', by: 'upload-ai' } });
          changes.push({ action, from: node.parentId, to: target });
        }
      }
    }
  }

  const remaining = p.actions.filter((a) => !wanted.includes(a));
  const prevApplied = Array.isArray(insight.applied) ? (insight.applied as unknown as AppliedChange[]) : [];
  const status = remaining.length ? 'PROPOSED' : opts.auto ? 'AUTO_APPLIED' : 'ACCEPTED';
  const updated = await prisma.documentInsight.update({
    where: { id: insight.id },
    data: {
      status,
      ...(linkedId ? { documentId: linkedId } : {}),
      applied: [...prevApplied, ...changes] as unknown as Prisma.InputJsonValue,
      proposals: { ...p, actions: remaining } as unknown as Prisma.InputJsonValue,
      decidedById: actor.id,
      decidedAt: new Date(),
    },
  });
  await audit({ user: actor.id ? ({ id: actor.id } as Express.Request['user']) : undefined, ip: actor.ip }, opts.auto ? 'UPLOAD_AI_AUTO_APPLIED' : 'UPLOAD_AI_ACCEPTED', `insight:${insight.id}`, {
    documentId,
    driveNodeId: insight.driveNodeId,
    caseId: insight.caseId,
    docType: insight.docType,
    confidence: insight.confidence,
    changes,
  } as unknown as Prisma.InputJsonValue);
  return { insight: updated, changes };
};

export const rejectInsight = async (insightId: string, actor: Actor) => {
  const insight = await prisma.documentInsight.findUnique({ where: { id: insightId } });
  if (!insight) throw notFound('INSIGHT_NOT_FOUND');
  if (insight.status !== 'PROPOSED') throw conflict('INSIGHT_NOT_OPEN');
  const p = proposalsOf(insight);
  const updated = await prisma.documentInsight.update({ where: { id: insight.id }, data: { status: 'REJECTED', proposals: { ...p, actions: [] } as unknown as Prisma.InputJsonValue, decidedById: actor.id, decidedAt: new Date() } });
  await audit({ user: actor.id ? ({ id: actor.id } as Express.Request['user']) : undefined, ip: actor.ip }, 'UPLOAD_AI_REJECTED', `insight:${insight.id}`, { documentId: insight.documentId, driveNodeId: insight.driveNodeId, docType: insight.docType, rejected: p.actions });
  return updated;
};

/**
 * "Ask client to re-upload": rejects the case document with a note in the client's language built from the
 * quality problems (and the wrong type), through the same steps as the staff review (status, case event,
 * DOCUMENT_REJECTED notification).
 */
export const requestReupload = async (documentId: string, actor: { id: string; ip?: string }) => {
  const doc = await prisma.document.findUnique({ where: { id: documentId }, include: { requirement: true, case: { select: { id: true, clientId: true, client: { select: { locale: true } } } } } });
  if (!doc) throw notFound('DOCUMENT_NOT_FOUND');
  if (doc.status === 'REJECTED') throw conflict('ALREADY_REJECTED');
  const insight = await prisma.documentInsight.findUnique({ where: { documentId } });
  const quality = (insight?.quality ?? null) as { reasons?: QualityReason[] } | null;
  const reasons = Array.isArray(quality?.reasons) ? quality!.reasons : [];
  const flags = Array.isArray(insight?.flags) ? (insight!.flags as string[]) : [];
  const expected = (insight?.proposals as Proposals | null)?.expected?.docType ?? null;
  const found = flags.includes('WRONG_REQUIREMENT') && insight && isDocType(insight.docType) ? (insight.docType as DocType) : null;
  const locale = doc.case.client.locale as Locale;
  const note = reuploadNote(locale, { reasons, found, expected: isDocType(expected) ? expected : null });

  await prisma.document.update({ where: { id: doc.id }, data: { status: 'REJECTED', reviewNote: note } });
  await prisma.caseEvent.create({ data: { caseId: doc.caseId, type: 'DOCUMENT_REJECTED', note: `${doc.originalName}: ${note}`, actorId: actor.id } });
  const title = (doc.requirement?.title as Record<string, string> | null)?.[locale] ?? doc.originalName;
  await notifyClient(doc.caseId, 'DOCUMENT_REJECTED', { doc: title, note });
  if (insight?.status === 'PROPOSED') await prisma.documentInsight.update({ where: { id: insight.id }, data: { status: 'REJECTED', decidedById: actor.id, decidedAt: new Date() } });
  await audit({ user: { id: actor.id } as Express.Request['user'], ip: actor.ip }, 'UPLOAD_AI_REUPLOAD_REQUESTED', doc.id, { caseId: doc.caseId, reasons: reasons.map((r) => r.code), wrongType: found });
  return { note };
};
