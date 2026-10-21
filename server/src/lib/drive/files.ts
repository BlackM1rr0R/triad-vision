import fsp from 'node:fs/promises';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';
import type { NodeLite } from './access.js';
import { checkName, freeNameIn } from './names.js';
import { newStorageKey, removeStored, storagePath } from './storage.js';
import { hashBuffer } from './org/hash.js';

/**
 * Server-generated drive files (documents made in the drive, conversions): writing bytes into the store,
 * creating the file node and saving a new version — the same way uploads and version restores do it.
 */

/** Writes bytes into the drive store under a fresh key. */
export const storeBuffer = async (buf: Buffer) => {
  const key = newStorageKey();
  await fsp.writeFile(storagePath(key), buf, { flag: 'wx' });
  return key;
};

/** Reads the current bytes of a file node (404 when the file is gone from disk). */
export const readNodeBuffer = async (nodeId: string, maxBytes?: number) => {
  const row = await prisma.driveNode.findUniqueOrThrow({
    where: { id: nodeId },
    select: { id: true, name: true, version: true, storageKey: true, mimeType: true, size: true, parentId: true },
  });
  if (!row.storageKey) throw new HttpError(404, 'FILE_MISSING_ON_DISK');
  if (maxBytes && (row.size ?? 0) > maxBytes) throw new HttpError(413, 'FILE_TOO_LARGE');
  try {
    return { row, buf: await fsp.readFile(storagePath(row.storageKey)) };
  } catch {
    throw new HttpError(404, 'FILE_MISSING_ON_DISK');
  }
};

/**
 * Creates a new file in `parent` (name checked and made unique, "name (2).pdf"); the file inherits the
 * folder's permissions. Returns the new node id and the final name.
 */
export const createFileIn = async (parent: NodeLite, wantedName: string, buf: Buffer, mimeType: string, userId: string) => {
  const name = await freeNameIn(parent.id, checkName(wantedName, 'FILE'), true);
  const key = await storeBuffer(buf);
  try {
    const created = await prisma.driveNode.create({
      data: { space: parent.space, ownerId: parent.ownerId, kind: 'FILE', name, parentId: parent.id, storageKey: key, mimeType, size: buf.length, createdById: userId, contentHash: hashBuffer(buf) },
      select: { id: true },
    });
    return { id: created.id, name };
  } catch (err) {
    await removeStored([key]).catch(() => undefined);
    throw err;
  }
};

/** Who uploaded the given version: its audit entry (as the drive records it), else the creator. */
const uploaderOf = async (nodeId: string, version: number, createdById: string | null) => {
  if (version === 1) return createdById;
  const rows = await prisma.auditLog.findMany({
    where: { target: `drive:${nodeId}`, action: { in: ['DRIVE_FILE_VERSION_ADDED', 'DRIVE_FILE_VERSION_RESTORED'] } },
    select: { details: true, actorId: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.find((r) => (r.details as { version?: number } | null)?.version === version)?.actorId ?? null;
};

/**
 * Saves `buf` as the next version of a file (the previous file moves into the version history).
 * `baseVersion` must still be the current version, otherwise 409 VERSION_CONFLICT.
 */
export const saveFileVersion = async (nodeId: string, buf: Buffer, mimeType: string, baseVersion: number) => {
  const current = await prisma.driveNode.findUniqueOrThrow({
    where: { id: nodeId },
    select: { id: true, version: true, storageKey: true, mimeType: true, size: true, createdById: true },
  });
  if (current.version !== baseVersion) throw new HttpError(409, 'VERSION_CONFLICT');
  const uploadedById = await uploaderOf(current.id, current.version, current.createdById);
  const key = await storeBuffer(buf);
  const next = current.version + 1;
  try {
    await prisma.$transaction(async (tx) => {
      const moved = await tx.driveNode.updateMany({ where: { id: current.id, version: current.version }, data: { storageKey: key, mimeType, size: buf.length, version: next, contentHash: hashBuffer(buf) } });
      if (moved.count !== 1) throw new HttpError(409, 'VERSION_CONFLICT');
      await tx.driveFileVersion.create({
        data: { nodeId: current.id, version: current.version, storageKey: current.storageKey!, mimeType: current.mimeType ?? 'application/octet-stream', size: current.size ?? 0, uploadedById },
      });
    });
  } catch (err) {
    await removeStored([key]).catch(() => undefined);
    throw err;
  }
  return { version: next, size: buf.length };
};
