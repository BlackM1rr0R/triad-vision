import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, badRequest, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { DriveAccessCtx, requireNode } from '../lib/drive/access.js';
import { copyNodeInto } from '../lib/drive/copy.js';
import { pickFreeName, siblingNames } from '../lib/drive/names.js';
import { assertNoFinalInside } from '../lib/drive/org/final.js';
import {
  COPY_STAGES,
  STAGE_FOLDER_NAME,
  WORKFLOW_STAGES,
  assertCanSend,
  assertNotWorkflowFolder,
  copyPathOf,
  ensurePath,
  ensureWorkflowFolders,
  placeOf,
  pruneEmpty,
  type WorkflowStage,
} from '../lib/drive/workflowFolders.js';
import { logDriveActivity } from '../lib/driveCollab/activity.js';
import { assertNotLockedByOther } from '../lib/driveCollab/lock.js';

/**
 * "İş axını" stage folders of the drive (lib/drive/workflowFolders), mounted inside the drive router (STAFF+):
 *
 *   GET  /api/drive/workflow/folders   the workflow folder and the four stage folders (ids, names, item counts)
 *   POST /api/drive/workflow/copy      { ids, stage: WRITTEN | DONE | REFUSED }   recursive copy, structure kept
 *   POST /api/drive/workflow/send      { ids, stage }   Schon geschrieben → In Bearbeitung → Fertig / Ablehnung
 *
 * Copy needs DOWNLOAD (files) / EXPORT (folders) on the source and EDIT on the stage folder; send needs EDIT on
 * the item and the target stage (like a move: no item locked by a colleague, nothing "Final" inside). Every item
 * is audited (DRIVE_WORKFLOW_COPIED / DRIVE_WORKFLOW_SENT) and shows in the folder journal (COPY / MOVE).
 */
export const driveWorkflowRouter = Router();

const ctxOf = (req: Request) => new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });
const idList = z.array(z.string().min(1).max(120)).min(1).max(500);

type BatchResult = { id: string; ok: boolean; error?: string; name?: string; stage?: string; folderId?: string };
const batch = async (ids: string[], fn: (id: string) => Promise<Partial<BatchResult>>) => {
  const results: BatchResult[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      results.push({ id, ok: true, ...(await fn(id)) });
    } catch (err) {
      if (err instanceof HttpError) results.push({ id, ok: false, error: err.code });
      else throw err;
    }
  }
  return results;
};

driveWorkflowRouter.get('/workflow/folders', async (req, res) => {
  const wf = await ensureWorkflowFolders();
  const ctx = ctxOf(req);
  const ids = [wf.rootId, ...WORKFLOW_STAGES.map((st) => wf.stages[st])];
  await ctx.load(ids);
  const counts = await prisma.driveNode.groupBy({ by: ['parentId'], where: { parentId: { in: ids }, deletedAt: null }, _count: { _all: true } });
  const countOf = new Map(counts.map((c) => [c.parentId, c._count._all]));
  const level = (id: string) => ctx.level(id);
  res.json({
    root: { id: wf.rootId, name: ctx.nodes.get(wf.rootId)?.name ?? '', myAccess: level(wf.rootId) },
    stages: WORKFLOW_STAGES.map((stage) => {
      const id = wf.stages[stage];
      return { stage, id, name: ctx.nodes.get(id)?.name ?? STAGE_FOLDER_NAME[stage], myAccess: level(id), count: countOf.get(id) ?? 0 };
    }),
  });
});

driveWorkflowRouter.post('/workflow/copy', async (req, res) => {
  const { ids, stage } = parse(z.object({ ids: idList, stage: z.enum(COPY_STAGES) }), req.body);
  const wf = await ensureWorkflowFolders();
  const ctx = ctxOf(req);
  const me = req.user!.id;
  const stageId = wf.stages[stage];
  const { node: stageFolder } = await requireNode(ctx, stageId, 'EDIT');
  // Free names per target folder, shared by the items of this request (two copies of "Pass.pdf" → "Pass (2).pdf").
  const takenBy = new Map<string, Set<string>>();
  const results = await batch(ids, async (id) => {
    assertNotWorkflowFolder(wf, id);
    await requireNode(ctx, id, 'VIEW');
    const path = await copyPathOf(ctx, wf, id);
    const parentId = await ensurePath(stageId, path, me);
    if (!takenBy.has(parentId)) takenBy.set(parentId, await siblingNames(parentId));
    const r = await copyNodeInto(ctx, me, id, { id: parentId, space: stageFolder.space, ownerId: stageFolder.ownerId }, takenBy.get(parentId)!);
    await audit(req, 'DRIVE_WORKFLOW_COPIED', `drive:${id}`, { name: r.node.name, stage, to: parentId, copyId: r.newId, nodes: r.nodes });
    await logDriveActivity({ nodeId: r.newId, folderId: parentId, actorId: me, action: 'COPY', name: r.name, meta: { sourceId: id, fromId: r.node.parentId, toId: parentId, toName: STAGE_FOLDER_NAME[stage], kind: r.node.kind, workflow: stage } });
    return { name: r.name, stage, folderId: parentId };
  });
  res.json({ results, stage, folderId: stageId });
});

driveWorkflowRouter.post('/workflow/send', async (req, res) => {
  const { ids, stage } = parse(z.object({ ids: idList, stage: z.enum(WORKFLOW_STAGES) }), req.body);
  const wf = await ensureWorkflowFolders();
  const ctx = ctxOf(req);
  const me = req.user!.id;
  const targetStageId = wf.stages[stage];
  await requireNode(ctx, targetStageId, 'EDIT');
  const results = await batch(ids, async (id) => {
    assertNotWorkflowFolder(wf, id);
    ctx.reset(); // an earlier item of this request may have moved this one's ancestors
    const { node } = await requireNode(ctx, id, 'EDIT');
    const place = placeOf(ctx, wf, id);
    if (!place) throw badRequest('NOT_IN_WORKFLOW');
    assertCanSend(place.stage, stage as WorkflowStage);
    await assertNotLockedByOther(id, me);
    if (node.kind === 'FOLDER') await assertNoFinalInside(id);
    const parentId = await ensurePath(targetStageId, place.path.map((n) => n.name), me);
    const name = pickFreeName(await siblingNames(parentId), node.name, node.kind === 'FILE');
    await prisma.driveNode.update({ where: { id }, data: { parentId, name } });
    await pruneEmpty(place.path, me);
    await audit(req, 'DRIVE_WORKFLOW_SENT', `drive:${id}`, { name, from: place.stage, to: stage, fromFolder: node.parentId, toFolder: parentId });
    await logDriveActivity({
      nodeId: id,
      folderId: parentId,
      actorId: me,
      action: 'MOVE',
      name,
      meta: { fromId: node.parentId, toId: parentId, toName: STAGE_FOLDER_NAME[stage], kind: node.kind, workflow: { from: place.stage, to: stage }, ...(name !== node.name ? { oldName: node.name } : {}) },
    });
    return { name, stage, folderId: parentId };
  });
  res.json({ results, stage, folderId: targetStageId });
});
