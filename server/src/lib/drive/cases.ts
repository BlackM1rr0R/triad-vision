import path from 'node:path';
import type { CaseStatus, DocStage, DriveAccess, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { HttpError, notFound } from '../http.js';
import { INLINE_MIME } from '../fileCheck.js';
import type { DriveAccessCtx } from './access.js';
import type { Crumb, DriveItem } from './items.js';
import { allows, maxLevel, minLevel, type Level } from './levels.js';
import { ensureRoots } from './roots.js';

/**
 * The "Cases" area: a read-only, virtual tree built from Case / Document rows (nothing is duplicated).
 *
 *   Cases (real system root)
 *   └─ case:<caseId>                 "TV-2026-0012 — Firstname Lastname"
 *      └─ case:<caseId>:<STAGE>      one folder per document stage that has documents
 *         └─ doc:<documentId>        the case document (contracts are documents of stage CONTRACT / CONTRACT_SIGNED)
 *
 * Access: the effective level on the Cases root (role grant ADMIN = DOWNLOAD by default), or DOWNLOAD
 * for the staff member assigned to the case — capped at EXPORT, because files are managed in the case flow.
 */

export const STAGES: DocStage[] = ['INITIAL', 'EMBASSY', 'CONTRACT', 'CONTRACT_SIGNED', 'VISA', 'OTHER'];

const ID = '[a-z0-9]{10,40}';
const CASE_RE = new RegExp(`^case:(${ID})$`);
const STAGE_RE = new RegExp(`^case:(${ID}):(${STAGES.join('|')})$`);
const DOC_RE = new RegExp(`^doc:(${ID})$`);

export type VirtualRef = { kind: 'case'; caseId: string } | { kind: 'stage'; caseId: string; stage: DocStage } | { kind: 'doc'; docId: string };

export const isVirtualId = (id: string) => id.startsWith('case:') || id.startsWith('doc:');

/** Parses a virtual id; anything malformed is null (and answers 404 upstream). */
export const parseVirtualId = (id: string): VirtualRef | null => {
  let m = CASE_RE.exec(id);
  if (m) return { kind: 'case', caseId: m[1] };
  m = STAGE_RE.exec(id);
  if (m) return { kind: 'stage', caseId: m[1], stage: m[2] as DocStage };
  m = DOC_RE.exec(id);
  if (m) return { kind: 'doc', docId: m[1] };
  return null;
};

/** Level on the Cases root for this user (null = none) and the root id. */
export const casesRootAccess = async (ctx: DriveAccessCtx) => {
  const { casesId } = await ensureRoots();
  await ctx.load([casesId]);
  return { casesId, rootLevel: ctx.level(casesId) };
};

export const caseLevel = (rootLevel: Level, assignedStaffId: string | null, userId: string): Level => {
  const l = maxLevel(rootLevel, assignedStaffId === userId ? 'DOWNLOAD' : null);
  return minLevel(l, 'EXPORT');
};

const person = { select: { id: true, firstName: true, lastName: true } } as const;

const caseSelect = {
  id: true,
  number: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  documentsPurgedAt: true,
  assignedStaffId: true,
  assignedStaff: person,
  client: { select: { firstName: true, lastName: true } },
} satisfies Prisma.CaseSelect;

type CaseRow = Prisma.CaseGetPayload<{ select: typeof caseSelect }>;

const docSelect = {
  id: true,
  caseId: true,
  stage: true,
  originalName: true,
  storedName: true,
  mimeType: true,
  size: true,
  status: true,
  createdAt: true,
  uploadedBy: person,
} satisfies Prisma.DocumentSelect;

type DocRow = Prisma.DocumentGetPayload<{ select: typeof docSelect }>;

export const caseFolderName = (c: Pick<CaseRow, 'number' | 'client'>) => `${c.number} — ${c.client.firstName} ${c.client.lastName}`.trim();

const base = {
  space: 'CASES' as const,
  system: false,
  virtual: true,
  color: null,
  version: 1,
  ownerId: null,
  inheritPermissions: true,
  starred: false,
};

const caseItem = (c: CaseRow, casesId: string, level: DriveAccess, stageCount: number): DriveItem => ({
  ...base,
  id: `case:${c.id}`,
  kind: 'FOLDER',
  name: caseFolderName(c),
  parentId: casesId,
  mimeType: null,
  size: null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  createdBy: null,
  myAccess: level,
  previewable: false,
  childCount: stageCount,
  caseId: c.id,
  caseNumber: c.number,
  caseStatus: c.status,
  purged: !!c.documentsPurgedAt,
  assignedStaff: c.assignedStaff,
});

const stageItem = (c: CaseRow, stage: DocStage, level: DriveAccess, count: number, updatedAt: Date): DriveItem => ({
  ...base,
  id: `case:${c.id}:${stage}`,
  kind: 'FOLDER',
  name: stage,
  parentId: `case:${c.id}`,
  mimeType: null,
  size: null,
  createdAt: c.createdAt,
  updatedAt,
  createdBy: null,
  myAccess: level,
  previewable: false,
  childCount: count,
  caseId: c.id,
  caseNumber: c.number,
  caseStatus: c.status,
  stage,
});

const docItem = (c: Pick<CaseRow, 'id' | 'number' | 'status'>, d: DocRow, level: DriveAccess): DriveItem => ({
  ...base,
  id: `doc:${d.id}`,
  kind: 'FILE',
  name: d.originalName,
  parentId: `case:${c.id}:${d.stage}`,
  mimeType: d.mimeType,
  size: d.size,
  createdAt: d.createdAt,
  updatedAt: d.createdAt,
  createdBy: d.uploadedBy,
  myAccess: level,
  previewable: INLINE_MIME.has(d.mimeType),
  caseId: c.id,
  caseNumber: c.number,
  caseStatus: c.status,
  stage: d.stage,
  docStatus: d.status,
});

/** Children of the Cases root: one virtual folder per case the user may see. */
export const listCases = async (ctx: DriveAccessCtx, opts: { status?: CaseStatus; q?: string; take?: number } = {}) => {
  const { casesId, rootLevel } = await casesRootAccess(ctx);
  const where: Prisma.CaseWhereInput = {
    ...(allows(rootLevel, 'VIEW') ? {} : { assignedStaffId: ctx.user.id }),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.q
      ? {
          OR: [
            { number: { contains: opts.q } },
            { client: { firstName: { contains: opts.q } } },
            { client: { lastName: { contains: opts.q } } },
          ],
        }
      : {}),
  };
  const cases = await prisma.case.findMany({ where, select: caseSelect, orderBy: { createdAt: 'desc' }, take: opts.take ?? 5000 });
  const stageRows = cases.length
    ? await prisma.document.groupBy({ by: ['caseId', 'stage'], where: { caseId: { in: cases.map((c) => c.id) } } })
    : [];
  const stagesOf = new Map<string, number>();
  for (const r of stageRows) stagesOf.set(r.caseId, (stagesOf.get(r.caseId) ?? 0) + 1);
  const items: DriveItem[] = [];
  for (const c of cases) {
    const level = caseLevel(rootLevel, c.assignedStaffId, ctx.user.id);
    if (level) items.push(caseItem(c, casesId, level, stagesOf.get(c.id) ?? 0));
  }
  return { casesId, rootLevel, items };
};

