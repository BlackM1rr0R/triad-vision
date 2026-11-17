import type { NextFunction, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { canWith, scopeWhere, withCaseScope } from './resolve.js';
import { loadAccess } from './store.js';
import { assertCasesInScope } from './guard.js';
import type { AccessUser, Action, Area } from './types.js';

/**
 * The resolver functions (re-exported by index.ts). Library code (drive, tasks, my work) imports this file
 * directly: it pulls in no notification / mail modules, so no import cycles.
 */

export const isSuperAdmin = (user: AccessUser | null | undefined) => user?.role === 'SUPER_ADMIN';

export const can = async (user: AccessUser | null | undefined, area: Area, action: Action): Promise<boolean> => {
  if (!user) return false;
  return canWith(await loadAccess(user), area, action);
};

export const caseScopeWhere = async (user: AccessUser | null | undefined): Promise<Prisma.CaseWhereInput> => {
  if (!user) return { id: '__none__' };
  if (user.role === 'SUPER_ADMIN') return {};
  return scopeWhere(await loadAccess(user));
};

/** Convenience for list queries: the query's own filter AND the user's case scope. */
export const scopedCaseWhere = async (user: AccessUser | null | undefined, where: Prisma.CaseWhereInput = {}) => withCaseScope(where, await caseScopeWhere(user));

/** True when the user sees every case (no list filtering needed). */
export const hasFullCaseScope = async (user: AccessUser | null | undefined) => {
  if (!user) return false;
  const a = await loadAccess(user);
  return a.superAdmin || a.caseScope === 'ALL';
};

export const assertCaseInScope = async (user: AccessUser, caseId: string) => assertCasesInScope(await loadAccess(user), [caseId]);

/** SUPER_ADMIN always; an ADMIN only when a SUPER_ADMIN granted "manage access". */
export const canManageAccess = async (user: AccessUser | null | undefined) => {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role !== 'ADMIN') return false;
  return (await loadAccess(user)).manageAccess;
};

/** Middleware for the Access Center routers (every tab): 403 unless canManageAccess. */
export const requireManageAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (await canManageAccess(req.user)) return next();
    res.status(403).json({ error: 'FORBIDDEN', message: 'MANAGE_ACCESS_REQUIRED' });
  } catch (e) {
    next(e);
  }
};

/** Template id of a staff member (the masking module keys its per-template reveal policy by it). */
export const staffTemplateIdOf = async (user: AccessUser) => (await loadAccess(user)).templateId;
