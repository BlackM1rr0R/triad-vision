import type { CaseStatus, Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { badRequest, conflict, notFound } from '../http.js';
import { invalidateMyWork } from '../myWork.js';
import { notifyUser } from '../notifications.js';
import { processingTexts, stageLabel } from './texts.js';

/**
 * Team document workflow of a case — a lightweight hand-over between two staff members, independent of the
 * client-facing CaseStatus, the drive board (DocWorkflowStage) and the four-eyes check of the embassy package:
 *
 *   In Bearbeitung (default, nothing stored) → Schon geschrieben (WRITTEN: documents prepared, ready for the
 *   second person) → Fertig (DONE) · Ablehnung (REFUSED: the visa was refused).
 *
 * Every move is kept (CaseProcessingMove: from, to, who, when, note, next assignee); the optional assignee is
 * notified and sees the case in "my work" until they move it on. A case counts as refused for the partner
 * statistics when CaseStatus is REJECTED or the team marked it "Ablehnung" (unless the visa was approved).
 */

export const PROCESSING_STAGES = ['IN_PROGRESS', 'WRITTEN', 'DONE', 'REFUSED'] as const;
export type ProcessingStage = (typeof PROCESSING_STAGES)[number];
export const isStage = (v: unknown): v is ProcessingStage => typeof v === 'string' && (PROCESSING_STAGES as readonly string[]).includes(v);

/** Stages that still wait for somebody (the assignee sees them in "my work"). */
export const OPEN_STAGES: ProcessingStage[] = ['IN_PROGRESS', 'WRITTEN'];

/** The stage shown for a case: the stored one; nothing stored = "In Bearbeitung" while the case is open, none once closed. */
export const effectiveStage = (stored: string | null | undefined, status: CaseStatus): ProcessingStage | null =>
  isStage(stored) ? stored : FINAL_STATUSES.includes(status) ? null : 'IN_PROGRESS';

/** Where-clause of the cases whose effective stage is `stage`. */
export const stageWhere = (stage: ProcessingStage): Prisma.CaseWhereInput =>
  stage === 'IN_PROGRESS' ? { OR: [{ processingStage: 'IN_PROGRESS' }, { processingStage: null, status: { notIn: FINAL_STATUSES } }] } : { processingStage: stage };

/** Visa refused: CaseStatus REJECTED, or marked "Ablehnung" by the team (an approved visa wins). */
export const isRefused = (c: { status: CaseStatus; processingStage?: string | null }) => c.status === 'REJECTED' || (c.processingStage === 'REFUSED' && c.status !== 'APPROVED');
export const refusedWhere: Prisma.CaseWhereInput = { OR: [{ status: 'REJECTED' }, { processingStage: 'REFUSED', status: { not: 'APPROVED' } }] };

export type StageCounts = Record<ProcessingStage, number>;
export const emptyStageCounts = (): StageCounts => ({ IN_PROGRESS: 0, WRITTEN: 0, DONE: 0, REFUSED: 0 });

/** Effective-stage counts of the cases matching `where` (two queries). */
export const stageCounts = async (where: Prisma.CaseWhereInput = {}): Promise<StageCounts> => {
  const [stored, blank] = await Promise.all([
    prisma.case.groupBy({ by: ['processingStage'], where: { AND: [where, { processingStage: { not: null } }] }, _count: { _all: true } }),
    prisma.case.count({ where: { AND: [where, { processingStage: null, status: { notIn: FINAL_STATUSES } }] } }),
  ]);
  const out = emptyStageCounts();
  for (const r of stored) if (isStage(r.processingStage)) out[r.processingStage] += r._count._all;
  out.IN_PROGRESS += blank;
  return out;
};

// ─── People ───────────────────────────────────────────────────────────

export interface Person {
  id: string;
  name: string;
}
const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');
const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];

export const peopleById = async (ids: (string | null | undefined)[]) => {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const rows = unique.length ? await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } }) : [];
  return new Map<string, Person>(rows.map((u) => [u.id, { id: u.id, name: fullName(u) }]));
};

