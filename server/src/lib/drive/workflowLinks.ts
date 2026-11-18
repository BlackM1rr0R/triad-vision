import { prisma } from '../../db.js';
import { pickFreeName } from './names.js';
import { peekSection } from './roots.js';
import { WORKFLOW_STAGES, peekWorkflowFolders, type WorkflowFolders } from './workflowFolders.js';
import { caseStageFolders, looksLikeClientFolderName, matchWorkflowLinks } from './workflowLinkRules.js';

/**
 * Case links of drive folders (DriveNode.workflowCaseId, DriveNode.clientFolderAt):
 *
 *  - "İş axınına kopyala" puts a copy below "Arbeitsablauf/<stage>/<client folder name>"; that top folder carries
 *    the case id (workflowCaseId), so the Fertig documents of a case (lib/clientFolders/readyDocs) are found by the
 *    case first and by the client folder's name only for legacy copies nobody linked yet;
 *  - when the client folder is renamed (client name / passport number changed, or renamed in the drive), the linked
 *    stage folders follow, so the name fallback never points at the wrong folder;
 *  - clientFolderAt marks a folder that is (or ever was) a case's client folder; a client folder left behind after
 *    its case was deleted keeps the mark and stays hidden from partners (lib/partnerAccess/drive.ts);
 *  - backfillCaseLinks (drive job, idempotent): links unlinked stage folders by name where exactly one case has a
 *    client folder of that name, marks current client folders, and marks left-behind client folders in the
 *    partner area (name pattern of a client folder, or copies of case documents inside).
 */

const lower = (s: string) => s.toLocaleLowerCase('en');
const stageIdsOf = (wf: WorkflowFolders) => WORKFLOW_STAGES.map((st) => wf.stages[st]);

