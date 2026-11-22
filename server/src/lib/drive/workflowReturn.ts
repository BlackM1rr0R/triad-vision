import { prisma } from '../../db.js';
import { conflict, notFound } from '../http.js';
import { invalidateMyWork } from '../myWork.js';
import { stageLabel } from '../caseProcessing/texts.js';
import { collectSubtree } from './items.js';
import { freeNameIn } from './names.js';
import { WORKFLOW_STAGES, ensurePath, legacyRefusedFolderId, peekWorkflowFolders } from './workflowFolders.js';
import { caseFoldersInStage } from './workflowLinks.js';

/**
 * "Geri qaytar" (return): a case leaves the workflow (Schon geschrieben / In Bearbeitung / Fertig) and its workflow
 * documents go back to the client's own folder.
 *
 * "İş axınına kopyala" COPIES (lib/drive/copy.ts: new storage keys, structure kept below the case's folder, linked by
 * DriveNode.workflowCaseId), so the originals normally still sit in the client folder. Returning therefore
 *   - removes the workflow copies (recycle bin, restorable) that the client folder already has — same content hash, or
 *     (without a hash) the same path and name;
 *   - MOVES every file the client folder does not have (written in the workflow, edited there, original deleted) back
 *     into the client folder, to the same relative path (folders are reused or created), under a free name — nothing is
 *     ever lost; "Final" files are always moved, never removed;
 *   - sends the emptied case folders in the stage folders (and the legacy "Ablehnung" folder) to the recycle bin;
 *   - clears Case.processingStage / assignee, keeps the history (CaseProcessingMove toStage RETURNED + case event).
 * Idempotent: a case that is not in the workflow (no stage, no folders) answers 409 NOT_IN_WORKFLOW.
 */

export interface ReturnResult {
  from: string | null;
  /** Workflow copies removed because the client folder has the file already. */
  removed: number;
  /** Files moved back into the client folder. */
  moved: number;
}

interface Row {
  id: string;
  kind: 'FILE' | 'FOLDER';
  parentId: string | null;
  name: string;
  contentHash: string | null;
  finalAt: Date | null;
}

const lower = (s: string) => s.toLocaleLowerCase('en');
const select = { name: true, contentHash: true, finalAt: true } as const;

/** Relative folder path (names) of every node below the roots; roots have an empty path and are listed in `roots`. */
const relPaths = (rows: Row[], rootIds: Set<string>) => {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const memo = new Map<string, string[]>();
  const pathOf = (id: string): string[] => {
    const hit = memo.get(id);
    if (hit) return hit;
    const r = byId.get(id)!;
    const p = !r.parentId || rootIds.has(r.parentId) || !byId.has(r.parentId) ? [] : [...pathOf(r.parentId), byId.get(r.parentId)!.name];
    memo.set(id, p);
    return p;
  };
  return pathOf;
};

export const returnCaseFromWorkflow = async (caseId: string, actor: { id: string } | null, opts: { note?: string | null } = {}): Promise<ReturnResult> => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, status: true, processingStage: true, processingAssigneeId: true, driveFolderId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const clientFolder = c.driveFolderId ? await prisma.driveNode.findFirst({ where: { id: c.driveFolderId, deletedAt: null, kind: 'FOLDER' }, select: { id: true, name: true } }) : null;

  // The case's folders in every stage folder (and the legacy Ablehnung folder).
  const wf = await peekWorkflowFolders();
  const stageIds = wf ? WORKFLOW_STAGES.map((st) => wf.stages[st]) : [];
  const refusedId = await legacyRefusedFolderId();
  if (refusedId) stageIds.push(refusedId);
  const tops = (await Promise.all(stageIds.map((id) => caseFoldersInStage(id, caseId, clientFolder?.name ?? null)))).flat();
  const topIds = new Set(tops.map((t) => t.id));
  if (!c.processingStage && !tops.length) throw conflict('NOT_IN_WORKFLOW');
  if (tops.length && !clientFolder) throw conflict('CLIENT_FOLDER_MISSING'); // nowhere to put the files back

  let removed = 0;
  let moved = 0;
  const at = new Date();
  if (tops.length && clientFolder) {
    const wfRows = (await collectSubtree([...topIds], select)) as unknown as Row[];
    const clientRows = (await collectSubtree([clientFolder.id], select)) as unknown as Row[];
    const wfPath = relPaths(wfRows, topIds);
    const clientPath = relPaths(clientRows, new Set([clientFolder.id]));
    const haveHash = new Set(clientRows.filter((r) => r.kind === 'FILE' && r.contentHash).map((r) => r.contentHash!));
    const haveName = new Set(clientRows.filter((r) => r.kind === 'FILE').map((r) => [...clientPath(r.id), lower(r.name)].map(lower).join('/')));

    const keep = new Set<string>(); // moved back: not removed below
    for (const f of wfRows) {
      if (f.kind !== 'FILE' || topIds.has(f.id)) continue;
      const rel = wfPath(f.id);
      const duplicate = f.contentHash ? haveHash.has(f.contentHash) : haveName.has([...rel, f.name].map(lower).join('/'));
      if (duplicate && !f.finalAt) continue; // the original is in place: this copy goes to the recycle bin with its folder
      const parentId = rel.length ? await ensurePath(clientFolder.id, rel, actor?.id ?? null) : clientFolder.id;
      const name = await freeNameIn(parentId, f.name, true);
      await prisma.driveNode.update({ where: { id: f.id }, data: { parentId, name, space: 'SHARED' } });
      keep.add(f.id);
      moved++;
      if (f.contentHash) haveHash.add(f.contentHash);
    }
    const drop = wfRows.filter((r) => !keep.has(r.id)).map((r) => r.id);
    removed = wfRows.filter((r) => r.kind === 'FILE' && !keep.has(r.id)).length;
    for (let i = 0; i < drop.length; i += 500) {
      await prisma.driveNode.updateMany({ where: { id: { in: drop.slice(i, i + 500) }, deletedAt: null }, data: { deletedAt: at, deletedById: actor?.id ?? null } });
    }
  }

  const from = c.processingStage;
  const note = opts.note?.trim() || null;
  await prisma.$transaction([
    prisma.caseProcessingMove.create({ data: { caseId, fromStage: from, toStage: 'RETURNED', actorId: actor?.id ?? null, assigneeId: null, note, createdAt: at } }),
    prisma.case.update({ where: { id: caseId }, data: { processingStage: null, processingStageAt: at, processingStageById: actor?.id ?? null, processingAssigneeId: null } }),
    prisma.caseEvent.create({
      data: {
        caseId,
        type: 'PROCESSING_STAGE',
        note: `${stageLabel(from)} → ${stageLabel('RETURNED')}${removed + moved ? ` (${removed} Kopie(n) entfernt, ${moved} Datei(en) zurück im Kundenordner)` : ''}${note ? `: ${note}` : ''}`.slice(0, 2000),
        actorId: actor?.id ?? null,
        visibleToClient: false,
      },
    }),
  ]);
  for (const id of [actor?.id, c.processingAssigneeId]) if (id) invalidateMyWork(id);
  invalidateMyWork();
  return { from, removed, moved };
};
