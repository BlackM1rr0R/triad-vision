import type { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { DriveAccessCtx } from '../drive/access.js';
import { allows } from '../drive/levels.js';
import { OPEN_STAGES, PROCESSING_SELECT, PROCESSING_STAGES, processingSummaries, stageCounts, stageWhere, type ProcessingStage } from './index.js';

/**
 * "İş axını" in the documents section (drive): the client folders per team workflow stage — the same
 * Case.processingStage the case card and the board show (one source of truth). Only cases that have a client
 * folder (Case.driveFolderId) are listed; a folder the viewer may not open in the drive is left out.
 *
 * "In Bearbeitung" holds every open case, so that list is narrowed to what concerns the viewer: cases handed
 * or assigned to them, cases sent back explicitly, and cases changed in the last RECENT_DAYS days.
 */

export const foldersQuery = z.object({
  stage: z.enum(PROCESSING_STAGES).default('WRITTEN'),
  /** "Mənə göndərilənlər": only cases whose next step is the viewer's. */
  mine: z
    .enum(['1', '0', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  search: z.string().trim().max(120).optional(),
});

const LIMIT = 100;
const RECENT_DAYS = 14;
const MAX_DEPTH = 4;

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

/** The narrowed "In Bearbeitung" set (see above). */
const inProgressScope = (viewerId: string): Prisma.CaseWhereInput => ({
  OR: [
    { processingAssigneeId: viewerId },
    { assignedStaffId: viewerId },
    { processingStageById: viewerId },
    { processingStage: 'IN_PROGRESS' },
    { updatedAt: { gte: new Date(Date.now() - RECENT_DAYS * 86_400_000) } },
  ],
});

const baseWhere = (viewerId: string, mine: boolean, search?: string): Prisma.CaseWhereInput => ({
  AND: [
    { driveFolderId: { not: null } },
    mine ? { processingAssigneeId: viewerId } : {},
    search
      ? { OR: [{ number: { contains: search } }, { client: { firstName: { contains: search } } }, { client: { lastName: { contains: search } } }, { client: { passportNumber: { contains: search } } }] }
      : {},
  ],
});

/** Files below each folder (a few levels deep), one query per level for all folders together. */
export const fileCounts = async (rootIds: string[]) => {
  const out = new Map<string, number>(rootIds.map((id) => [id, 0]));
  let level = new Map<string, string>(rootIds.map((id) => [id, id])); // node → its client folder
  for (let depth = 0; depth < MAX_DEPTH && level.size; depth++) {
    const rows = await prisma.driveNode.findMany({ where: { parentId: { in: [...level.keys()] }, deletedAt: null }, select: { id: true, kind: true, parentId: true } });
    const next = new Map<string, string>();
    for (const r of rows) {
      const root = level.get(r.parentId!)!;
      if (r.kind === 'FOLDER') next.set(r.id, root);
      else out.set(root, (out.get(root) ?? 0) + 1);
    }
    level = next;
  }
  return out;
};

/** GET /admin/case-processing/folders — counts per stage + the client folders of one stage. */
export const processingFolders = async (q: z.infer<typeof foldersQuery>, viewer: { id: string; role: Role }) => {
  const base = baseWhere(viewer.id, q.mine, q.search);
  const scope = inProgressScope(viewer.id);
  const [counts, inProgress, waitingForMe] = await Promise.all([
    stageCounts(base),
    prisma.case.count({ where: { AND: [base, stageWhere('IN_PROGRESS'), scope] } }),
    prisma.case.count({ where: { driveFolderId: { not: null }, processingAssigneeId: viewer.id, processingStage: { in: OPEN_STAGES } } }),
  ]);
  counts.IN_PROGRESS = inProgress;

  const stage: ProcessingStage = q.stage;
  const rows = await prisma.case.findMany({
    where: { AND: [base, stageWhere(stage), stage === 'IN_PROGRESS' ? scope : {}] },
    orderBy: [{ processingStageAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    take: LIMIT,
    select: {
      id: true,
      number: true,
      visaType: true,
      driveFolderId: true,
      ...PROCESSING_SELECT,
      client: { select: { firstName: true, lastName: true } },
      visaCategory: { select: { id: true, title: true, visaLabel: true } },
      partner: { select: { id: true, name: true } },
      processingMoves: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { note: true } },
    },
  });

  // Drive permissions: a restricted client folder the viewer cannot open is not listed.
  const ctx = new DriveAccessCtx({ id: viewer.id, role: viewer.role });
  const folderIds = rows.map((r) => r.driveFolderId!);
  await ctx.load(folderIds);
  const visible = rows.filter((r) => {
    const n = ctx.nodes.get(r.driveFolderId!);
    return !!n && !n.deletedAt && allows(ctx.level(n.id), 'VIEW');
  });
  const [summaries, files] = await Promise.all([processingSummaries(visible), fileCounts(visible.map((r) => r.driveFolderId!))]);

  return {
    stage,
    counts,
    waitingForMe,
    total: counts[stage],
    limit: LIMIT,
    recentDays: RECENT_DAYS,
    items: visible.map((r) => ({
      caseId: r.id,
      number: r.number,
      folderId: r.driveFolderId!,
      folderName: ctx.nodes.get(r.driveFolderId!)?.name ?? '',
      clientName: fullName(r.client) || r.number,
      visaType: r.visaType,
      visaCategory: r.visaCategory,
      partner: r.partner,
      status: r.status,
      processing: summaries.get(r.id)!,
      lastNote: r.processingMoves[0]?.note ?? null,
      fileCount: files.get(r.driveFolderId!) ?? 0,
    })),
  };
};