/** The case's folders directly below one stage folder (linked first, else the legacy copy by client folder name). */
export const caseFoldersInStage = async (stageFolderId: string, caseId: string, clientFolderName: string | null) => {
  const rows = await prisma.driveNode.findMany({
    where: {
      parentId: stageFolderId,
      kind: 'FOLDER',
      deletedAt: null,
      OR: [{ workflowCaseId: caseId }, ...(clientFolderName ? [{ workflowCaseId: null, name: clientFolderName }] : [])],
    },
    select: { id: true, name: true, workflowCaseId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return caseStageFolders(rows, caseId, clientFolderName);
};

/** Links a stage folder to the case (only when it is not linked yet). */
export const linkStageFolder = async (folderId: string, caseId: string) => {
  await prisma.driveNode.updateMany({ where: { id: folderId, workflowCaseId: null }, data: { workflowCaseId: caseId } });
};

/** The case id a stage folder is linked to (null: not linked / not found). */
export const stageFolderCase = async (folderId: string | undefined | null) => {
  if (!folderId) return null;
  return (await prisma.driveNode.findUnique({ where: { id: folderId }, select: { workflowCaseId: true } }))?.workflowCaseId ?? null;
};

/** Marks a folder as a client folder (kept for good). */
export const markClientFolder = async (folderId: string) => {
  await prisma.driveNode.updateMany({ where: { id: folderId, clientFolderAt: null }, data: { clientFolderAt: new Date() } });
};

/**
 * After the client folder of a case was renamed (`oldName` → `newName`): the case's folders below the stage folders
 * get the new name (a free one when a sibling has it). A legacy copy named like the old client folder is linked on
 * the way, unless another live client folder still carries the old name (then it is not clearly this case's).
 */
export const syncWorkflowFolderNames = async (caseId: string, newName: string, oldName?: string | null) => {
  const wf = await peekWorkflowFolders();
  if (!wf) return 0;
  const stageIds = stageIdsOf(wf);
  let legacyOk = false;
  if (oldName && lower(oldName) !== lower(newName)) {
    const sameName = await prisma.driveNode.findMany({ where: { name: oldName, kind: 'FOLDER', deletedAt: null, parentId: { notIn: stageIds } }, select: { id: true, name: true } });
    const ids = sameName.filter((n) => lower(n.name) === lower(oldName)).map((n) => n.id);
    legacyOk = !ids.length || !(await prisma.case.count({ where: { driveFolderId: { in: ids }, id: { not: caseId } } }));
  }
  const rows = await prisma.driveNode.findMany({
    where: {
      parentId: { in: stageIds },
      kind: 'FOLDER',
      deletedAt: null,
      OR: [{ workflowCaseId: caseId }, ...(legacyOk && oldName ? [{ workflowCaseId: null, name: oldName }] : [])],
    },
    select: { id: true, name: true, parentId: true, workflowCaseId: true },
  });
  let renamed = 0;
  for (const r of rows) {
    if (!r.workflowCaseId && lower(r.name) !== lower(oldName ?? '')) continue; // collation matched an accent variant
    if (r.name === newName && r.workflowCaseId === caseId) continue;
    const siblings = await prisma.driveNode.findMany({ where: { parentId: r.parentId, deletedAt: null, id: { not: r.id } }, select: { name: true } });
    const name = r.name === newName ? r.name : pickFreeName(new Set(siblings.map((s) => lower(s.name))), newName, false);
    await prisma.driveNode.update({ where: { id: r.id }, data: { name, workflowCaseId: caseId } });
    renamed++;
  }
  return renamed;
};

/** After a folder was renamed in the drive: when it is a client folder, its workflow copies follow. */
export const followClientFolderRename = async (folderId: string, oldName: string, newName: string) => {
  if (oldName === newName) return 0;
  const c = await prisma.case.findFirst({ where: { driveFolderId: folderId }, select: { id: true } });
  return c ? syncWorkflowFolderNames(c.id, newName, oldName) : 0;
};

/**
 * Before a case row goes away: its client folder (and everything in it) goes to the recycle bin — staff only,
 * restorable for the trash period — and keeps the client folder mark, so it never surfaces for a partner.
 */
export const retireClientFolders = async (folderIds: (string | null | undefined)[], actorId: string | null) => {
  const ids = [...new Set(folderIds.filter((x): x is string => !!x))];
  if (!ids.length) return 0;
  const at = new Date();
  await prisma.driveNode.updateMany({ where: { id: { in: ids }, clientFolderAt: null }, data: { clientFolderAt: at } });
  // The whole live subtree, level by level (same timestamp = one trash root, restorable together).
  let level = ids;
  const all = [...ids];
  for (let depth = 0; depth < 30 && level.length; depth++) {
    level = (await prisma.driveNode.findMany({ where: { parentId: { in: level }, deletedAt: null }, select: { id: true } })).map((r) => r.id);
    all.push(...level);
  }
  const { count } = await prisma.driveNode.updateMany({ where: { id: { in: all }, deletedAt: null }, data: { deletedAt: at, deletedById: actorId } });
  return count;
};

export interface CaseLinkBackfill {
  clientFoldersMarked: number;
  workflowLinked: number;
  orphansMarked: number;
}

/** Folders below `parentIds` holding a copy of a case document (a few levels deep). */
const withDocumentCopies = async (folderIds: string[]) => {
  const owner = new Map(folderIds.map((id) => [id, id]));
  const hit = new Set<string>();
  let level = folderIds;
  for (let depth = 0; depth < 4 && level.length; depth++) {
    const rows = await prisma.driveNode.findMany({ where: { parentId: { in: level }, deletedAt: null }, select: { id: true, parentId: true, kind: true, documentId: true } });
    const next: string[] = [];
    for (const r of rows) {
      const root = owner.get(r.parentId!)!;
      if (r.documentId) hit.add(root);
      if (r.kind === 'FOLDER') {
        owner.set(r.id, root);
        next.push(r.id);
      }
    }
    level = next;
  }
  return hit;
};

/** The idempotent backfill (drive job): safe to run on every start. */
export const backfillCaseLinks = async (): Promise<CaseLinkBackfill> => {
  // 1. Current client folders (also done by the migration; repeated for folders made since).
  const caseFolders = await prisma.case.findMany({ where: { driveFolderId: { not: null } }, select: { id: true, driveFolderId: true } });
  const caseFolderIds = caseFolders.map((c) => c.driveFolderId!);
  let clientFoldersMarked = 0;
  for (let i = 0; i < caseFolderIds.length; i += 500) {
    clientFoldersMarked += (await prisma.driveNode.updateMany({ where: { id: { in: caseFolderIds.slice(i, i + 500) }, clientFolderAt: null }, data: { clientFolderAt: new Date() } })).count;
  }

  // 2. Workflow copies by name, only where unambiguous.
  let workflowLinked = 0;
  const wf = await peekWorkflowFolders();
  if (wf) {
    const unlinked = await prisma.driveNode.findMany({ where: { parentId: { in: stageIdsOf(wf) }, kind: 'FOLDER', deletedAt: null, workflowCaseId: null }, select: { id: true, name: true } });
    if (unlinked.length) {
      const names = [...new Set(unlinked.map((u) => u.name))];
      const byFolder = new Map(caseFolders.map((c) => [c.driveFolderId!, c.id]));
      const clientFolders: { caseId: string; name: string }[] = [];
      for (let i = 0; i < names.length; i += 500) {
        const rows = await prisma.driveNode.findMany({ where: { name: { in: names.slice(i, i + 500) }, kind: 'FOLDER', deletedAt: null, id: { in: caseFolderIds } }, select: { id: true, name: true } });
        for (const r of rows) clientFolders.push({ caseId: byFolder.get(r.id)!, name: r.name });
      }
      for (const m of matchWorkflowLinks(unlinked, clientFolders)) workflowLinked += (await prisma.driveNode.updateMany({ where: { id: m.id, workflowCaseId: null }, data: { workflowCaseId: m.caseId } })).count;
    }
  }

  // 3. Left-behind client folders in the partner area: directly in a partner's folder, not a current client folder.
  let orphansMarked = 0;
  const partnersId = await peekSection('partners');
  if (partnersId) {
    const partnerFolders = (await prisma.driveNode.findMany({ where: { parentId: partnersId, kind: 'FOLDER' }, select: { id: true } })).map((r) => r.id);
    if (partnerFolders.length) {
      const live = new Set(caseFolderIds);
      const candidates = (
        await prisma.driveNode.findMany({ where: { parentId: { in: partnerFolders }, kind: 'FOLDER', clientFolderAt: null }, select: { id: true, name: true } })
      ).filter((r) => !live.has(r.id));
      const withDocs = candidates.length ? await withDocumentCopies(candidates.map((c) => c.id)) : new Set<string>();
      const orphans = candidates.filter((c) => looksLikeClientFolderName(c.name) || withDocs.has(c.id)).map((c) => c.id);
      if (orphans.length) orphansMarked = (await prisma.driveNode.updateMany({ where: { id: { in: orphans }, clientFolderAt: null }, data: { clientFolderAt: new Date() } })).count;
    }
  }
  return { clientFoldersMarked, workflowLinked, orphansMarked };
};
