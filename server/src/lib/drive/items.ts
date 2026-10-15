import type { DriveAccess, DriveNodeKind, DriveSpace, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { INLINE_MIME } from '../fileCheck.js';
import { badRequest } from '../http.js';
import { nodeLiteSelect, type DriveAccessCtx, type NodeLite } from './access.js';
import { allows, type Level } from './levels.js';

/** Everything a listing row needs (grants come along for the access calculation). */
export const itemSelect = {
  ...nodeLiteSelect,
  color: true,
  mimeType: true,
  size: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedById: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.DriveNodeSelect;

export type ItemRow = Prisma.DriveNodeGetPayload<{ select: typeof itemSelect }>;

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
}

/** One file or folder as the explorer sees it (real or virtual). */
export interface DriveItem {
  id: string;
  kind: DriveNodeKind;
  name: string;
  space: DriveSpace;
  parentId: string | null;
  system: boolean;
  virtual: boolean;
  color: string | null;
  mimeType: string | null;
  size: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: PersonRef | null;
  ownerId: string | null;
  inheritPermissions: boolean;
  myAccess: DriveAccess;
  previewable: boolean;
  starred: boolean;
  childCount?: number;
  /** Virtual (Cases area) extras. */
  caseId?: string;
  caseNumber?: string;
  caseStatus?: string;
  stage?: string;
  docStatus?: string;
  purged?: boolean;
  assignedStaff?: PersonRef | null;
  /** Search / recent / starred rows: where the item lives. */
  location?: { id: string; name: string; space: DriveSpace; system: boolean } | null;
}

export const toItem = (row: ItemRow, myAccess: DriveAccess, extra: { childCount?: number; starred?: boolean } = {}): DriveItem => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  space: row.space,
  parentId: row.parentId,
  system: row.system,
  virtual: false,
  color: row.color,
  mimeType: row.mimeType,
  size: row.size,
  version: row.version,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  createdBy: row.createdBy,
  ownerId: row.ownerId,
  inheritPermissions: row.inheritPermissions,
  myAccess,
  previewable: !!row.mimeType && INLINE_MIME.has(row.mimeType),
  starred: extra.starred ?? false,
  ...(row.kind === 'FOLDER' ? { childCount: extra.childCount ?? 0 } : {}),
});

/** Live child counts of the given folders (one query). */
export const childCounts = async (folderIds: string[]) => {
  if (folderIds.length === 0) return new Map<string, number>();
  const rows = await prisma.driveNode.groupBy({ by: ['parentId'], where: { parentId: { in: folderIds }, deletedAt: null }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.parentId as string, r._count._all]));
};

export const starredSet = async (userId: string, ids: string[]) => {
  if (ids.length === 0) return new Set<string>();
  const rows = await prisma.driveFavorite.findMany({ where: { userId, nodeId: { in: ids } }, select: { nodeId: true } });
  return new Set(rows.map((r) => r.nodeId));
};

/**
 * Turns fetched rows into items the user may see (VIEW at least), with child counts, stars and
 * optionally their location. All in a fixed number of queries.
 */
export const buildItems = async (ctx: DriveAccessCtx, rows: ItemRow[], opts: { withLocation?: boolean } = {}) => {
  await ctx.addWithAncestors(rows as unknown as NodeLite[]);
  const visible = rows.filter((r) => allows(ctx.level(r.id), 'VIEW'));
  const ids = visible.map((r) => r.id);
  const [counts, stars] = await Promise.all([childCounts(visible.filter((r) => r.kind === 'FOLDER').map((r) => r.id)), starredSet(ctx.user.id, ids)]);
  return visible.map((r) => {
    const item = toItem(r, ctx.level(r.id) as DriveAccess, { childCount: counts.get(r.id), starred: stars.has(r.id) });
    if (opts.withLocation) {
      const parent = r.parentId ? ctx.nodes.get(r.parentId) : undefined;
      item.location = parent ? { id: parent.id, name: parent.name, space: parent.space, system: parent.system } : null;
    }
    return item;
  });
};

export interface Crumb {
  id: string;
  name: string;
  space: DriveSpace;
  system: boolean;
  ownerId: string | null;
  myAccess: Level;
}

/**
 * Breadcrumb from the top-most ancestor the user can see down to the node. When the user reaches the
 * node through a share only (an ancestor is invisible), `truncated` is true and the trail starts there.
 */
export const breadcrumb = (ctx: DriveAccessCtx, id: string) => {
  const chain = ctx.chain(id);
  let start = chain.length - 1;
  while (start > 0 && ctx.level(chain[start - 1].id)) start--;
  return {
    path: chain.slice(start).map<Crumb>((n) => ({ id: n.id, name: n.name, space: n.space, system: n.system, ownerId: n.ownerId, myAccess: ctx.level(n.id) })),
    truncated: start > 0,
  };
};

/**
 * Every node below the given roots (roots included), breadth-first, one query per level. Deleted nodes
 * are skipped unless asked for.
 */
export const collectSubtree = async <S extends Prisma.DriveNodeSelect>(
  rootIds: string[],
  select: S,
  opts: { includeDeleted?: boolean; deletedAt?: Date; limit?: number } = {},
) => {
  type Row = Prisma.DriveNodeGetPayload<{ select: S & { id: true; kind: true; parentId: true } }>;
  type Base = { id: string; kind: DriveNodeKind };
  const sel = { ...select, id: true, kind: true, parentId: true } as Prisma.DriveNodeSelect;
  const deletedFilter = opts.deletedAt ? { deletedAt: opts.deletedAt } : opts.includeDeleted ? {} : { deletedAt: null };
  const out = (await prisma.driveNode.findMany({ where: { id: { in: rootIds } }, select: sel })) as unknown as Row[];
  let frontier = (out as unknown as Base[]).filter((r) => r.kind === 'FOLDER').map((r) => r.id);
  const limit = opts.limit ?? 50_000;
  for (let depth = 0; frontier.length > 0 && depth < 100; depth++) {
    const rows = (await prisma.driveNode.findMany({ where: { parentId: { in: frontier }, ...deletedFilter }, select: sel })) as unknown as Row[];
    out.push(...rows);
    if (out.length > limit) throw badRequest('SUBTREE_TOO_LARGE');
    frontier = (rows as unknown as Base[]).filter((r) => r.kind === 'FOLDER').map((r) => r.id);
  }
  return out;
};
