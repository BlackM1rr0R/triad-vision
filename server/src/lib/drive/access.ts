import type { DriveAccess, DriveNodeKind, DriveSpace, Prisma, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { HttpError, notFound } from '../http.js';
import { allows, maxLevel, type Level } from './levels.js';

/**
 * Permission engine of the team drive.
 *
 *   SUPER_ADMIN                      → MANAGE on everything.
 *   owner of a PERSONAL tree         → MANAGE on every node of that tree.
 *   everyone else                    → max(own grants of N, N.inheritPermissions ? effective(parent) : nothing)
 *
 * A grant matches when it names the user, or names a role the user has at least (a STAFF grant covers
 * STAFF, ADMIN and SUPER_ADMIN). No matching grant anywhere on the chain = no access (the API answers 404).
 *
 * One context lives for one request: nodes are loaded in batches together with all their ancestors
 * (one query per tree level, never one per node) and levels are memoised, so a listing of thousands of
 * children costs the same number of queries as a single node.
 */

export interface GrantLite {
  id: string;
  userId: string | null;
  role: Role | null;
  access: DriveAccess;
}

export interface NodeLite {
  id: string;
  parentId: string | null;
  space: DriveSpace;
  kind: DriveNodeKind;
  name: string;
  ownerId: string | null;
  inheritPermissions: boolean;
  system: boolean;
  deletedAt: Date | null;
  grants: GrantLite[];
}

export const grantLiteSelect = { id: true, userId: true, role: true, access: true } as const;

export const nodeLiteSelect = {
  id: true,
  parentId: true,
  space: true,
  kind: true,
  name: true,
  ownerId: true,
  inheritPermissions: true,
  system: true,
  deletedAt: true,
  grants: { select: grantLiteSelect },
} satisfies Prisma.DriveNodeSelect;

export interface DriveUser {
  id: string;
  role: Role;
}

export const grantMatches = (g: Pick<GrantLite, 'userId' | 'role'>, user: DriveUser) =>
  g.userId ? g.userId === user.id : !!g.role && hasMinRole(user.role, g.role);

export class DriveAccessCtx {
  readonly nodes = new Map<string, NodeLite>();
  private memo = new Map<string, Level>();

  constructor(readonly user: DriveUser) {}

  get isSuper() {
    return this.user.role === 'SUPER_ADMIN';
  }

  add(rows: NodeLite[]) {
    for (const r of rows) this.nodes.set(r.id, r);
  }

  /** Loads the given nodes and every ancestor not loaded yet (one query per tree level). */
  async load(ids: Iterable<string>) {
    let pending = [...new Set(ids)].filter((id) => id && !this.nodes.has(id));
    for (let depth = 0; pending.length > 0 && depth < 100; depth++) {
      const rows = await prisma.driveNode.findMany({ where: { id: { in: pending } }, select: nodeLiteSelect });
      this.add(rows);
      pending = [...new Set(rows.map((r) => r.parentId).filter((p): p is string => !!p && !this.nodes.has(p)))];
    }
  }

  /** Adds already-fetched rows (e.g. the children of a listing) and loads their missing ancestors. */
  async addWithAncestors(rows: NodeLite[]) {
    this.add(rows);
    await this.load(rows.map((r) => r.parentId).filter((p): p is string => !!p));
  }

  /** The best level granted by the node's own grants. */
  ownLevel(n: NodeLite): Level {
    let l: Level = null;
    for (const g of n.grants) if (grantMatches(g, this.user)) l = maxLevel(l, g.access);
    return l;
  }

  /** Effective level on a loaded node (null = no access). */
  level(id: string): Level {
    if (this.isSuper) return this.nodes.has(id) ? 'MANAGE' : null;
    if (this.memo.has(id)) return this.memo.get(id)!;
    const n = this.nodes.get(id);
    if (!n) return null;
    let l: Level;
    if (n.space === 'PERSONAL' && n.ownerId === this.user.id) l = 'MANAGE';
    else {
      l = this.ownLevel(n);
      if (n.inheritPermissions && n.parentId) l = maxLevel(l, this.level(n.parentId));
    }
    this.memo.set(id, l);
    return l;
  }

  /** Ancestors of a loaded node, root first, the node itself last. */
  chain(id: string): NodeLite[] {
    const out: NodeLite[] = [];
    let cur = this.nodes.get(id);
    for (let i = 0; cur && i < 200; i++) {
      out.unshift(cur);
      cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined;
    }
    return out;
  }

  /** Forget memoised levels (after grants or inheritance changed within the request). */
  reset() {
    this.memo.clear();
    this.nodes.clear();
  }
}

/**
 * Loads a node and asserts the caller has at least `need` on it. Unknown, invisible or (unless
 * `allowDeleted`) trashed nodes all answer 404 so their existence is never revealed.
 */
export const requireNode = async (ctx: DriveAccessCtx, id: string, need: DriveAccess, opts: { allowDeleted?: boolean } = {}) => {
  await ctx.load([id]);
  const node = ctx.nodes.get(id);
  const level = node ? ctx.level(id) : null;
  if (!node || !level || (!opts.allowDeleted && node.deletedAt)) throw notFound('NODE_NOT_FOUND');
  if (!allows(level, need)) throw new HttpError(403, 'INSUFFICIENT_ACCESS');
  return { node, level };
};
