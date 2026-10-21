import { prisma } from '../../../db.js';
import { collectSubtree } from '../items.js';
import { finalError } from './finalCheck.js';

export { FILE_FINAL, assertNotFinal, finalError } from './finalCheck.js';

/**
 * "Final" lock: a signed contract or a sent embassy package must not change any more. Final files cannot be
 * renamed, moved, replaced (new version), edited in the editors or deleted — by anyone; only a super admin
 * can lift it (with a reason, audited). The node check runs inside assertNotLockedByOther
 * (lib/driveCollab/lock.ts), so every place that honours edit locks honours Final too; folders are checked
 * for final files inside before they are moved or deleted.
 */

/** 423 FILE_FINAL when the folder (or anything live below it) is final. Cheap when nothing is final at all. */
export const assertNoFinalInside = async (folderId: string) => {
  if ((await prisma.driveNode.count({ where: { finalAt: { not: null }, deletedAt: null } })) === 0) return;
  let sub: { finalAt: Date | null }[];
  try {
    sub = await collectSubtree([folderId], { finalAt: true });
  } catch {
    return; // a huge subtree: the per-node checks still protect each file
  }
  if (sub.some((n) => n.finalAt)) throw finalError();
};

/**
 * Marks a node final: a file itself, a folder together with every live file below it (and the folder).
 * Returns the ids that became final. The "modified" time stays.
 */
export const setFinal = async (nodeId: string, userId: string | null, on: boolean) => {
  const sub = await collectSubtree([nodeId], { finalAt: true, updatedAt: true }, { limit: 20_000 });
  const changed: string[] = [];
  const at = new Date();
  for (const n of sub) {
    if (on === !!n.finalAt) continue;
    await prisma.driveNode.updateMany({
      where: { id: n.id },
      data: on ? { finalAt: at, finalById: userId, updatedAt: n.updatedAt } : { finalAt: null, finalById: null, updatedAt: n.updatedAt },
    });
    changed.push(n.id);
  }
  return changed;
};
