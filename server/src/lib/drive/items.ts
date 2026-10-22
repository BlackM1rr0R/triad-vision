import type { DocWorkflowStage, DriveAccess, DriveNodeKind, DriveSpace, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { INLINE_MIME } from '../fileCheck.js';
import { badRequest } from '../http.js';
import { nodeLiteSelect, type DriveAccessCtx, type NodeLite } from './access.js';
import { allows, type Level } from './levels.js';
import { cleanName } from './names.js';
import { peekSection } from './roots.js';
import { isStale } from '../driveCollab/lock.js';
import { decorateUploadAi, type UploadAiChip } from '../uploadAi/chips.js';

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
  documentId: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  lockedAt: true,
  lockedBy: { select: { id: true, firstName: true, lastName: true } },
  // Document organisation (lib/drive/org): workflow column, "Final" lock, tags.
  workflowStage: true,
  workflowAt: true,
  finalAt: true,
  tags: { select: { tag: { select: { id: true, name: true, color: true } } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.DriveNodeSelect;

export type ItemRow = Prisma.DriveNodeGetPayload<{ select: typeof itemSelect }>;

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
}

/** One file or folder as the explorer sees it. */
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
  /** Copy of a case document (DriveNode.documentId). */
  documentId?: string | null;
  /** Client folders and case document copies: the case they belong to. */
  caseId?: string;
  /** Client folders: who the client is (header strip in the explorer). */
  caseInfo?: { clientName: string; passportNumber: string | null; visaType: string; partner: { id: string; name: string } | null };
  /** Partner folders below "Partner": the referral partner. */
  partner?: { id: string; name: string; phone: string | null; email: string | null; active: boolean };
  caseNumber?: string;
  caseStatus?: string;
  stage?: string;
  docStatus?: string;
  purged?: boolean;
  assignedStaff?: PersonRef | null;
  /** Open (unresolved) comment threads on the item. */
  commentCount?: number;
  /** Live edit lock ("… is editing"); stale locks are left out. */
  lock?: { by: PersonRef; at: Date };
  /** Workflow board column (documents in client folders start in INCOMING). */
  workflowStage?: DocWorkflowStage | null;
  workflowAt?: Date | null;
  /** "Final": nobody may change the file any more (super admins can lift it). */
  finalAt?: Date | null;
  tags?: { id: string; name: string; color: string }[];
  /** Smart uploads: recognised type / open proposals / low quality of a file in a client folder. */
  uploadAi?: UploadAiChip;
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
  ...(row.documentId ? { documentId: row.documentId } : {}),
  ...(row.lockedBy && row.lockedAt && !isStale(row.lockedAt) ? { lock: { by: row.lockedBy, at: row.lockedAt } } : {}),
  workflowStage: row.workflowStage,
  workflowAt: row.workflowAt,
  finalAt: row.finalAt,
  tags: row.tags.map((t) => t.tag),
});

/**
 * Links items to their case: a client folder (Case.driveFolderId) and a copy of a case document
 * (DriveNode.documentId) get the case id, number and status (badge "Müraciət sənədi · TV-…" in the UI).
 */
export const decorateCaseLinks = async (items: DriveItem[]) => {
  const folderIds = items.filter((i) => i.kind === 'FOLDER').map((i) => i.id);
  // Partner folders: matched by name among the children of the "Partner" section (found by id, so a renamed section works).
  const partnersId = items.some((i) => i.kind === 'FOLDER' && i.parentId) ? await peekSection('partners') : null;
  const partnerFolders = partnersId ? items.filter((i) => i.kind === 'FOLDER' && i.parentId === partnersId) : [];
  if (partnerFolders.length) {
    const partners = await prisma.referralPartner.findMany({ select: { id: true, name: true, phone: true, email: true, active: true } });
    const byName = new Map(partners.map((p) => [cleanName(p.name, 'Partner').toLocaleLowerCase('en'), p]));
    for (const f of partnerFolders) {
      const p = byName.get(f.name.toLocaleLowerCase('en'));
      if (p) f.partner = p;
    }
  }
  const docIds = items.map((i) => i.documentId).filter((d): d is string => !!d);
  const [cases, docs] = await Promise.all([
    folderIds.length
      ? prisma.case.findMany({
          where: { driveFolderId: { in: folderIds } },
          select: { id: true, number: true, status: true, driveFolderId: true, visaType: true, partner: { select: { id: true, name: true } }, client: { select: { firstName: true, lastName: true, passportNumber: true } } },
        })
      : Promise.resolve([]),
    docIds.length
      ? prisma.document.findMany({ where: { id: { in: docIds } }, select: { id: true, stage: true, status: true, case: { select: { id: true, number: true, status: true } } } })
      : Promise.resolve([]),
  ]);
  const byFolder = new Map(cases.map((c) => [c.driveFolderId!, c]));
  const byDoc = new Map(docs.map((d) => [d.id, d]));
  for (const item of items) {
    const c = byFolder.get(item.id);
    if (c) {
      Object.assign(item, { caseId: c.id, caseNumber: c.number, caseStatus: c.status });
      item.caseInfo = { clientName: `${c.client.firstName} ${c.client.lastName}`.trim(), passportNumber: c.client.passportNumber, visaType: c.visaType, partner: c.partner };
    }
    const d = item.documentId ? byDoc.get(item.documentId) : undefined;
    if (d) Object.assign(item, { caseId: d.case.id, caseNumber: d.case.number, caseStatus: d.case.status, stage: d.stage, docStatus: d.status });
  }
  return items;
};

/** Live child counts of the given folders (one query). */
export const childCounts = async (folderIds: string[]) => {
  if (folderIds.length === 0) return new Map<string, number>();
  const rows = await prisma.driveNode.groupBy({ by: ['parentId'], where: { parentId: { in: folderIds }, deletedAt: null }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.parentId as string, r._count._all]));
};

/** Open comment threads per node (one query). */
export const openCommentCounts = async (ids: string[]) => {
  if (ids.length === 0) return new Map<string, number>();
  const rows = await prisma.driveComment.groupBy({ by: ['nodeId'], where: { nodeId: { in: ids }, parentId: null, resolvedAt: null }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.nodeId, r._count._all]));
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
  const [counts, stars, comments] = await Promise.all([childCounts(visible.filter((r) => r.kind === 'FOLDER').map((r) => r.id)), starredSet(ctx.user.id, ids), openCommentCounts(ids)]);
  const items = visible.map((r) => {
    const item = toItem(r, ctx.level(r.id) as DriveAccess, { childCount: counts.get(r.id), starred: stars.has(r.id) });
    if (comments.get(r.id)) item.commentCount = comments.get(r.id);
    if (opts.withLocation) {
      const parent = r.parentId ? ctx.nodes.get(r.parentId) : undefined;
      item.location = parent ? { id: parent.id, name: parent.name, space: parent.space, system: parent.system } : null;
    }
    return item;
  });
  return decorateUploadAi(await decorateCaseLinks(items));
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
