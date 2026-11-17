import type { Prisma } from '@prisma/client';
import { ACTIONS, AREAS, type Action, type Area, type CaseScope, type PermissionMatrix, type PermissionOverride, type ResolvedAccess } from './types.js';
import { normalizeMatrix, normalizeOverrides } from './templates.js';

/** Pure part of the resolver: no database, unit-tested directly. */

export const permKey = (area: Area, action: Action) => `${area}:${action}`;

/** Template matrix + per-user overrides → the allowed set. A deny always beats the template; a grant adds. */
export const effectivePermissions = (matrix: PermissionMatrix, overrides: PermissionOverride[] = []): Set<string> => {
  const m = normalizeMatrix(matrix);
  const allowed = new Set<string>();
  for (const area of AREAS) for (const action of m[area] ?? []) allowed.add(permKey(area, action));
  for (const o of normalizeOverrides(overrides)) {
    if (o.effect === 'grant') allowed.add(permKey(o.area, o.action));
    else allowed.delete(permKey(o.area, o.action));
  }
  return allowed;
};

export const canWith = (access: Pick<ResolvedAccess, 'superAdmin' | 'allowed'>, area: Area, action: Action) =>
  access.superAdmin || access.allowed.has(permKey(area, action));

/** The effective matrix (for the "what can this user do" preview and GET /me/permissions). */
export const toMatrix = (access: Pick<ResolvedAccess, 'superAdmin' | 'allowed'>): Record<Area, Action[]> =>
  Object.fromEntries(AREAS.map((area) => [area, ACTIONS.filter((a) => canWith(access, area, a))])) as Record<Area, Action[]>;

/**
 * Prisma filter of the cases a staff member may see. ALL (the default) = no filter at all, so queries stay
 * exactly as they are today. ASSIGNED = responsible staff member or the team-workflow assignee (the case
 * model's co-assignment: processingAssigneeId); TEAM = the same for every member of the user's teams.
 * Break-glass grants add single cases on top.
 */
export const scopeWhere = (s: {
  userId: string;
  superAdmin: boolean;
  caseScope: CaseScope;
  teamMemberIds: string[];
  breakGlassCaseIds: string[];
}): Prisma.CaseWhereInput => {
  if (s.superAdmin || s.caseScope === 'ALL') return {};
  const people = s.caseScope === 'TEAM' ? [...new Set([s.userId, ...s.teamMemberIds])] : [s.userId];
  const or: Prisma.CaseWhereInput[] = [{ assignedStaffId: { in: people } }, { processingAssigneeId: { in: people } }];
  if (s.breakGlassCaseIds.length) or.push({ id: { in: s.breakGlassCaseIds } });
  return { OR: or };
};

/** Same rule as scopeWhere, on a loaded case row (single-case reads). */
export const caseRowInScope = (
  s: { userId: string; superAdmin: boolean; caseScope: CaseScope; teamMemberIds: string[]; breakGlassCaseIds: string[] },
  c: { id: string; assignedStaffId: string | null; processingAssigneeId: string | null },
) => {
  if (s.superAdmin || s.caseScope === 'ALL') return true;
  if (s.breakGlassCaseIds.includes(c.id)) return true;
  const people = s.caseScope === 'TEAM' ? new Set([s.userId, ...s.teamMemberIds]) : new Set([s.userId]);
  return (!!c.assignedStaffId && people.has(c.assignedStaffId)) || (!!c.processingAssigneeId && people.has(c.processingAssigneeId));
};

/** AND-combines a query's own filter with the scope filter; an empty scope leaves the filter untouched. */
export const withCaseScope = (where: Prisma.CaseWhereInput, scope: Prisma.CaseWhereInput): Prisma.CaseWhereInput =>
  Object.keys(scope).length === 0 ? where : Object.keys(where).length === 0 ? scope : { AND: [where, scope] };