/** Does this user see the Cases area at all (root access or at least one assigned case)? */
export const seesCases = async (ctx: DriveAccessCtx) => {
  const { casesId, rootLevel } = await casesRootAccess(ctx);
  if (rootLevel) return { casesId, rootLevel, visible: true };
  const assigned = await prisma.case.count({ where: { assignedStaffId: ctx.user.id } });
  return { casesId, rootLevel, visible: assigned > 0 };
};

const loadCase = async (ctx: DriveAccessCtx, caseId: string) => {
  const { casesId, rootLevel } = await casesRootAccess(ctx);
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: caseSelect });
  const level = c ? caseLevel(rootLevel, c.assignedStaffId, ctx.user.id) : null;
  if (!c || !level) throw notFound('NODE_NOT_FOUND');
  return { c, level, casesId, rootLevel };
};

export interface VirtualNode {
  ref: VirtualRef;
  item: DriveItem;
  level: DriveAccess;
  casesId: string;
  caseRow: CaseRow;
  doc?: DocRow;
}

/** Resolves a virtual id the user may see (else 404) and checks `need` (else 403). */
export const loadVirtual = async (ctx: DriveAccessCtx, id: string, need: DriveAccess): Promise<VirtualNode> => {
  const ref = parseVirtualId(id);
  if (!ref) throw notFound('NODE_NOT_FOUND');
  let out: VirtualNode;
  if (ref.kind === 'doc') {
    const doc = await prisma.document.findUnique({ where: { id: ref.docId }, select: docSelect });
    if (!doc) throw notFound('NODE_NOT_FOUND');
    const { c, level, casesId } = await loadCase(ctx, doc.caseId);
    out = { ref, item: docItem(c, doc, level), level, casesId, caseRow: c, doc };
  } else {
    const { c, level, casesId } = await loadCase(ctx, ref.caseId);
    if (ref.kind === 'case') {
      const stages = await prisma.document.groupBy({ by: ['stage'], where: { caseId: c.id } });
      out = { ref, item: caseItem(c, casesId, level, stages.length), level, casesId, caseRow: c };
    } else {
      const agg = await prisma.document.aggregate({ where: { caseId: c.id, stage: ref.stage }, _count: { _all: true }, _max: { createdAt: true } });
      out = { ref, item: stageItem(c, ref.stage, level, agg._count._all, agg._max.createdAt ?? c.updatedAt), level, casesId, caseRow: c };
    }
  }
  if (!allows(out.level, need)) throw new HttpError(403, 'INSUFFICIENT_ACCESS');
  return out;
};

