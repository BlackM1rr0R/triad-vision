import { prisma } from '../../db.js';
import { badRequest, conflict } from '../http.js';
import type { ProcessingStage } from '../caseProcessing/index.js';
import type { DriveAccessCtx, NodeLite } from './access.js';
import { findSibling, freeNameIn } from './names.js';
import { ensureSharedRoot } from './roots.js';

/**
 * "İş axını" as real folders of the drive: below the shared root one system folder "Arbeitsablauf" with the
 * three stage folders (German names, like every folder of the drive):
 *
 *   Gemeinsame Dokumente / Arbeitsablauf / Schon geschrieben · In Bearbeitung · Fertig
 *
 * - "Kopyala → Schon geschrieben / Fertig" copies files and folders there (recursive, structure kept).
 *   An item that lives inside a client folder is copied below that client folder's name, an item that already
 *   lives in a stage keeps its path below the stage — so the stages stay folder-structured, never a flat list.
 * - Nothing lands in "In Bearbeitung" by itself: only an admin sends an item there from "Schon geschrieben".
 * - The way through: Schon geschrieben → In Bearbeitung → Fertig (SEND_NEXT). A send moves the item
 *   with its path below the stage (missing folders are created, existing ones reused); folders the move left
 *   empty in the old stage are removed. "Köçür" (plain move) still lets an admin put anything anywhere.
 *
 * The folders are recognised by id (Setting `drive.workflowFolders`), not by name, and created on first use.
 * They are system folders: only super admins may rename, move or delete them (like the sections). The old
 * "In Bearbeitung" section cleanup (lib/drive/layout.ts) only looks directly below the shared root, so the stage
 * folder of the same name here is never touched by it.
 */

export const WORKFLOW_ROOT_NAME = 'Arbeitsablauf';
export const WORKFLOW_STAGES = ['WRITTEN', 'IN_PROGRESS', 'DONE'] as const satisfies readonly ProcessingStage[];
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const STAGE_FOLDER_NAME: Record<WorkflowStage, string> = {
  WRITTEN: 'Schon geschrieben',
  IN_PROGRESS: 'In Bearbeitung',
  DONE: 'Fertig',
};
const STAGE_COLOR: Record<WorkflowStage, string> = { WRITTEN: 'blue', IN_PROGRESS: 'amber', DONE: 'green' };

/** Where "Kopyala" may copy to ("In Bearbeitung" only gets what an admin sends there from Schon geschrieben). */
export const COPY_STAGES = ['WRITTEN', 'DONE'] as const satisfies readonly WorkflowStage[];

/** Where an item of a stage may be sent on. */
export const SEND_NEXT: Record<WorkflowStage, WorkflowStage[]> = {
  WRITTEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['DONE'],
  DONE: [],
};

const SETTING_KEY = 'drive.workflowFolders';
type Stored = Partial<Record<WorkflowStage | 'root' | 'REFUSED', string>>; // REFUSED: the removed "Ablehnung" folder, kept to return its leftovers

export interface WorkflowFolders {
  rootId: string;
  stages: Record<WorkflowStage, string>;
}

let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

const lower = (s: string) => s.toLocaleLowerCase('en');

/** The stored folder if it is a live folder directly below `parentId`. */
const liveChild = async (id: string | undefined, parentId: string) => {
  if (!id) return null;
  const n = await prisma.driveNode.findFirst({ where: { id, parentId, kind: 'FOLDER', deletedAt: null }, select: { id: true } });
  return n?.id ?? null;
};

/** A live folder below `parentId` with exactly this name (ignoring case), made a system folder; else a new one. */
const adoptOrCreate = async (parentId: string, name: string, color: string) => {
  const rows = await prisma.driveNode.findMany({ where: { parentId, name, kind: 'FOLDER', deletedAt: null }, select: { id: true, name: true, system: true }, orderBy: { createdAt: 'asc' } });
  const hit = rows.find((r) => lower(r.name) === lower(name));
  if (hit) {
    if (!hit.system) await prisma.driveNode.update({ where: { id: hit.id }, data: { system: true } });
    return hit.id;
  }
  const free = await freeNameIn(parentId, name, false);
  return (await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: free, parentId, system: true, color }, select: { id: true } })).id;
};

