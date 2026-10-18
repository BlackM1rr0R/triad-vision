import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { cleanName, findSibling } from './names.js';

/**
 * ONE shared workspace for the whole team ("Gemeinsame Dokumente"): every staff member (STAFF and above)
 * can open and edit everything in it — the root carries the role grant STAFF = EDIT and everything below
 * inherits it. Grants on sub-folders still work for the rare folder that should be restricted.
 *
 *   Gemeinsame Dokumente             (system root, role grant STAFF = EDIT)
 *   ├─ Anträge                       client folders of applications without a partner (system)
 *   │  └─ <Visumart>/<Kategorie>/<Vorname Nachname · Pass-Nr. …>/<Stage folders>
 *   ├─ Partner                       one folder per referral partner, one sub-folder per client (system)
 *   ├─ In Bearbeitung                corrections: documents staff are fixing right now (system)
 *   ├─ Mitarbeiter                   former "My files" of each employee (system)
 *   ├─ Vorlagen                      templates and forms (system)
 *   ├─ Alle Kunden                   the auto-updated clients workbook (system, super admin only)
 *   └─ Aufgabendateien               files uploaded into tasks (system, lib/tasks/files.ts)
 *
 * Folder names are German everywhere (the team works with German documents and authorities).
 * The old PERSONAL roots are moved under "Mitarbeiter" by lib/drive/layout.ts; the old CASES root
 * (a virtual area) becomes the real "Anträge" folder the first time the roots are resolved.
 */
export const SHARED_ROOT_NAME = 'Gemeinsame Dokumente';
/** Name of the shared root before the single-workspace layout (renamed once, see ensureRoots). */
export const OLD_SHARED_ROOT_NAME = 'Firmenlaufwerk';
export const CASES_FOLDER_NAME = 'Anträge';
/** @deprecated the cases area is the "Anträge" folder inside the shared root now. */
export const CASES_ROOT_NAME = CASES_FOLDER_NAME;
export const PARTNERS_FOLDER_NAME = 'Partner';
export const STAFF_FOLDER_NAME = 'Mitarbeiter';
export const WORK_FOLDER_NAME = 'In Bearbeitung';
export const TEMPLATES_FOLDER_NAME = 'Vorlagen';
export const CLIENTS_FOLDER_NAME = 'Alle Kunden';
export const NO_CATEGORY_FOLDER = 'Ohne Kategorie';
export const FAMILY_FOLDER = 'Familie';

export interface DriveRoots {
  sharedId: string;
  /** "Anträge" inside the shared root. */
  casesId: string;
  /** "Partner" inside the shared root. */
  partnersId: string;
  /** "Mitarbeiter" inside the shared root. */
  staffId: string;
  /** "In Bearbeitung": documents being corrected. */
  workId: string;
  /** "Vorlagen": templates and forms. */
  templatesId: string;
  /** "Alle Kunden": the clients workbook (inheritance off: super admins only). */
  clientsId: string;
}