/** Children of a virtual folder. */
export const listVirtual = async (ctx: DriveAccessCtx, v: VirtualNode): Promise<DriveItem[]> => {
  const c = v.caseRow;
  if (v.ref.kind === 'case') {
    const rows = await prisma.document.groupBy({ by: ['stage'], where: { caseId: c.id }, _count: { _all: true }, _max: { createdAt: true } });
    const byStage = new Map(rows.map((r) => [r.stage, r]));
    return STAGES.filter((s) => byStage.has(s)).map((s) => stageItem(c, s, v.level, byStage.get(s)!._count._all, byStage.get(s)!._max.createdAt ?? c.updatedAt));
  }
  if (v.ref.kind === 'stage') {
    const docs = await prisma.document.findMany({ where: { caseId: c.id, stage: v.ref.stage }, select: docSelect, orderBy: { createdAt: 'asc' } });
    return docs.map((d) => docItem(c, d, v.level));
  }
  return [];
};

/** Breadcrumb of a virtual node: Cases › case › stage (› document). */
export const virtualBreadcrumb = (v: VirtualNode, rootLevel: Level): Crumb[] => {
  const c = v.caseRow;
  const crumbs: Crumb[] = [
    { id: v.casesId, name: 'Cases', space: 'CASES', system: true, ownerId: null, myAccess: rootLevel },
    { id: `case:${c.id}`, name: caseFolderName(c), space: 'CASES', system: false, ownerId: null, myAccess: v.level },
  ];
  const stage = v.ref.kind === 'stage' ? v.ref.stage : v.doc?.stage;
  if (stage) crumbs.push({ id: `case:${c.id}:${stage}`, name: stage, space: 'CASES', system: false, ownerId: null, myAccess: v.level });
  if (v.doc) crumbs.push({ id: `doc:${v.doc.id}`, name: v.doc.originalName, space: 'CASES', system: false, ownerId: null, myAccess: v.level });
  return crumbs;
};

export const docFilePath = (storedName: string) => path.join(config.uploads.privateDir, path.basename(storedName));

/** All documents of a virtual folder (for ZIP export / copy), with their path inside it. */
export const virtualFiles = async (v: VirtualNode) => {
  const c = v.caseRow;
  if (v.doc) return [{ rel: v.doc.originalName, doc: v.doc }];
  const where: Prisma.DocumentWhereInput = { caseId: c.id, ...(v.ref.kind === 'stage' ? { stage: v.ref.stage } : {}) };
  const docs = await prisma.document.findMany({ where, select: docSelect, orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }] });
  return docs.map((d) => ({ rel: v.ref.kind === 'case' ? `${d.stage}/${d.originalName}` : d.originalName, doc: d }));
};

/** Search in the Cases area: case numbers / client names and document names. */
export const searchCases = async (ctx: DriveAccessCtx, q: string, take = 50) => {
  const { casesId, rootLevel } = await casesRootAccess(ctx);
  const scope: Prisma.CaseWhereInput = allows(rootLevel, 'VIEW') ? {} : { assignedStaffId: ctx.user.id };
  const [{ items: cases }, docs] = await Promise.all([
    listCases(ctx, { q, take }),
    prisma.document.findMany({
      where: { originalName: { contains: q }, case: scope },
      select: { ...docSelect, case: { select: caseSelect } },
      orderBy: { createdAt: 'desc' },
      take,
    }),
  ]);
  const docItems: DriveItem[] = [];
  for (const d of docs) {
    const level = caseLevel(rootLevel, d.case.assignedStaffId, ctx.user.id);
    if (!level) continue;
    const item = docItem(d.case, d, level);
    item.location = { id: `case:${d.case.id}:${d.stage}`, name: `${d.case.number} · ${d.stage}`, space: 'CASES', system: false };
    docItems.push(item);
  }
  for (const c of cases) c.location = { id: casesId, name: 'Cases', space: 'CASES', system: true };
  return [...cases, ...docItems];
};
