import type { DriveSpace, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';

/**
 * System roots of the drive. Names are neutral (the UI translates a root by its space); the defaults are
 * only seeded when a root is created, so the super admin can change them later.
 *
 *   SHARED  "Company drive" — role grant STAFF = VIEW
 *   CASES   "Cases"         — role grant ADMIN = DOWNLOAD (assigned staff additionally see their own cases)
 *   PERSONAL one per staff member, created lazily, owner has MANAGE (no grants needed)
 */
// Folder names are German everywhere (the team works with German documents and authorities).
export const SHARED_ROOT_NAME = 'Firmenlaufwerk';
export const CASES_ROOT_NAME = 'Anträge';

export interface DriveRoots {
  sharedId: string;
  casesId: string;
}

const findRoot = (space: DriveSpace) =>
  prisma.driveNode.findFirst({ where: { space, parentId: null, system: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });

const createRoot = async (space: 'SHARED' | 'CASES') => {
  const grant = space === 'SHARED' ? { role: 'STAFF' as Role, access: 'VIEW' as const } : { role: 'ADMIN' as Role, access: 'DOWNLOAD' as const };
  const node = await prisma.driveNode.create({
    data: {
      space,
      kind: 'FOLDER',
      name: space === 'SHARED' ? SHARED_ROOT_NAME : CASES_ROOT_NAME,
      system: true,
      inheritPermissions: false,
      grants: { create: grant },
    },
    select: { id: true },
  });
  return node;
};

let inflight: Promise<DriveRoots> | null = null;

/** Returns the shared and cases roots, creating them (with their default grants) on first use. Idempotent. */
export const ensureRoots = (): Promise<DriveRoots> => {
  // Concurrent first requests share one creation so no duplicate roots appear.
  inflight ??= (async () => {
    const [shared, cases] = await Promise.all([findRoot('SHARED'), findRoot('CASES')]);
    return {
      sharedId: (shared ?? (await createRoot('SHARED'))).id,
      casesId: (cases ?? (await createRoot('CASES'))).id,
    };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
};

const personalInflight = new Map<string, Promise<string | null>>();

/** The staff member's "My files" root (created on first use, renamed when the person's name changed). */
export const ensurePersonalRoot = (userId: string): Promise<string | null> => {
  const pending = personalInflight.get(userId);
  if (pending) return pending;
  const p = (async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, firstName: true, lastName: true } });
    if (!user || !hasMinRole(user.role, 'STAFF')) return null;
    const name = `${user.firstName} ${user.lastName}`.trim().slice(0, 200) || 'Staff';
    const existing = await prisma.driveNode.findFirst({
      where: { space: 'PERSONAL', ownerId: userId, parentId: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    if (existing) {
      if (existing.name !== name) await prisma.driveNode.update({ where: { id: existing.id }, data: { name } });
      return existing.id;
    }
    const created = await prisma.driveNode.create({
      data: { space: 'PERSONAL', kind: 'FOLDER', name, ownerId: userId, system: true, inheritPermissions: false, createdById: userId },
      select: { id: true },
    });
    return created.id;
  })().finally(() => personalInflight.delete(userId));
  personalInflight.set(userId, p);
  return p;
};

/** Personal roots for every active staff member (super admin team view). */
export const ensureAllPersonalRoots = async () => {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true, driveNodesOwned: { none: { parentId: null } } },
    select: { id: true },
  });
  for (const u of staff) await ensurePersonalRoot(u.id);
};
