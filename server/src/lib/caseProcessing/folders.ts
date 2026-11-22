import type { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { DriveAccessCtx } from '../drive/access.js';
import { allows } from '../drive/levels.js';
import { maskGroupsForViewer } from '../privacy/mask.js';
import { scoped } from '../accessAudit/scope.js';
import { lastSentAt } from '../clientFolders/sent.js';
import { peekWorkflowFolders } from '../drive/workflowFolders.js';
import { effectiveStage, emptyStageCounts, OPEN_STAGES, PROCESSING_SELECT, PROCESSING_STAGES, processingSummaries, type ProcessingStage } from './index.js';

/**
 * "İş axını" in the documents section (drive): the client folders per team workflow stage — the same
 * Case.processingStage the case card and the board show (one source of truth). Only cases that have a client
 * folder (Case.driveFolderId) are listed; a folder the viewer may not open in the drive is left out.
 *
 * Every stage holds only the cases somebody moved there (nothing stored = not in the workflow): "In Bearbeitung"
 * is no longer the default of every open case, so it is listed in full like the other stages. The copied
 * folders and files of each stage live in the stage folders of the drive (lib/drive/workflowFolders).
 */

export const foldersQuery = z.object({
  stage: z.enum(PROCESSING_STAGES).default('WRITTEN'),
  /** "Mənə göndərilənlər": only cases whose next step is the viewer's. */
  mine: z
    .enum(['1', '0', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  search: z.string().trim().max(120).optional(),
  /** Filters of the stage list (Fertig view): employer, group (the folder the client folder lies in), hand-over date range, sent to the client. */
  company: z.string().trim().min(1).max(40).optional(),
  group: z.string().trim().min(1).max(40).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sent: z.enum(['sent', 'unsent']).optional(),
});

const LIMIT = 100;
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
const seesPassports = async (viewer: { role: Role; id?: string }) => !(await maskGroupsForViewer(viewer)).has('PASSPORT');

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
export const processingFolders = async (q: z.infer<typeof foldersQuery>, viewer: { id: string; role: Role }, scope: Prisma.CaseWhereInput = {}) => {
  // `scope` = the viewer's staff case scope (lib/access; {} = every case): counts and folders over in-scope cases only.
  const base = scoped(baseWhere(viewer.id, q.mine, q.search, await seesPassports(viewer)), scope);
  const stage: ProcessingStage = q.stage;

  // Drive permissions first: a restricted client folder the viewer cannot open is neither listed nor counted.
  // One light query for every candidate case (the stage counts need all of them), then the folder check.
  const [candidates, waiting] = await Promise.all([
    prisma.case.findMany({
      where: { AND: [base, { processingStage: { not: null } }] },
      select: { id: true, driveFolderId: true, companyId: true, status: true, processingStage: true, processingStageAt: true, updatedAt: true },
    }),
    prisma.case.findMany({ where: scoped({ driveFolderId: { not: null }, processingAssigneeId: viewer.id, processingStage: { in: OPEN_STAGES } }, scope), select: { driveFolderId: true } }),
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
    counts[st]++;
    if (st === stage) inStage.push(r);
  }
  const waitingForMe = waiting.filter((r) => canOpen(r.driveFolderId!)).length;

  // Fertig: documents copied straight into the Fertig folder belong to the list too (they can be sent to the client
  // from here) although the case itself is not in the stage — listed, not counted.
  if (stage === 'DONE') {
    const wf = await peekWorkflowFolders();
    const linked = wf ? await prisma.driveNode.findMany({ where: { parentId: wf.stages.DONE, kind: 'FOLDER', deletedAt: null, workflowCaseId: { not: null } }, select: { workflowCaseId: true } }) : [];
    const have = new Set(inStage.map((r) => r.id));
    const ids = [...new Set(linked.map((l) => l.workflowCaseId!))].filter((id) => !have.has(id));
    if (ids.length) {
      const extra = await prisma.case.findMany({
        where: { AND: [base, { id: { in: ids } }, { OR: [{ processingStage: null }, { processingStage: { not: 'DONE' } }] }] },
        select: { id: true, driveFolderId: true, companyId: true, status: true, processingStage: true, processingStageAt: true, updatedAt: true },
      });
      await ctx.load(extra.map((r) => r.driveFolderId!));
      for (const r of extra) if (canOpen(r.driveFolderId!)) inStage.push(r);
    }
  }

  // Newest hand-over first (cases never moved last), then the last change.
  inStage.sort(
    (a, b) =>
      (a.processingStageAt ? 0 : 1) - (b.processingStageAt ? 0 : 1) ||
      (b.processingStageAt?.getTime() ?? 0) - (a.processingStageAt?.getTime() ?? 0) ||
      b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  // Filter options come from the whole stage (before the filters), the filters narrow the list.
  const groupOf = (r: (typeof inStage)[number]) => ctx.nodes.get(r.driveFolderId!)?.parentId ?? null;
  const companyIds = [...new Set(inStage.map((r) => r.companyId).filter((x): x is string => !!x))];
  const companyRows = companyIds.length ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }) : [];
  const companyName = new Map(companyRows.map((c) => [c.id, c.name]));
  const groupIds = [...new Set(inStage.map(groupOf).filter((x): x is string => !!x))];
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const options = {
    companies: companyIds.map((id) => ({ id, name: companyName.get(id) ?? id })).sort(byName),
    groups: groupIds.map((id) => ({ id, name: ctx.nodes.get(id)?.name ?? id })).sort(byName),
  };
  const sentAt = q.sent || stage === 'DONE' ? await lastSentAt(inStage.map((r) => r.id)) : new Map<string, Date>();
  const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`).getTime();
  const from = q.from ? dayStart(q.from) : null;
  const to = q.to ? dayStart(q.to) + 24 * 3600 * 1000 : null;
  const filtered = inStage.filter((r) => {
    if (q.company && r.companyId !== q.company) return false;
    if (q.group && groupOf(r) !== q.group) return false;
    const at = r.processingStageAt?.getTime() ?? r.updatedAt.getTime();
    if ((from !== null && at < from) || (to !== null && at >= to)) return false;
    if (q.sent === 'sent' && !sentAt.has(r.id)) return false;
    if (q.sent === 'unsent' && sentAt.has(r.id)) return false;
    return true;
  });
  const pageIds = filtered.slice(0, LIMIT).map((r) => r.id);
  const order = new Map(pageIds.map((id, i) => [id, i]));
  const rows = (
    await prisma.case.findMany({
      where: { id: { in: pageIds } },
      select: {
        id: true,
        number: true,
        visaType: true,
        driveFolderId: true,
        companyId: true,
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
    total: filtered.length,
    options,
    limit: LIMIT,
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
      company: r.companyId ? { id: r.companyId, name: companyName.get(r.companyId) ?? '' } : null,
      group: (() => {
        const g = ctx.nodes.get(r.driveFolderId!)?.parentId;
        return g ? { id: g, name: ctx.nodes.get(g)?.name ?? '' } : null;
      })(),
      readySentAt: sentAt.get(r.id) ?? null,
      fileCount: files.get(r.driveFolderId!) ?? 0,
    })),
  };
};
