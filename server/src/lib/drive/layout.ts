import { prisma } from '../../db.js';
import { CLIENTS_FOLDER } from '../clientsExcel.js';
import { backfillCaseDrive, type BackfillSummary } from './caseFolders.js';
import { collectSubtree } from './items.js';
import { pickFreeName, siblingNames } from './names.js';
import { ensureSection, ensureSharedRoot, LEGACY_WORK_FOLDER_NAME, sectionIds, staffFolderName } from './roots.js';
import { purgeNodes } from './trash.js';
import { seedSmartFolders } from './org/smart.js';
import { seedFolderTemplates } from './org/templates.js';

/**
 * One-time moves into the single shared workspace. Everything here is idempotent: once no PERSONAL node
 * is left the move does nothing, and the case backfill skips what already exists.
 */

export interface PersonalMoveSummary {
  moved: number;
  emptyRemoved: number;
  nodes: number;
  folders: string[];
}

/**
 * Moves every old "My files" tree into "Gemeinsame Dokumente/Mitarbeiter/<Vorname Nachname>". The personal
 * root itself becomes that folder (same id), so files, versions, stars and task links stay as they are;
 * every node of the tree becomes SHARED with no owner (the whole team edits it). The clients workbook
 * folders that used to be generated in each super admin's files are dropped — the workbook now lives once in
 * the shared space. Empty personal roots are deleted.
 */
export const migratePersonalSpaces = async (log?: (line: string) => void): Promise<PersonalMoveSummary> => {
  const s: PersonalMoveSummary = { moved: 0, emptyRemoved: 0, nodes: 0, folders: [] };
  if ((await prisma.driveNode.count({ where: { space: 'PERSONAL' } })) === 0) return s;
  const staffId = await ensureSection('staff');
  const roots = await prisma.driveNode.findMany({
    where: { space: 'PERSONAL', parentId: null },
    select: { id: true, name: true, owner: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  for (const root of roots) {
    const sub = await collectSubtree([root.id], { name: true, system: true }, { includeDeleted: true });
    const generated = sub.filter((n) => n.id !== root.id && n.kind === 'FOLDER' && n.system && n.name === CLIENTS_FOLDER);
    if (generated.length) await purgeNodes(generated.map((g) => g.id));
    const left = await prisma.driveNode.count({ where: { parentId: root.id } });
    if (left === 0) {
      await prisma.driveNode.delete({ where: { id: root.id } });
      s.emptyRemoved++;
      continue;
    }
    const ids = (await collectSubtree([root.id], { id: true }, { includeDeleted: true })).map((n) => n.id);
    const name = pickFreeName(await siblingNames(staffId), root.owner ? staffFolderName(root.owner) : root.name, false);
    await prisma.$transaction([
      prisma.driveNode.updateMany({ where: { id: { in: ids } }, data: { space: 'SHARED', ownerId: null, system: false } }),
      prisma.driveNode.update({ where: { id: root.id }, data: { parentId: staffId, name, inheritPermissions: true } }),
    ]);
    s.moved++;
    s.nodes += ids.length;
    s.folders.push(name);
  }
  // Stray PERSONAL rows (a tree whose root vanished) end up in the shared space too.
  const strays = await prisma.driveNode.findMany({ where: { space: 'PERSONAL' }, select: { id: true, parentId: true } });
  for (const n of strays) {
    await prisma.driveNode.update({ where: { id: n.id }, data: { space: 'SHARED', ownerId: null, ...(n.parentId ? {} : { parentId: staffId }) } });
  }
  log?.(`[drive] personal spaces moved into "Mitarbeiter": ${s.moved} tree(s), ${s.nodes} node(s), ${s.emptyRemoved} empty root(s) removed`);
  return s;
};

export interface WorkCleanupSummary {
  trashed: number;
  kept: string[];
}

/**
 * The "In Bearbeitung" section was removed from the layout. Old copies (system folders directly below the
 * shared root) go to the recycle bin when they are empty; one that still holds something becomes an
 * ordinary folder, so no file is lost. Idempotent: afterwards no such system folder is left.
 */
export const cleanupWorkFolders = async (log?: (line: string) => void): Promise<WorkCleanupSummary> => {
  const s: WorkCleanupSummary = { trashed: 0, kept: [] };
  const sharedId = await ensureSharedRoot();
  const rows = await prisma.driveNode.findMany({
    where: { parentId: sharedId, system: true, kind: 'FOLDER', name: LEGACY_WORK_FOLDER_NAME, deletedAt: null },
    select: { id: true, name: true },
  });
  for (const r of rows.filter((x) => x.name.toLocaleLowerCase('en') === LEGACY_WORK_FOLDER_NAME.toLocaleLowerCase('en'))) {
    const children = await prisma.driveNode.count({ where: { parentId: r.id, deletedAt: null } });
    if (children === 0) {
      await prisma.driveNode.update({ where: { id: r.id }, data: { deletedAt: new Date(), deletedById: null } });
      s.trashed++;
    } else {
      await prisma.driveNode.update({ where: { id: r.id }, data: { system: false } });
      s.kept.push(r.id);
    }
  }
  if (rows.length) log?.(`[drive] "${LEGACY_WORK_FOLDER_NAME}": ${s.trashed} empty folder(s) moved to the recycle bin, ${s.kept.length} kept as ordinary folder(s)`);
  return s;
};

const BACKFILL_FLAG = 'drive.caseDocsBackfill';

/**
 * Start-up task of the shared workspace: initial layout, old "In Bearbeitung" cleanup, personal spaces →
 * shared, client folders for every case,
 * and (once — remembered in Setting) a drive copy of every accepted case document.
 */
export const runDriveStartup = async (log: (line: string) => void = console.log): Promise<{ personal: PersonalMoveSummary; cases: BackfillSummary; work: WorkCleanupSummary }> => {
  // Sets the layout up the first time; a section a super admin deleted is NOT created again here.
  await sectionIds();
  const work = await cleanupWorkFolders(log);
  const personal = await migratePersonalSpaces(log);
  const done = await prisma.setting.findUnique({ where: { key: BACKFILL_FLAG } });
  const cases = await backfillCaseDrive({ docs: !done, log });
  // Document organisation defaults (once each): folder templates, tags, two shared smart folders.
  await seedFolderTemplates().catch((err) => console.error('[drive] folder template seed failed', err));
  await seedSmartFolders().catch((err) => console.error('[drive] smart folder seed failed', err));
  if (!done) {
    await prisma.setting.upsert({
      where: { key: BACKFILL_FLAG },
      create: { key: BACKFILL_FLAG, value: { doneAt: new Date().toISOString(), ...cases } },
      update: {},
    });
  }
  return { personal, cases, work };
};