/** The processing summary of list rows (cases list, partner detail, board): stage, since, by whom, next assignee. */
export interface ProcessingSummary {
  stage: ProcessingStage | null;
  at: Date | null;
  by: Person | null;
  assignee: Person | null;
}

type SummaryRow = { status: CaseStatus; processingStage: string | null; processingStageAt: Date | null; processingStageById: string | null; processingAssigneeId: string | null };

export const processingSummaries = async <T extends SummaryRow & { id: string }>(rows: T[]) => {
  const people = await peopleById(rows.flatMap((r) => [r.processingStageById, r.processingAssigneeId]));
  return new Map<string, ProcessingSummary>(
    rows.map((r) => [
      r.id,
      {
        stage: effectiveStage(r.processingStage, r.status),
        at: r.processingStageAt,
        by: r.processingStageById ? (people.get(r.processingStageById) ?? null) : null,
        assignee: r.processingAssigneeId ? (people.get(r.processingAssigneeId) ?? null) : null,
      },
    ]),
  );
};

export const PROCESSING_SELECT = { status: true, processingStage: true, processingStageAt: true, processingStageById: true, processingAssigneeId: true } as const;

// ─── Move ─────────────────────────────────────────────────────────────

export const moveSchema = z.object({
  stage: z.enum(PROCESSING_STAGES),
  /** Who takes the next step (notified, "my work"); empty = nobody in particular. */
  assigneeId: z.string().trim().min(1).max(40).nullish(),
  note: z.string().trim().max(2000).nullish(),
  /** Where the move was made: 'drive' (the documents section) links the notification to the client folder. */
  origin: z.enum(['case', 'drive']).optional(),
});

const caseLink = (id: string) => `/admin/cases/${id}#case-processing`;
/** The client folder in the documents section ("Sənədlər"), else the case page. */
export const driveFolderLink = (caseId: string, folderId: string | null | undefined) => (folderId ? `/workspace/drive/f/${encodeURIComponent(folderId)}` : caseLink(caseId));

export const moveStage = async (caseId: string, actor: { id: string; firstName: string; lastName: string }, input: z.infer<typeof moveSchema>) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, number: true, driveFolderId: true, ...PROCESSING_SELECT, client: { select: { firstName: true, lastName: true } } },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  let assignee: { id: string; locale: 'az' | 'de' | 'en' | 'ru' } | null = null;
  if (input.assigneeId) {
    assignee = await prisma.user.findFirst({ where: { id: input.assigneeId, isActive: true, role: { in: STAFF_ROLES } }, select: { id: true, locale: true } });
    if (!assignee) throw badRequest('INVALID_ASSIGNEE');
  }
  const from = effectiveStage(c.processingStage, c.status);
  const note = input.note || null;
  if (from === input.stage && (assignee?.id ?? null) === c.processingAssigneeId && !note) throw conflict('PROCESSING_UNCHANGED');
  const previousBy = c.processingStageById;
  const previousAssignee = c.processingAssigneeId;
  const now = new Date();
  await prisma.$transaction([
    prisma.caseProcessingMove.create({ data: { caseId, fromStage: from, toStage: input.stage, actorId: actor.id, assigneeId: assignee?.id ?? null, note, createdAt: now } }),
    prisma.case.update({
      where: { id: caseId },
      data: { processingStage: input.stage, processingStageAt: now, processingStageById: actor.id, processingAssigneeId: assignee?.id ?? null },
    }),
    prisma.caseEvent.create({
      data: { caseId, type: 'PROCESSING_STAGE', note: `${stageLabel(from)} → ${stageLabel(input.stage)}${note ? `: ${note}` : ''}`, actorId: actor.id, visibleToClient: false },
    }),
  ]);

  const p = { number: c.number, worker: fullName(c.client) || c.number, by: fullName(actor), stage: stageLabel(input.stage), note };
  // A move made in the documents section links straight to the client folder there.
  const link = input.origin === 'drive' ? driveFolderLink(caseId, c.driveFolderId) : caseLink(caseId);
  // The next assignee: "X sent you Schon geschrieben" (+ "open the folder and press Götür").
  if (assignee && assignee.id !== actor.id) {
    const tx = processingTexts(assignee.locale);
    const body = tx.assignedBody(p) + (input.stage === 'WRITTEN' ? `\n${tx.claimHint}` : '');
    const title = tx.assignedTitle(p) + (input.stage === 'WRITTEN' ? ` — ${tx.claimShort}` : '');
    await notifyUser(assignee.id, { type: 'PROCESSING_STAGE', title, body, link, caseId, email: false }).catch(() => undefined);
  }
  // Finished or refused: whoever moved it before (usually the one who wrote the documents) hears about it.
  if ((input.stage === 'DONE' || input.stage === 'REFUSED') && previousBy && previousBy !== actor.id && previousBy !== assignee?.id) {
    const u = await prisma.user.findFirst({ where: { id: previousBy, isActive: true }, select: { id: true, locale: true } });
    if (u) {
      const tx = processingTexts(u.locale);
      await notifyUser(u.id, { type: 'PROCESSING_STAGE', title: tx.movedTitle(p), body: tx.movedBody(p), link, caseId, email: false }).catch(() => undefined);
    }
  }
  for (const id of [actor.id, assignee?.id, previousAssignee]) if (id) invalidateMyWork(id);
  invalidateMyWork();
  return { from, to: input.stage };
};