const ensureSharedRoot = async () => {
  const existing = await prisma.driveNode.findFirst({
    where: { space: 'SHARED', parentId: null, system: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
  if (!existing) {
    const created = await prisma.driveNode.create({
      data: { space: 'SHARED', kind: 'FOLDER', name: SHARED_ROOT_NAME, system: true, inheritPermissions: false, grants: { create: { role: 'STAFF', access: 'EDIT' } } },
      select: { id: true },
    });
    return created.id;
  }
  if (existing.name === OLD_SHARED_ROOT_NAME) {
    // One-time switch to the single shared workspace: everybody on the team edits everything.
    await prisma.$transaction([
      prisma.driveNode.update({ where: { id: existing.id }, data: { name: SHARED_ROOT_NAME } }),
      prisma.driveGrant.upsert({
        where: { nodeId_role: { nodeId: existing.id, role: 'STAFF' } },
        create: { nodeId: existing.id, role: 'STAFF', access: 'EDIT' },
        update: { access: 'EDIT' },
      }),
    ]);
  }
  return existing.id;
};

/** A system folder directly below the shared root (found by name, created on first use). */
const ensureSystemChild = async (sharedId: string, name: string, color: string, extra: Partial<Prisma.DriveNodeUncheckedCreateInput> = {}) => {
  const rows = await prisma.driveNode.findMany({ where: { parentId: sharedId, system: true, kind: 'FOLDER', name }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  const hit = rows.find((r) => r.name.toLocaleLowerCase('en') === name.toLocaleLowerCase('en'));
  if (hit) return hit.id;
  const created = await prisma.driveNode.create({
    data: { space: 'SHARED', kind: 'FOLDER', name, parentId: sharedId, system: true, color, ...extra },
    select: { id: true },
  });
  return created.id;
};

/** The "Anträge" folder; the old virtual CASES root is turned into it (same id, so links keep working). */
const ensureCasesFolder = async (sharedId: string) => {
  const oldRoot = await prisma.driveNode.findFirst({ where: { space: 'CASES', parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  const current = await prisma.driveNode.findFirst({ where: { parentId: sharedId, system: true, kind: 'FOLDER', name: CASES_FOLDER_NAME }, select: { id: true } });
  if (oldRoot && !current) {
    await prisma.$transaction([
      prisma.driveGrant.deleteMany({ where: { nodeId: oldRoot.id } }),
      prisma.driveNode.update({
        where: { id: oldRoot.id },
        data: { space: 'SHARED', parentId: sharedId, name: CASES_FOLDER_NAME, system: true, inheritPermissions: true, color: 'violet', deletedAt: null },
      }),
      prisma.driveNode.updateMany({ where: { space: 'CASES' }, data: { space: 'SHARED' } }),
    ]);
    return oldRoot.id;
  }
  if (oldRoot && current) {
    // Both exist (should not happen): anything below the old root moves over, the old root goes.
    await prisma.driveNode.updateMany({ where: { parentId: oldRoot.id }, data: { parentId: current.id, space: 'SHARED' } });
    await prisma.driveNode.delete({ where: { id: oldRoot.id } }).catch(() => undefined);
  }
  return current?.id ?? ensureSystemChild(sharedId, CASES_FOLDER_NAME, 'violet');
};

let inflight: Promise<DriveRoots> | null = null;
let cached: DriveRoots | null = null;

/** Returns the shared root and its system folders, creating them (with the default grant) on first use. Idempotent. */
export const ensureRoots = (): Promise<DriveRoots> => {
  // Concurrent first requests share one creation so no duplicate roots appear.
  inflight ??= (async () => {
    if (cached) {
      // One cheap query instead of resolving every folder again (the ids never change while they exist).
      const ids = [cached.sharedId, cached.casesId, cached.partnersId, cached.staffId, cached.workId, cached.templatesId, cached.clientsId];
      const alive = await prisma.driveNode.count({ where: { id: { in: ids }, system: true } });
      if (alive === ids.length) return cached;
    }
    const sharedId = await ensureSharedRoot();
    const casesId = await ensureCasesFolder(sharedId);
    const partnersId = await ensureSystemChild(sharedId, PARTNERS_FOLDER_NAME, 'teal');
    const workId = await ensureSystemChild(sharedId, WORK_FOLDER_NAME, 'amber');
    const staffId = await ensureSystemChild(sharedId, STAFF_FOLDER_NAME, 'blue');
    const templatesId = await ensureSystemChild(sharedId, TEMPLATES_FOLDER_NAME, 'pink');
    const clientsId = await ensureSystemChild(sharedId, CLIENTS_FOLDER_NAME, 'green', { inheritPermissions: false });
    cached = { sharedId, casesId, partnersId, staffId, workId, templatesId, clientsId };
    return cached;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
};

/** Display name of a staff member's folder below "Mitarbeiter". */
export const staffFolderName = (u: { firstName: string; lastName: string }) => cleanName(`${u.firstName} ${u.lastName}`, 'Mitarbeiter');

/**
 * "Mitarbeiter/<Vorname Nachname>" for a staff member (found by name, created on first use). Only the
 * import of old files and the one-time move of the personal spaces use it — nobody gets a private area.
 */
export const ensureStaffFolder = async (userId: string): Promise<string | null> => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, firstName: true, lastName: true } });
  if (!user || !hasMinRole(user.role, 'STAFF')) return null;
  const { staffId } = await ensureRoots();
  const name = staffFolderName(user);
  const hit = await findSibling(staffId, name);
  if (hit?.kind === 'FOLDER') return hit.id;
  const created = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name, parentId: staffId }, select: { id: true } });
  return created.id;
};

/**
 * @deprecated There is no personal space any more ("My files" was merged into the shared workspace).
 * Kept so older callers compile; it does nothing.
 */
export const ensurePersonalRoot = async (_userId: string): Promise<string | null> => null;
