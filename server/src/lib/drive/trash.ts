import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { collectSubtree } from './items.js';
import { removeStored } from './storage.js';

/**
 * Recycle bin. Deleting marks the node and its whole live subtree with the same `deletedAt` (and who
 * deleted it); a "trash root" is a deleted node whose parent is alive or was deleted at another moment.
 * Restoring clears exactly the nodes carrying the root's timestamp, so items that had been deleted
 * earlier inside it stay in the bin. Purging removes the rows (children, versions, stars and task links
 * cascade) and then the files on disk.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Moves a node (and its live subtree) to the recycle bin. */
export const softDelete = async (nodeId: string, userId: string, at = new Date()) => {
  const subtree = await collectSubtree([nodeId], { id: true });
  const ids = subtree.map((n) => n.id);
  const res = await prisma.driveNode.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: at, deletedById: userId } });
  return res.count;
};

/** The ids restored together with a trash root (same timestamp). */
export const restoreSubtree = async (nodeId: string, deletedAt: Date) => {
  const subtree = await collectSubtree([nodeId], { id: true }, { deletedAt });
  const ids = subtree.map((n) => n.id);
  await prisma.driveNode.updateMany({ where: { id: { in: ids }, deletedAt }, data: { deletedAt: null, deletedById: null } });
  return ids.length;
};

const trashRowSelect = {
  id: true,
  parentId: true,
  deletedAt: true,
  parent: { select: { deletedAt: true } },
} satisfies Prisma.DriveNodeSelect;

/** Ids of trash roots matching `where` (a deleted node whose parent is alive or deleted at another time). */
export const trashRootIds = async (where: Prisma.DriveNodeWhereInput, take = 2000) => {
  const [aliveParent, deletedParent] = await Promise.all([
    prisma.driveNode.findMany({ where: { AND: [where, { deletedAt: { not: null } }, { parent: { deletedAt: null } }] }, select: trashRowSelect, orderBy: { deletedAt: 'desc' }, take }),
    prisma.driveNode.findMany({ where: { AND: [where, { deletedAt: { not: null } }, { parent: { deletedAt: { not: null } } }] }, select: trashRowSelect, orderBy: { deletedAt: 'desc' }, take: take * 5 }),
  ]);
  const roots = [...aliveParent, ...deletedParent.filter((n) => n.parent?.deletedAt?.getTime() !== n.deletedAt?.getTime())];
  return roots.map((r) => r.id);
};

/** Deletes nodes and everything below them for good, then their files. Returns counts. */
export const purgeNodes = async (rootIds: string[]) => {
  if (rootIds.length === 0) return { nodes: 0, bytes: 0 };
  const subtree = await collectSubtree(rootIds, { id: true, storageKey: true, versions: { select: { storageKey: true } } }, { includeDeleted: true });
  const keys = subtree.flatMap((n) => [n.storageKey, ...n.versions.map((v) => v.storageKey)]);
  const ids = subtree.map((n) => n.id);
  // Children first is not needed (parentId cascades), but deleting all ids at once keeps it to one statement.
  await prisma.driveNode.deleteMany({ where: { id: { in: ids } } });
  const bytes = await removeStored(keys);
  return { nodes: ids.length, bytes };
};

/** Daily job: purges trash roots older than the trash period. */
export const purgeExpiredTrash = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - config.drive.trashDays * DAY);
  const roots = await trashRootIds({ deletedAt: { lt: cutoff } }, 500);
  return { roots: roots.length, ...(await purgeNodes(roots)) };
};
