import type { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { DriveAccessCtx } from '../drive/access.js';
import { allows } from '../drive/levels.js';
import { loadMaskingSettings, maskedGroupsFor } from '../privacy/mask.js';
import { effectiveStage, emptyStageCounts, OPEN_STAGES, PROCESSING_SELECT, PROCESSING_STAGES, processingSummaries, type ProcessingStage } from './index.js';

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

/**
 * Search: case number and client name by substring. A passport number only matches as the exact full value (no
 * guessing a number digit by digit through the result list), and only for viewers who see passport numbers
 * unmasked (lib/privacy/mask: masked roles never find a case by its passport).
 */
const baseWhere = (viewerId: string, mine: boolean, search: string | undefined, passportSearch: boolean): Prisma.CaseWhereInput => {
  const passport = search?.replace(/\s+/g, '').toUpperCase() ?? '';
  return {
    AND: [
      { driveFolderId: { not: null } },
      mine ? { processingAssigneeId: viewerId } : {},
      search
        ? {
            OR: [
              { number: { contains: search } },
              { client: { firstName: { contains: search } } },
              { client: { lastName: { contains: search } } },
              ...(passportSearch && passport.length >= 5 ? [{ client: { passportNumber: passport } }] : []),
            ],
          }
        : {},
    ],
  };
};

/** Whether the viewer sees passport numbers in plaintext (only they may search by one). */
const seesPassports = async (viewer: { role: Role }) => !maskedGroupsFor(viewer, await loadMaskingSettings()).has('PASSPORT');

const DAY_MS = 86_400_000;
type ScopeRow = {
  processingAssigneeId: string | null;
  assignedStaffId: string | null;
  processingStageById: string | null;
  processingStage: string | null;
  updatedAt: Date;
};
/** The narrowed "In Bearbeitung" set (see above): handed / assigned to the viewer, sent back, or changed recently. */
const inScope = (r: ScopeRow, viewerId: string, now: number) =>
  r.processingAssigneeId === viewerId ||
  r.assignedStaffId === viewerId ||
  r.processingStageById === viewerId ||
  r.processingStage === 'IN_PROGRESS' ||
  r.updatedAt.getTime() >= now - RECENT_DAYS * DAY_MS;

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
  const base = baseWhere(viewer.id, q.mine, q.search, await seesPassports(viewer));
  const stage: ProcessingStage = q.stage;
  const now = Date.now();

  // Drive permissions first: a restricted client folder the viewer cannot open is neither listed nor counted.
  // One light query for every candidate case (the stage counts need all of them), then the folder check.
  const [candidates, waiting] = await Promise.all([
    prisma.case.findMany({
      where: base,
      select: { id: true, driveFolderId: true, status: true, processingStage: true, processingStageAt: true, processingAssigneeId: true, assignedStaffId: true, processingStageById: true, updatedAt: true },
    }),
    prisma.case.findMany({ where: { driveFolderId: { not: null }, processingAssigneeId: viewer.id, processingStage: { in: OPEN_STAGES } }, select: { driveFolderId: true } }),
  ]);
  const ctx = new DriveAccessCtx({ id: viewer.id, role: viewer.role });
  await ctx.load([...candidates.map((r) => r.driveFolderId!), ...waiting.map((r) => r.driveFolderId!)]);
  const canOpen = (folderId: string) => {
    const n = ctx.nodes.get(folderId);
    return !!n && !n.deletedAt && allows(ctx.level(n.id), 'VIEW');
  };

  const counts = emptyStageCounts();
  const inStage: typeof candidates = [];
  for (const r of candidates) {
    if (!canOpen(r.driveFolderId!)) continue;
    const st = effectiveStage(r.processingStage, r.status);
    if (!st) continue;
    // "In Bearbeitung" holds every open case: counted and listed only within the viewer's scope.
    if (st === 'IN_PROGRESS' && !inScope(r, viewer.id, now)) continue;
    counts[st]++;
    if (st === stage) inStage.push(r);
  }
  const waitingForMe = waiting.filter((r) => canOpen(r.driveFolderId!)).length;

  // Newest hand-over first (cases never moved last), then the last change.
  inStage.sort(
    (a, b) =>
      (a.processingStageAt ? 0 : 1) - (b.processingStageAt ? 0 : 1) ||
      (b.processingStageAt?.getTime() ?? 0) - (a.processingStageAt?.getTime() ?? 0) ||
      b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  const pageIds = inStage.slice(0, LIMIT).map((r) => r.id);
  const order = new Map(pageIds.map((id, i) => [id, i]));
  const rows = (
    await prisma.case.findMany({
      where: { id: { in: pageIds } },
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
    })
  ).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const [summaries, files] = await Promise.all([processingSummaries(rows), fileCounts(rows.map((r) => r.driveFolderId!))]);

  return {
    stage,
    counts,
    waitingForMe,
    total: counts[stage],
    limit: LIMIT,
    recentDays: RECENT_DAYS,
    items: rows.map((r) => ({
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