// ─── Claim ("Götür") ──────────────────────────────────────────────────

export const claimSchema = z.object({
  /** Take it over although a colleague already claimed it (the UI asks first). */
  force: z.boolean().optional(),
  origin: z.enum(['case', 'drive']).optional(),
});

/**
 * "Götür": the viewer takes the case of an open stage (usually "Schon geschrieben") — it becomes their
 * assignee, so colleagues see "X işləyir" and it shows in their "my work". Stage, sender and time stay as
 * they are (the sender still hears about Fertig / Ablehnung). Idempotent: claiming one's own case changes
 * nothing. A case a colleague claimed answers 409 PROCESSING_CLAIMED_BY_OTHER unless `force`.
 */
export const claimCase = async (caseId: string, actor: { id: string; firstName: string; lastName: string }, input: z.infer<typeof claimSchema>) => {
  // Check-then-write is raced by a colleague pressing "Götür" at the same moment: the update is conditional on
  // the assignee (and stage) still being what was read, and the move / event rows are written only when it won.
  // With `force` a lost race simply re-reads and tries again (a few times).
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, number: true, driveFolderId: true, ...PROCESSING_SELECT, client: { select: { firstName: true, lastName: true } } },
    });
    if (!c) throw notFound('CASE_NOT_FOUND');
    const stage = effectiveStage(c.processingStage, c.status);
    if (!stage || !OPEN_STAGES.includes(stage)) throw conflict('PROCESSING_NOT_OPEN');
    if (c.processingAssigneeId === actor.id) return { claimed: false, stage, previousAssigneeId: actor.id };
    if (c.processingAssigneeId && !input.force) throw conflict('PROCESSING_CLAIMED_BY_OTHER');
    const previous = c.processingAssigneeId;
    const now = new Date();
    const won = await prisma.$transaction(async (tx) => {
      // The stage is stored (nothing stored = In Bearbeitung) so "my work" finds it; who sent it and when stay.
      const res = await tx.case.updateMany({
        where: { id: caseId, processingAssigneeId: previous, processingStage: c.processingStage, status: c.status },
        data: { processingStage: stage, processingAssigneeId: actor.id },
      });
      if (res.count === 0) return false;
      await tx.caseProcessingMove.create({ data: { caseId, fromStage: stage, toStage: stage, actorId: actor.id, assigneeId: actor.id, note: null, createdAt: now } });
      await tx.caseEvent.create({ data: { caseId, type: 'PROCESSING_STAGE', note: `${stageLabel(stage)}: übernommen von ${fullName(actor)}`, actorId: actor.id, visibleToClient: false } });
      return true;
    });
    if (!won) {
      if (input.force) continue;
      // Someone else changed it in between: their claim wins unless it was the viewer's own (double click).
      const now2 = await prisma.case.findUnique({ where: { id: caseId }, select: { processingAssigneeId: true } });
      if (now2?.processingAssigneeId === actor.id) return { claimed: false, stage, previousAssigneeId: actor.id };
      throw conflict('PROCESSING_CLAIMED_BY_OTHER');
    }
    return finishClaim(c, stage, previous, actor, input);
  }
  throw conflict('PROCESSING_CLAIMED_BY_OTHER');
};

