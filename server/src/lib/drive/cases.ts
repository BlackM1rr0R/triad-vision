import path from 'node:path';
import type { CaseStatus, DocStage, DriveAccess, Prisma, VisaType } from '@prisma/client';
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
 *   └─ vt:<TYPE>                       kind of application ("Ausbildung", "İş vizası", …)
 *      ├─ vc:<TYPE>:<visaCategoryId>   visa category inside it ("§18b · Kuryer sürücüləri")
 *      │  └─ case:<caseId>             "TV-2026-0012 — Firstname Lastname"
 *      └─ case:<caseId>                cases without a category sit directly in the type folder
 *         └─ case:<caseId>:<STAGE>     one folder per document stage that has documents
 *            └─ doc:<documentId>       the case document
 *
 * Only accepted documents appear (rejected ones and those still under review stay in the case flow);
 * documents staff produce themselves (contract, visa, other) appear unless rejected.
 *
 * Access: the effective level on the Cases root (role grant ADMIN = DOWNLOAD by default), or DOWNLOAD
 * for the staff member assigned to the case — capped at EXPORT, because files are managed in the case flow.
 */

export const STAGES: DocStage[] = ['INITIAL', 'EMBASSY', 'CONTRACT', 'CONTRACT_SIGNED', 'VISA', 'OTHER'];

const ID = '[a-z0-9]{10,40}';
export const VISA_TYPES: VisaType[] = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'];
/** Folder names of the application types (Azerbaijani, the office language; German terms kept). */
export const VISA_TYPE_FOLDER: Record<VisaType, string> = {
  WORK: 'İş vizası',
  AUSBILDUNG: 'Ausbildung',
  WEITERBILDUNG: 'Weiterbildung',
  JOB_SEEKER: 'İş axtarışı (Chancenkarte)',
  STUDY: 'Təhsil vizası',
  FAMILY: 'Ailə birləşməsi',
  TOURIST: 'Turist vizası',
};
const TYPE_RE = new RegExp(`^vt:(${VISA_TYPES.join('|')})$`);
const CAT_RE = new RegExp(`^vc:(${VISA_TYPES.join('|')}):(${ID})$`);
const CASE_RE = new RegExp(`^case:(${ID})$`);
const STAGE_RE = new RegExp(`^case:(${ID}):(${STAGES.join('|')})$`);
const DOC_RE = new RegExp(`^doc:(${ID})$`);

export type VirtualRef =
  | { kind: 'type'; visaType: VisaType }
  | { kind: 'category'; visaType: VisaType; categoryId: string }
  | { kind: 'case'; caseId: string }
  | { kind: 'stage'; caseId: string; stage: DocStage }
  | { kind: 'doc'; docId: string };

export const isVirtualId = (id: string) => id.startsWith('case:') || id.startsWith('doc:') || id.startsWith('vt:') || id.startsWith('vc:');

