import fsp from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../db.js';
import { HttpError, conflict } from '../http.js';
import { newStorageKey, removeStored, storagePath } from '../drive/storage.js';
import { LIMITS } from './workbook.js';

/**
 * Storage side of the spreadsheet editor, on top of the drive store (lib/drive/storage.ts): reading the
 * current file of a drive node and saving a new version of it the same way the drive does for
 * "replace" uploads and version restores (the previous file moves to DriveFileVersion, history kept).
 */

/** The current file row of a drive node (no file read). */
export const currentRow = async (nodeId: string) => {
  const row = await prisma.driveNode.findUniqueOrThrow({
    where: { id: nodeId },
    select: { id: true, name: true, version: true, storageKey: true, mimeType: true, size: true, parentId: true },
  });
  if (!row.storageKey) throw new HttpError(404, 'FILE_MISSING_ON_DISK');
  if ((row.size ?? 0) > LIMITS.fileBytes) throw new HttpError(413, 'FILE_TOO_LARGE');
  return row as typeof row & { storageKey: string };
};

/** The stored bytes of a file row. */
export const readStoredFile = async (row: { storageKey: string }) => {
  let buf: Buffer;
  try {
    buf = await fsp.readFile(storagePath(row.storageKey));
  } catch {
    throw new HttpError(404, 'FILE_MISSING_ON_DISK');
  }
  if (buf.length > LIMITS.fileBytes) throw new HttpError(413, 'FILE_TOO_LARGE');
  return buf;
};

export const readCurrent = async (nodeId: string) => {
  const row = await currentRow(nodeId);
  return { row, buf: await readStoredFile(row) };
};

/** Writes bytes into the drive store under a fresh key. */
export const storeBuffer = async (buf: Buffer) => {
  const key = newStorageKey();
  await fsp.mkdir(path.dirname(storagePath(key)), { recursive: true });
  await fsp.writeFile(storagePath(key), buf, { flag: 'wx' });
  return key;
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
 * Saves `buf` as the next version of the file. `baseVersion` must still be the current version
 * (optimistic locking) unless `force`; otherwise 409 VERSION_CONFLICT with the current version.
 */
export const saveNewVersion = async (nodeId: string, buf: Buffer, mimeType: string, opts: { baseVersion: number; force?: boolean }) => {
  const current = await prisma.driveNode.findUniqueOrThrow({
    where: { id: nodeId },
    select: { id: true, version: true, storageKey: true, mimeType: true, size: true, createdById: true },
  });
  if (!opts.force && current.version !== opts.baseVersion) throw versionConflict(current.version);
  const uploadedById = await uploaderOf(current.id, current.version, current.createdById);
  const key = await storeBuffer(buf);
  const next = current.version + 1;
  try {
    await prisma.$transaction(async (tx) => {
      // Only moves on when nobody else saved in between (the version is the lock).
      const moved = await tx.driveNode.updateMany({
        where: { id: current.id, version: current.version },
        data: { storageKey: key, mimeType, size: buf.length, version: next },
      });
      if (moved.count !== 1) throw versionConflict(current.version + 1);
      await tx.driveFileVersion.create({
        data: {
          nodeId: current.id,
          version: current.version,
          storageKey: current.storageKey!,
          mimeType: current.mimeType ?? 'application/octet-stream',
          size: current.size ?? 0,
          uploadedById,
        },
      });
    });
  } catch (err) {
    await removeStored([key]).catch(() => undefined);
    throw err;
  }
  return { version: next, size: buf.length };
};

export const versionConflict = (currentVersion: number) => {
  const err = conflict('VERSION_CONFLICT');
  (err as HttpError & { currentVersion?: number }).currentVersion = currentVersion;
  return err;
};