const finishClaim = async (
  c: { id: string; number: string; driveFolderId: string | null; processingStageById: string | null; client: { firstName: string; lastName: string } },
  stage: ProcessingStage,
  previous: string | null,
  actor: { id: string; firstName: string; lastName: string },
  input: z.infer<typeof claimSchema>,
) => {
  const caseId = c.id;
  const p = { number: c.number, worker: fullName(c.client) || c.number, by: fullName(actor), stage: stageLabel(stage), note: null };
  const link = input.origin === 'case' ? caseLink(caseId) : driveFolderLink(caseId, c.driveFolderId);
  // The sender (and a colleague it was taken from) hear who works on it now.
  const told = new Set<string>();
  for (const id of [c.processingStageById, previous]) {
    if (!id || id === actor.id || told.has(id)) continue;
    told.add(id);
    const u = await prisma.user.findFirst({ where: { id, isActive: true }, select: { id: true, locale: true } });
    if (!u) continue;
    const tx = processingTexts(u.locale);
    await notifyUser(u.id, { type: 'PROCESSING_STAGE', title: tx.claimedTitle(p), body: tx.claimedBody(p), link, caseId, email: false }).catch(() => undefined);
  }
  for (const id of [actor.id, previous, c.processingStageById]) if (id) invalidateMyWork(id);
  invalidateMyWork();
  return { claimed: true, stage, previousAssigneeId: previous };
};

// ─── Case view ────────────────────────────────────────────────────────

const MAX_FILES = 300;
const MAX_DEPTH = 4;

/** Files in the client's drive folder (and its sub-folders, a few levels deep), newest first. */
const folderFiles = async (folderId: string | null) => {
  if (!folderId) return [];
  const root = await prisma.driveNode.findFirst({ where: { id: folderId, deletedAt: null }, select: { id: true, name: true } });
  if (!root) return [];
  const paths = new Map<string, string>([[root.id, '']]);
  const files: { id: string; name: string; parentId: string; path: string; mimeType: string | null; size: number | null; updatedAt: Date; workflowStage: string | null; documentId: string | null }[] = [];
  let level = [root.id];
  for (let depth = 0; depth < MAX_DEPTH && level.length && files.length < MAX_FILES; depth++) {
    const rows = await prisma.driveNode.findMany({
      where: { parentId: { in: level }, deletedAt: null },
      select: { id: true, kind: true, name: true, parentId: true, mimeType: true, size: true, updatedAt: true, workflowStage: true, documentId: true },
      orderBy: { name: 'asc' },
      take: MAX_FILES * 2,
    });
    const next: string[] = [];
    for (const r of rows) {
      const parentPath = paths.get(r.parentId!) ?? '';
      if (r.kind === 'FOLDER') {
        paths.set(r.id, parentPath ? `${parentPath} / ${r.name}` : r.name);
        next.push(r.id);
      } else if (files.length < MAX_FILES) {
        files.push({ id: r.id, name: r.name, parentId: r.parentId!, path: parentPath, mimeType: r.mimeType, size: r.size, updatedAt: r.updatedAt, workflowStage: r.workflowStage, documentId: r.documentId });
      }
    }
    level = next;
  }
  return files.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
};