/** Parses a virtual id; anything malformed is null (and answers 404 upstream). */
export const parseVirtualId = (id: string): VirtualRef | null => {
  const t = TYPE_RE.exec(id);
  if (t) return { kind: 'type', visaType: t[1] as VisaType };
  const k = CAT_RE.exec(id);
  if (k) return { kind: 'category', visaType: k[1] as VisaType, categoryId: k[2] };
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
  visaType: true,
  visaCategoryId: true,
  visaCategory: { select: { id: true, title: true, visaLabel: true } },
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

/** Documents shown in the drive: accepted client uploads, and staff-made documents unless rejected. */
export const VISIBLE_DOCS: Prisma.DocumentWhereInput = {
  OR: [{ status: 'ACCEPTED' }, { stage: { in: ['CONTRACT', 'CONTRACT_SIGNED', 'VISA', 'OTHER'] }, status: { not: 'REJECTED' } }],
};

const az = (v: unknown) => (v && typeof v === 'object' ? ((v as Record<string, string>).az ?? '') : '');
export const categoryFolderName = (cat: { title: unknown; visaLabel: string }) => `${cat.visaLabel} · ${az(cat.title)}`.trim();
/** Parent folder of a case: its visa category inside the type, or the type folder itself. */
const caseParentId = (c: Pick<CaseRow, 'visaType' | 'visaCategoryId'>) => (c.visaCategoryId ? `vc:${c.visaType}:${c.visaCategoryId}` : `vt:${c.visaType}`);

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
  parentId: casesId && caseParentId(c),
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

const groupItem = (id: string, name: string, parentId: string, level: DriveAccess, count: number, updatedAt: Date): DriveItem => ({
  ...base,
  id,
  kind: 'FOLDER',
  name,
  parentId,
  mimeType: null,
  size: null,
  createdAt: updatedAt,
  updatedAt,
  createdBy: null,
  myAccess: level,
  previewable: false,
  childCount: count,
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

/** Level on the type / category folders: what the Cases root gives (assigned staff: DOWNLOAD), capped at EXPORT. */
const groupLevel = (rootLevel: Level): DriveAccess => minLevel(rootLevel ?? 'DOWNLOAD', 'EXPORT') ?? 'DOWNLOAD';
const scopeOf = (ctx: DriveAccessCtx, rootLevel: Level): Prisma.CaseWhereInput => (allows(rootLevel, 'VIEW') ? {} : { assignedStaffId: ctx.user.id });

/** Children of the Cases root: one folder per kind of application that has cases the user may see. */
export const listCaseTypes = async (ctx: DriveAccessCtx, opts: { status?: CaseStatus } = {}) => {
  const { casesId, rootLevel } = await casesRootAccess(ctx);
  const rows = await prisma.case.groupBy({
    by: ['visaType'],
    where: { ...scopeOf(ctx, rootLevel), ...(opts.status ? { status: opts.status } : {}) },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  const level = groupLevel(rootLevel);
  const byType = new Map(rows.map((r) => [r.visaType, r]));
  const items = VISA_TYPES.filter((vt) => byType.has(vt)).map((vt) =>
    groupItem(`vt:${vt}`, VISA_TYPE_FOLDER[vt], casesId, level, byType.get(vt)!._count._all, byType.get(vt)!._max.updatedAt ?? new Date()),
  );
  return { casesId, rootLevel, items };
};

/** Cases (one virtual folder each) the user may see; optionally only those of one type / category folder. */
export const listCases = async (
  ctx: DriveAccessCtx,
  opts: { status?: CaseStatus; q?: string; take?: number; visaType?: VisaType; categoryId?: string | null } = {},
) => {
  const { casesId, rootLevel } = await casesRootAccess(ctx);
  const where: Prisma.CaseWhereInput = {
    ...scopeOf(ctx, rootLevel),
    ...(opts.visaType ? { visaType: opts.visaType } : {}),
    ...(opts.categoryId !== undefined ? { visaCategoryId: opts.categoryId } : {}),
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
    ? await prisma.document.groupBy({ by: ['caseId', 'stage'], where: { caseId: { in: cases.map((c) => c.id) }, ...VISIBLE_DOCS } })
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
  /** Set for case / stage / document nodes (not for the type and category folders). */
  caseRow?: CaseRow;
  doc?: DocRow;
}

/** Type or category folder: exists when the user can see at least one case in it. */
const loadGroup = async (ctx: DriveAccessCtx, ref: Extract<VirtualRef, { kind: 'type' | 'category' }>): Promise<VirtualNode> => {
  const { casesId, rootLevel } = await casesRootAccess(ctx);
  const where: Prisma.CaseWhereInput = { ...scopeOf(ctx, rootLevel), visaType: ref.visaType, ...(ref.kind === 'category' ? { visaCategoryId: ref.categoryId } : {}) };
  const agg = await prisma.case.aggregate({ where, _count: { _all: true }, _max: { updatedAt: true } });
  if (!agg._count._all) throw notFound('NODE_NOT_FOUND');
  const level = groupLevel(rootLevel);
  if (ref.kind === 'type') {
    return { ref, level, casesId, item: groupItem(`vt:${ref.visaType}`, VISA_TYPE_FOLDER[ref.visaType], casesId, level, agg._count._all, agg._max.updatedAt ?? new Date()) };
  }
  const cat = await prisma.visaCategory.findUnique({ where: { id: ref.categoryId }, select: { title: true, visaLabel: true } });
  if (!cat) throw notFound('NODE_NOT_FOUND');
  return { ref, level, casesId, item: groupItem(`vc:${ref.visaType}:${ref.categoryId}`, categoryFolderName(cat), `vt:${ref.visaType}`, level, agg._count._all, agg._max.updatedAt ?? new Date()) };
};

/** Resolves a virtual id the user may see (else 404) and checks `need` (else 403). */
export const loadVirtual = async (ctx: DriveAccessCtx, id: string, need: DriveAccess): Promise<VirtualNode> => {
  const ref = parseVirtualId(id);
  if (!ref) throw notFound('NODE_NOT_FOUND');
  let out: VirtualNode;
  if (ref.kind === 'type' || ref.kind === 'category') {
    out = await loadGroup(ctx, ref);
  } else if (ref.kind === 'doc') {
    const doc = await prisma.document.findFirst({ where: { id: ref.docId, ...VISIBLE_DOCS }, select: docSelect });
    if (!doc) throw notFound('NODE_NOT_FOUND');
    const { c, level, casesId } = await loadCase(ctx, doc.caseId);
    out = { ref, item: docItem(c, doc, level), level, casesId, caseRow: c, doc };
  } else {
    const { c, level, casesId } = await loadCase(ctx, ref.caseId);
    if (ref.kind === 'case') {
      const stages = await prisma.document.groupBy({ by: ['stage'], where: { caseId: c.id, ...VISIBLE_DOCS } });
      out = { ref, item: caseItem(c, casesId, level, stages.length), level, casesId, caseRow: c };
    } else {
      const agg = await prisma.document.aggregate({ where: { caseId: c.id, stage: ref.stage, ...VISIBLE_DOCS }, _count: { _all: true }, _max: { createdAt: true } });
      out = { ref, item: stageItem(c, ref.stage, level, agg._count._all, agg._max.createdAt ?? c.updatedAt), level, casesId, caseRow: c };
    }
  }
  if (!allows(out.level, need)) throw new HttpError(403, 'INSUFFICIENT_ACCESS');
  return out;
};

/** Children of a virtual folder. */
export const listVirtual = async (ctx: DriveAccessCtx, v: VirtualNode): Promise<DriveItem[]> => {
  if (v.ref.kind === 'type') {
    // Category folders (cases that have a visa category) + cases without one.
    const { rootLevel } = await casesRootAccess(ctx);
    const rows = await prisma.case.groupBy({
      by: ['visaCategoryId'],
      where: { ...scopeOf(ctx, rootLevel), visaType: v.ref.visaType, visaCategoryId: { not: null } },
      _count: { _all: true },
      _max: { updatedAt: true },
    });
    const cats = await prisma.visaCategory.findMany({ where: { id: { in: rows.map((r) => r.visaCategoryId!) } }, select: { id: true, title: true, visaLabel: true, sortOrder: true } });
    const byId = new Map(cats.map((c) => [c.id, c]));
    const folders = rows
      .filter((r) => byId.has(r.visaCategoryId!))
      .sort((a, b) => byId.get(a.visaCategoryId!)!.sortOrder - byId.get(b.visaCategoryId!)!.sortOrder)
      .map((r) => groupItem(`vc:${v.ref.kind === 'type' ? v.ref.visaType : ''}:${r.visaCategoryId}`, categoryFolderName(byId.get(r.visaCategoryId!)!), v.item.id, v.level, r._count._all, r._max.updatedAt ?? new Date()));
    const loose = (await listCases(ctx, { visaType: v.ref.visaType, categoryId: null })).items;
    return [...folders, ...loose];
  }
  if (v.ref.kind === 'category') return (await listCases(ctx, { visaType: v.ref.visaType, categoryId: v.ref.categoryId })).items;
  const c = v.caseRow!;
  if (v.ref.kind === 'case') {
    const rows = await prisma.document.groupBy({ by: ['stage'], where: { caseId: c.id, ...VISIBLE_DOCS }, _count: { _all: true }, _max: { createdAt: true } });
    const byStage = new Map(rows.map((r) => [r.stage, r]));
    return STAGES.filter((s) => byStage.has(s)).map((s) => stageItem(c, s, v.level, byStage.get(s)!._count._all, byStage.get(s)!._max.createdAt ?? c.updatedAt));
  }
  if (v.ref.kind === 'stage') {
    const docs = await prisma.document.findMany({ where: { caseId: c.id, stage: v.ref.stage, ...VISIBLE_DOCS }, select: docSelect, orderBy: { createdAt: 'asc' } });
    return docs.map((d) => docItem(c, d, v.level));
  }
  return [];
};

/** Breadcrumb of a virtual node: Cases › case › stage (› document). */
export const virtualBreadcrumb = (v: VirtualNode, rootLevel: Level): Crumb[] => {
  const crumbs: Crumb[] = [{ id: v.casesId, name: 'Cases', space: 'CASES', system: true, ownerId: null, myAccess: rootLevel }];
  const crumb = (id: string, name: string): Crumb => ({ id, name, space: 'CASES', system: false, ownerId: null, myAccess: v.level });
  if (v.ref.kind === 'type') return [...crumbs, crumb(v.item.id, v.item.name)];
  if (v.ref.kind === 'category') return [...crumbs, crumb(`vt:${v.ref.visaType}`, VISA_TYPE_FOLDER[v.ref.visaType]), crumb(v.item.id, v.item.name)];
  const c = v.caseRow!;
  crumbs.push(crumb(`vt:${c.visaType}`, VISA_TYPE_FOLDER[c.visaType]));
  if (c.visaCategoryId && c.visaCategory) crumbs.push(crumb(`vc:${c.visaType}:${c.visaCategoryId}`, categoryFolderName(c.visaCategory)));
  crumbs.push(crumb(`case:${c.id}`, caseFolderName(c)));
  const stage = v.ref.kind === 'stage' ? v.ref.stage : v.doc?.stage;
  if (stage) crumbs.push({ id: `case:${c.id}:${stage}`, name: stage, space: 'CASES', system: false, ownerId: null, myAccess: v.level });
  if (v.doc) crumbs.push({ id: `doc:${v.doc.id}`, name: v.doc.originalName, space: 'CASES', system: false, ownerId: null, myAccess: v.level });
  return crumbs;
};

export const docFilePath = (storedName: string) => path.join(config.uploads.privateDir, path.basename(storedName));

/** All documents of a virtual folder (for ZIP export / copy), with their path inside it. */
export const virtualFiles = async (v: VirtualNode) => {
  if (v.doc) return [{ rel: v.doc.originalName, doc: v.doc }];
  if (v.ref.kind === 'type' || v.ref.kind === 'category') {
    // A whole type / category: one folder per case ("TV-… — Name · INITIAL"), flat so copies stay simple.
    const docs = await prisma.document.findMany({
      where: { ...VISIBLE_DOCS, case: { visaType: v.ref.visaType, ...(v.ref.kind === 'category' ? { visaCategoryId: v.ref.categoryId } : {}) } },
      select: { ...docSelect, case: { select: { number: true, client: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ caseId: 'asc' }, { stage: 'asc' }, { createdAt: 'asc' }],
      take: 5000,
    });
    return docs.map((d) => ({ rel: `${caseFolderName(d.case)} · ${d.stage}/${d.originalName}`, doc: d }));
  }
  const c = v.caseRow!;
  const where: Prisma.DocumentWhereInput = { caseId: c.id, ...VISIBLE_DOCS, ...(v.ref.kind === 'stage' ? { stage: v.ref.stage } : {}) };
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
      where: { originalName: { contains: q }, case: scope, ...VISIBLE_DOCS },
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
