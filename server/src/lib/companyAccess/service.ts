import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../audit.js';
import { companyOwnerId } from '../companyTeam.js';
import { cleanOverrides, isCompanyRole, resolveCompanyPerms, type CompanyPerms, type CompanyRole } from './permissions.js';

/**
 * Database side of the employer roles (lib/companyAccess/permissions.ts): the stored role / overrides of a member
 * (CompanyMemberAccess, one row per COMPANY login; no row = STANDARD = today's access) and their changes.
 */

export interface MemberAccess {
  userId: string;
  companyId: string;
  /** null = STANDARD (no role stored). */
  role: CompanyRole | null;
  overrides: Partial<CompanyPerms>;
  isOwner: boolean;
  perms: CompanyPerms;
}

const rowFor = async (userId: string, companyId: string) => {
  const row = await prisma.companyMemberAccess.findUnique({ where: { userId } });
  // A row written while the login belonged to another company is ignored.
  return row && row.companyId === companyId ? row : null;
};

/** Effective access of a COMPANY login, or null when it has no company. */
export const memberAccess = async (userId: string): Promise<MemberAccess | null> => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, companyId: true } });
  if (!u || u.role !== 'COMPANY' || !u.companyId) return null;
  const [row, ownerId] = await Promise.all([rowFor(userId, u.companyId), companyOwnerId(u.companyId)]);
  const role = isCompanyRole(row?.role) ? row!.role as CompanyRole : null;
  const overrides = role ? cleanOverrides(row?.overrides) : {};
  const isOwner = ownerId === userId;
  return { userId, companyId: u.companyId, role, overrides, isOwner, perms: resolveCompanyPerms({ role, overrides, isOwner }) };
};

/** Access of every login of a company (team lists). */
export const companyMembersAccess = async (companyId: string) => {
  const [rows, ownerId] = await Promise.all([prisma.companyMemberAccess.findMany({ where: { companyId } }), companyOwnerId(companyId)]);
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  return {
    ownerId,
    of: (userId: string) => {
      const row = byUser.get(userId);
      const role = isCompanyRole(row?.role) ? row!.role as CompanyRole : null;
      const overrides = role ? cleanOverrides(row?.overrides) : {};
      const isOwner = ownerId === userId;
      return { role, overrides, isOwner, perms: resolveCompanyPerms({ role, overrides, isOwner }) };
    },
  };
};

/**
 * Stores a member's role (null = back to STANDARD) and, when given, overrides (SUPER_ADMIN only — callers check).
 * Audited as COMPANY_ACCESS_CHANGED with before → after.
 */
export const setMemberAccess = async (
  req: Pick<Request, 'user' | 'ip'>,
  target: { userId: string; companyId: string },
  next: { role: CompanyRole | null; overrides?: Partial<CompanyPerms> | null },
  source: 'PORTAL' | 'ACCESS_CENTER',
) => {
  const before = await rowFor(target.userId, target.companyId);
  const beforeView = { role: isCompanyRole(before?.role) ? before!.role : null, overrides: cleanOverrides(before?.overrides) };
  // Overrides only mean something on top of a role; without a role (STANDARD) they are dropped.
  const overrides = next.role === null ? {} : next.overrides === undefined ? beforeView.overrides : cleanOverrides(next.overrides ?? {});
  const afterView = { role: next.role, overrides };
  if (next.role === null && !Object.keys(overrides).length) {
    await prisma.companyMemberAccess.deleteMany({ where: { userId: target.userId } });
  } else {
    const data = {
      companyId: target.companyId,
      role: next.role,
      overrides: Object.keys(overrides).length ? (overrides as Prisma.InputJsonObject) : Prisma.DbNull,
      updatedById: req.user?.id ?? null,
    };
    await prisma.companyMemberAccess.upsert({ where: { userId: target.userId }, create: { userId: target.userId, ...data }, update: data });
  }
  if (JSON.stringify(beforeView) !== JSON.stringify(afterView)) {
    await audit(req, 'COMPANY_ACCESS_CHANGED', `user:${target.userId}`, {
      companyId: target.companyId,
      source,
      before: beforeView as Prisma.InputJsonObject,
      after: afterView as Prisma.InputJsonObject,
    });
  }
  return afterView;
};
