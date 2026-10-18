import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { nodeLiteSelect } from '../drive/access.js';
import { createFileIn } from '../drive/files.js';

/**
 * Link between signature requests started from the drive and their drive file (no schema change: two
 * Setting rows per request):
 *   driveEsign:req:<requestId>  → { nodeId, parentId, name, userId, signedNodeId? }
 *   driveEsign:node:<nodeId>    → { requestIds: [...] } (newest last)
 * When the request completes, the e-sign service calls saveSignedCopyToDrive (one line in its completion
 * step) and the signed PDF lands next to the original as "<name> (imzalanmış).pdf".
 *
 * This module must not import the e-sign service (the service imports it).
 */

export interface DriveEsignLink {
  nodeId: string;
  parentId: string | null;
  name: string;
  userId: string;
  signedNodeId?: string | null;
}

const reqKey = (requestId: string) => `driveEsign:req:${requestId}`;
const nodeKey = (nodeId: string) => `driveEsign:node:${nodeId}`;

export const rememberDriveEsign = async (requestId: string, link: DriveEsignLink) => {
  await prisma.setting.upsert({
    where: { key: reqKey(requestId) },
    create: { key: reqKey(requestId), value: link as unknown as Prisma.InputJsonValue },
    update: { value: link as unknown as Prisma.InputJsonValue },
  });
  const row = await prisma.setting.findUnique({ where: { key: nodeKey(link.nodeId) } });
  const ids = ((row?.value as { requestIds?: string[] } | null)?.requestIds ?? []).filter((x) => x !== requestId).slice(-19);
  await prisma.setting.upsert({
    where: { key: nodeKey(link.nodeId) },
    create: { key: nodeKey(link.nodeId), value: { requestIds: [...ids, requestId] } },
    update: { value: { requestIds: [...ids, requestId] } },
  });
};

export const driveEsignLink = async (requestId: string) => {
  const row = await prisma.setting.findUnique({ where: { key: reqKey(requestId) } });
  return (row?.value as DriveEsignLink | undefined) ?? null;
};

/** Request ids started from each of the given nodes (newest last). */
export const requestIdsOfNodes = async (nodeIds: string[]) => {
  const rows = await prisma.setting.findMany({ where: { key: { in: nodeIds.map(nodeKey) } } });
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.key.slice(nodeKey('').length), (r.value as { requestIds?: string[] } | null)?.requestIds ?? []);
  return out;
};

/** "Vertrag.pdf" → "Vertrag (imzalanmış).pdf". */
export const signedName = (name: string) => {
  const base = name.replace(/\.pdf$/i, '') || name;
  return `${base} (imzalanmış).pdf`;
};

/**
 * Completion hook: stores the signed PDF next to the drive original (or in its last known folder when the
 * original was deleted). No-op for requests not started from the drive; idempotent. Returns the new node id.
 */
export const saveSignedCopyToDrive = async (requestId: string, pdf: Buffer): Promise<string | null> => {
  const link = await driveEsignLink(requestId);
  if (!link || link.signedNodeId) return link?.signedNodeId ?? null;
  const original = await prisma.driveNode.findUnique({ where: { id: link.nodeId }, select: { parentId: true, name: true, deletedAt: true } });
  const parentId = original && !original.deletedAt ? original.parentId : link.parentId;
  if (!parentId) return null;
  const parent = await prisma.driveNode.findUnique({ where: { id: parentId }, select: nodeLiteSelect });
  if (!parent || parent.deletedAt || parent.kind !== 'FOLDER') return null;
  const created = await createFileIn(parent, signedName(original?.name ?? link.name), pdf, 'application/pdf', link.userId);
  await prisma.setting.update({ where: { key: reqKey(requestId) }, data: { value: { ...link, signedNodeId: created.id } as unknown as Prisma.InputJsonValue } });
  await prisma.auditLog
    .create({ data: { actorId: null, action: 'DRIVE_SIGNED_COPY_SAVED', target: `drive:${created.id}`, details: { requestId, originalId: link.nodeId, name: created.name } } })
    .catch(() => undefined);
  return created.id;
};
