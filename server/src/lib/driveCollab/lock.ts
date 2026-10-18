import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';

/**
 * Edit locks of drive files ("Ilqar is editing"). An editor takes the lock when it opens a file and
 * refreshes it with a heartbeat every minute; a lock without a heartbeat for LOCK_STALE_MS is stale and
 * anyone with EDIT may take it over. While someone else holds a live lock, saving a new version,
 * renaming, moving or deleting the file answers 423 FILE_LOCKED.
 */

export const LOCK_STALE_MS = 5 * 60 * 1000;
export const LOCK_HEARTBEAT_MS = 60 * 1000;

export interface LockHolder {
  id: string;
  name: string;
}

/** 423 with who holds the lock (rendered by `fileLockedHandler`). */
export class FileLockedError extends HttpError {
  constructor(
    public lockedBy: LockHolder,
    public lockedAt: Date,
  ) {
    super(423, 'FILE_LOCKED');
  }
}

export const isStale = (lockedAt: Date | null | undefined, now = Date.now()) => !lockedAt || now - lockedAt.getTime() >= LOCK_STALE_MS;

const holderSelect = { updatedAt: true, lockedById: true, lockedAt: true, lockedBy: { select: { id: true, firstName: true, lastName: true } } } as const;

const holderOf = (u: { id: string; firstName: string; lastName: string }): LockHolder => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() });

/** The live lock of a node (null when free or stale). */
export const liveLock = async (nodeId: string) => {
  const n = await prisma.driveNode.findUnique({ where: { id: nodeId }, select: holderSelect });
  if (!n?.lockedById || !n.lockedBy || isStale(n.lockedAt)) return null;
  return { lockedBy: holderOf(n.lockedBy), lockedAt: n.lockedAt! };
};

/** Throws 423 FILE_LOCKED when someone other than `userId` holds a live lock on the node. */
export const assertNotLockedByOther = async (nodeId: string, userId: string) => {
  const lock = await liveLock(nodeId);
  if (lock && lock.lockedBy.id !== userId) throw new FileLockedError(lock.lockedBy, lock.lockedAt);
};

export type AcquireResult = { status: 'acquired' | 'refreshed' | 'takeover'; lockedAt: Date; previous: LockHolder | null };

/**
 * Takes (or refreshes) the lock for `userId`. Atomic: the row is only updated while it is free, stale or
 * already ours, so two editors opening the file at the same moment cannot both get it.
 */
export const acquireLock = async (nodeId: string, userId: string): Promise<AcquireResult> => {
  const before = await prisma.driveNode.findUnique({ where: { id: nodeId }, select: holderSelect });
  const now = new Date();
  const cutoff = new Date(now.getTime() - LOCK_STALE_MS);
  const res = await prisma.driveNode.updateMany({
    where: { id: nodeId, OR: [{ lockedById: null }, { lockedById: userId }, { lockedAt: null }, { lockedAt: { lt: cutoff } }] },
    // updatedAt is the "modified" time of the file: a lock or heartbeat must not move it.
    data: { lockedById: userId, lockedAt: now, ...(before ? { updatedAt: before.updatedAt } : {}) },
  });
  if (res.count !== 1) {
    const lock = await liveLock(nodeId);
    if (lock) throw new FileLockedError(lock.lockedBy, lock.lockedAt);
    return acquireLock(nodeId, userId);
  }
  if (before?.lockedById === userId && !isStale(before.lockedAt, now.getTime())) return { status: 'refreshed', lockedAt: now, previous: null };
  if (before?.lockedById && before.lockedBy && before.lockedById !== userId) return { status: 'takeover', lockedAt: now, previous: holderOf(before.lockedBy) };
  return { status: 'acquired', lockedAt: now, previous: null };
};

/** Releases the caller's own lock (no-op when it is not theirs). Returns whether a lock was released. */
export const releaseLock = async (nodeId: string, userId: string) => {
  const before = await prisma.driveNode.findUnique({ where: { id: nodeId }, select: { updatedAt: true } });
  if (!before) return false;
  const res = await prisma.driveNode.updateMany({ where: { id: nodeId, lockedById: userId }, data: { lockedById: null, lockedAt: null, updatedAt: before.updatedAt } });
  return res.count === 1;
};

/** Super admin: removes whoever's lock. Returns the previous holder. */
export const forceUnlock = async (nodeId: string) => {
  const before = await prisma.driveNode.findUnique({ where: { id: nodeId }, select: holderSelect });
  if (before) await prisma.driveNode.updateMany({ where: { id: nodeId }, data: { lockedById: null, lockedAt: null, updatedAt: before.updatedAt } });
  return before?.lockedBy ? holderOf(before.lockedBy) : null;
};

/** Express error middleware: renders FILE_LOCKED with the holder (mounted before the generic handler). */
export const fileLockedHandler = (err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof FileLockedError) {
    res.status(423).json({ error: 'FILE_LOCKED', message: err.message, lockedBy: err.lockedBy, lockedAt: err.lockedAt });
    return;
  }
  next(err);
};