/** The workflow folder and its four stage folders (created, or found again, on first use). */
export const ensureWorkflowFolders = (): Promise<WorkflowFolders> =>
  serial(async () => {
    const sharedId = await ensureSharedRoot();
    const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
    const stored = (row?.value && typeof row.value === 'object' ? row.value : {}) as Stored;
    const next: Stored = {};
    next.root = (await liveChild(stored.root, sharedId)) ?? (await adoptOrCreate(sharedId, WORKFLOW_ROOT_NAME, 'teal'));
    for (const st of WORKFLOW_STAGES) next[st] = (await liveChild(stored[st], next.root)) ?? (await adoptOrCreate(next.root, STAGE_FOLDER_NAME[st], STAGE_COLOR[st]));
    if (stored.REFUSED) next.REFUSED = stored.REFUSED;
    if (WORKFLOW_STAGES.some((st) => stored[st] !== next[st]) || stored.root !== next.root) {
      await prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: next }, update: { value: next } });
    }
    return { rootId: next.root, stages: Object.fromEntries(WORKFLOW_STAGES.map((st) => [st, next[st]!])) as Record<WorkflowStage, string> };
  });

/** Ids of the legacy "Ablehnung" stage folder (removed stage; only its leftovers are returned and cleaned up by lib/drive/workflowReturn). */
export const legacyRefusedFolderId = async (): Promise<string | null> => {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const v = (row?.value && typeof row.value === 'object' ? row.value : {}) as Record<string, unknown>;
  return typeof v.REFUSED === 'string' ? v.REFUSED : null;
};

/** The workflow folders if they were set up already (null otherwise); creates nothing. */
export const peekWorkflowFolders = async (): Promise<WorkflowFolders | null> => {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const v = (row?.value && typeof row.value === 'object' ? row.value : null) as Stored | null;
  if (!v?.root || WORKFLOW_STAGES.some((st) => !v[st])) return null;
  return { rootId: v.root, stages: Object.fromEntries(WORKFLOW_STAGES.map((st) => [st, v[st]!])) as Record<WorkflowStage, string> };
};

export interface StagePlace {
  stage: WorkflowStage;
  stageFolderId: string;
  /** Folders between the stage folder and the node (both excluded), outermost first. */
  path: NodeLite[];
}

/** Where a loaded node sits in the workflow (null when it is not inside a stage folder, or is one itself). */
export const placeOf = (ctx: DriveAccessCtx, wf: WorkflowFolders, nodeId: string): StagePlace | null => {
  const chain = ctx.chain(nodeId);
  const byId = new Map(WORKFLOW_STAGES.map((st) => [wf.stages[st], st]));
  for (let i = chain.length - 2; i >= 0; i--) {
    const st = byId.get(chain[i]!.id);
    if (st && chain[i]!.parentId === wf.rootId) return { stage: st, stageFolderId: chain[i]!.id, path: chain.slice(i + 1, -1) };
  }
  return null;
};

/** The workflow folder or a stage folder itself (they are neither copied nor sent). */
export const assertNotWorkflowFolder = (wf: WorkflowFolders, id: string) => {
  if (id === wf.rootId || Object.values(wf.stages).includes(id)) throw badRequest('WORKFLOW_FOLDER');
};

/** Checks a send from one stage to another. */
export const assertCanSend = (from: WorkflowStage, to: WorkflowStage) => {
  if (!SEND_NEXT[from].includes(to)) throw conflict('WORKFLOW_TRANSITION_NOT_ALLOWED');
};

/**
 * The folder path `names` below `parentId` ("mkdir -p"): an existing folder of the same name is reused, a
 * missing one created (next to a file of that name it gets " (2)"). Returns the innermost folder id.
 *
 * With `caseId` (the path starts at a client folder's copy directly below a stage folder) the first folder is the
 * case's own: a folder linked to the case (DriveNode.workflowCaseId) wins over the name; a same-named folder linked
 * to another case is never reused (a new " (2)" one is made); the folder used or made is linked to the case.
 */