/** GET /admin/cases/:id/processing — stage, history and the documents the second person works with. */
export const processingView = async (caseId: string) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      number: true,
      driveFolderId: true,
      ...PROCESSING_SELECT,
      processingMoves: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 },
      documents: {
        where: { status: { not: 'REJECTED' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, originalName: true, status: true, stage: true, mimeType: true, size: true, createdAt: true, requirement: { select: { title: true } } },
      },
    },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const people = await peopleById([c.processingStageById, c.processingAssigneeId, ...c.processingMoves.flatMap((m) => [m.actorId, m.assigneeId])]);
  const files = await folderFiles(c.driveFolderId);
  const copied = new Set(files.map((f) => f.documentId).filter(Boolean));
  return {
    stage: effectiveStage(c.processingStage, c.status),
    stored: isStage(c.processingStage) ? c.processingStage : null,
    at: c.processingStageAt,
    by: c.processingStageById ? (people.get(c.processingStageById) ?? null) : null,
    assignee: c.processingAssigneeId ? (people.get(c.processingAssigneeId) ?? null) : null,
    refused: isRefused(c),
    history: c.processingMoves.map((m) => ({
      id: m.id,
      fromStage: m.fromStage,
      toStage: m.toStage,
      by: m.actorId ? (people.get(m.actorId) ?? null) : null,
      assignee: m.assigneeId ? (people.get(m.assigneeId) ?? null) : null,
      note: m.note,
      createdAt: m.createdAt,
    })),
    documents: {
      folderId: c.driveFolderId,
      files: files.map(({ documentId: _d, ...f }) => ({ ...f, link: `/workspace/drive/f/${encodeURIComponent(f.parentId)}?item=${encodeURIComponent(f.id)}` })),
      // Uploaded case documents that have no copy in the folder yet.
      uploads: c.documents
        .filter((d) => !copied.has(d.id))
        .map((d) => ({ id: d.id, name: d.originalName, status: d.status, stage: d.stage, mimeType: d.mimeType, size: d.size, createdAt: d.createdAt, requirement: d.requirement?.title ?? null, url: `/api/files/${d.id}` })),
    },
  };
};

// ─── Board ────────────────────────────────────────────────────────────

export const boardQuery = z.object({
  partnerId: z.string().trim().min(1).max(40).optional(),
  /** 'me' = cases waiting for the viewer (assignee), else a staff id. */
  assignee: z.string().trim().min(1).max(40).optional(),
  search: z.string().trim().max(120).optional(),
});

const BOARD_LIMIT = 40;

/** GET /admin/case-processing/board — the cases per stage (newest move first), with totals. */
export const processingBoard = async (q: z.infer<typeof boardQuery>, viewerId: string) => {
  const base: Prisma.CaseWhereInput = {
    ...(q.partnerId ? { partnerId: q.partnerId === 'none' ? null : q.partnerId } : {}),
    ...(q.assignee ? { processingAssigneeId: q.assignee === 'me' ? viewerId : q.assignee } : {}),
    ...(q.search
      ? { OR: [{ number: { contains: q.search } }, { client: { firstName: { contains: q.search } } }, { client: { lastName: { contains: q.search } } }] }
      : {}),
  };
  const counts = await stageCounts(base);
  const columns = await Promise.all(
    PROCESSING_STAGES.map(async (stage) => {
      const rows = await prisma.case.findMany({
        where: { AND: [base, stageWhere(stage)] },
        orderBy: [{ processingStageAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
        take: BOARD_LIMIT,
        select: {
          id: true,
          number: true,
          visaType: true,
          ...PROCESSING_SELECT,
          client: { select: { firstName: true, lastName: true } },
          visaCategory: { select: { id: true, title: true, visaLabel: true } },
          partner: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          processingMoves: { orderBy: { createdAt: 'desc' }, take: 1, select: { note: true } },
        },
      });
      const summaries = await processingSummaries(rows);
      return {
        stage,
        total: counts[stage],
        items: rows.map(({ processingMoves, processingStage: _s, processingStageAt: _a, processingStageById: _b, processingAssigneeId: _c, ...r }) => ({
          ...r,
          processing: summaries.get(r.id)!,
          lastNote: processingMoves[0]?.note ?? null,
        })),
      };
    }),
  );
  return { columns };
};
