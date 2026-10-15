import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { ensureRoots } from '../drive/roots.js';
import { freeNameIn } from '../drive/names.js';
import { taskKey } from './core.js';

/** Name of the company-drive folder that holds files uploaded straight into tasks. */
export const TASK_FILES_FOLDER = 'Tapşırıq faylları';

let inflight: Promise<string> | null = null;

/**
 * The "Tapşırıq faylları" folder in the company drive (created on first use). It is a system folder
 * (cannot be renamed or deleted) and every staff member may download from it, because every staff
 * member can open every task.
 */
export const ensureTaskFilesRoot = (): Promise<string> => {
  inflight ??= (async () => {
    const { sharedId } = await ensureRoots();
    const existing = await prisma.driveNode.findFirst({
      where: { parentId: sharedId, kind: 'FOLDER', system: true, name: TASK_FILES_FOLDER, deletedAt: null },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await prisma.driveNode.create({
      data: {
        space: 'SHARED',
        kind: 'FOLDER',
        name: TASK_FILES_FOLDER,
        parentId: sharedId,
        system: true,
        color: 'amber',
        grants: { create: { role: 'STAFF', access: 'DOWNLOAD' } },
      },
      select: { id: true },
    });
    return created.id;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
};

/** "T-0004 · Xarici prava" folder for one task inside the task-files folder (created on demand). */
export const ensureTaskFolder = async (task: { id: string; number: number; title: string }, userId: string, db: Prisma.TransactionClient = prisma) => {
  const rootId = await ensureTaskFilesRoot();
  const prefix = taskKey(task.number);
  const existing = await db.driveNode.findFirst({
    where: { parentId: rootId, kind: 'FOLDER', deletedAt: null, name: { startsWith: prefix } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const wanted = `${prefix} · ${task.title}`.replace(/[\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const name = await freeNameIn(rootId, wanted, false);
  const created = await db.driveNode.create({
    data: { space: 'SHARED', kind: 'FOLDER', name, parentId: rootId, createdById: userId },
    select: { id: true },
  });
  return created.id;
};