export const ensurePath = async (parentId: string, names: string[], actorId: string | null, opts: { caseId?: string | null } = {}) => {
  let cur = parentId;
  for (const [i, name] of names.entries()) {
    const caseId = i === 0 ? (opts.caseId ?? null) : null;
    if (caseId) {
      const linked = await prisma.driveNode.findFirst({ where: { parentId: cur, kind: 'FOLDER', deletedAt: null, workflowCaseId: caseId }, select: { id: true }, orderBy: { createdAt: 'asc' } });
      if (linked) {
        cur = linked.id;
        continue;
      }
    }
    const hit = await findSibling(cur, name);
    if (hit?.kind === 'FOLDER') {
      if (!caseId) {
        cur = hit.id;
        continue;
      }
      const link = (await prisma.driveNode.findUnique({ where: { id: hit.id }, select: { workflowCaseId: true } }))?.workflowCaseId ?? null;
      if (!link || link === caseId) {
        if (!link) await prisma.driveNode.update({ where: { id: hit.id }, data: { workflowCaseId: caseId } });
        cur = hit.id;
        continue;
      }
    }
    const free = hit ? await freeNameIn(cur, name, false) : name;
    cur = (await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: free, parentId: cur, createdById: actorId, workflowCaseId: caseId }, select: { id: true } })).id;
  }
  return cur;
};

export interface CopyTarget {
  /** Folder names below the stage folder, outermost first. */
  path: string[];
  /** The case whose client folder the path (or, with an empty path, the copied folder itself) mirrors. */
  caseId: string | null;
}

/**
 * Where a copy of the node goes below a stage folder: an item already in a stage keeps its path below the stage (and
 * the case link of its top folder); an item inside a client folder (Case.driveFolderId) goes below that client
 * folder's name (and the folders between); a client folder itself goes straight into the stage (its copy becomes the
 * case's stage folder); anything else straight into the stage, without a case.
 */
export const copyTargetOf = async (ctx: DriveAccessCtx, wf: WorkflowFolders, nodeId: string): Promise<CopyTarget> => {
  const inStage = placeOf(ctx, wf, nodeId);
  if (inStage) {
    const top = inStage.path[0]?.id ?? nodeId;
    const caseId = (await prisma.driveNode.findUnique({ where: { id: top }, select: { workflowCaseId: true } }))?.workflowCaseId ?? null;
    return { path: inStage.path.map((n) => n.name), caseId };
  }
  const chain = ctx.chain(nodeId);
  if (!chain.length) return { path: [], caseId: null };
  const cases = await prisma.case.findMany({ where: { driveFolderId: { in: chain.map((n) => n.id) } }, select: { id: true, driveFolderId: true } });
  if (!cases.length) return { path: [], caseId: null };
  const caseOf = new Map(cases.map((c) => [c.driveFolderId!, c.id]));
  const ancestors = chain.slice(0, -1);
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const caseId = caseOf.get(ancestors[i]!.id);
    if (caseId) return { path: ancestors.slice(i).map((n) => n.name), caseId };
  }
  // The node itself is a client folder (not inside another one): copied as a whole into the stage.
  return { path: [], caseId: caseOf.get(chain[chain.length - 1]!.id) ?? null };
};

/**
 * After a send: the folders between the stage folder and the old place that are empty now (no live content) go
 * to the recycle bin, innermost first — so the old stage does not keep empty client folders. A folder that
 * still holds something stops the walk. Recycle bin (not a hard delete): links to the folder survive a restore.
 */
export const pruneEmpty = async (folders: NodeLite[], actorId: string) => {
  for (const f of [...folders].reverse()) {
    if (f.system || (await prisma.driveNode.count({ where: { parentId: f.id, deletedAt: null } })) > 0) return;
    await prisma.driveNode.updateMany({ where: { id: f.id, kind: 'FOLDER', deletedAt: null }, data: { deletedAt: new Date(), deletedById: actorId } });
  }
};
