import { DriveAccessCtx } from '../drive/access.js';
import { allows } from '../drive/levels.js';
import type { Actor } from './core.js';

/**
 * Which drive nodes (files/folders linked to tasks) a user may VIEW, using the drive's own
 * permission engine (grants, inheritance, personal spaces). Trashed nodes are never viewable.
 */
export const viewableNodeIds = async (actor: Actor, nodeIds: string[]): Promise<Set<string>> => {
  const ids = [...new Set(nodeIds)].filter(Boolean);
  if (!ids.length) return new Set();
  const ctx = new DriveAccessCtx({ id: actor.id, role: actor.role });
  await ctx.load(ids);
  return new Set(ids.filter((id) => {
    const node = ctx.nodes.get(id);
    return !!node && !node.deletedAt && allows(ctx.level(id), 'VIEW');
  }));
};
