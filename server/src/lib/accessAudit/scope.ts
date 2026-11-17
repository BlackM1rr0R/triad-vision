import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { withCaseScope } from '../access/resolve.js';

/**
 * Case-scope helpers for list / aggregate endpoints (lib/access caseScopeWhere gives the scope).
 *
 * The scope `{}` = every case (today's default, ALL): every helper then returns its input unchanged / null, so
 * a query of a user with the default scope is byte-for-byte the query it was before.
 */

export const isFullScope = (scope: Prisma.CaseWhereInput | null | undefined) => !scope || Object.keys(scope).length === 0;

/** AND-combines a case filter with the scope ({} leaves it untouched). */
export const scoped = (where: Prisma.CaseWhereInput, scope: Prisma.CaseWhereInput | null | undefined): Prisma.CaseWhereInput =>
  isFullScope(scope) ? where : withCaseScope(where, scope!);

/** Ids of the cases in scope; null = every case (no filtering needed). */
export const scopeCaseIds = async (scope: Prisma.CaseWhereInput | null | undefined): Promise<string[] | null> => {
  if (isFullScope(scope)) return null;
  return (await prisma.case.findMany({ where: scope!, select: { id: true } })).map((c) => c.id);
};

/** `{ caseId: { in: ids } }` for models without a case relation; {} when every case is in scope. */
export const caseIdIn = (ids: string[] | null): { caseId?: { in: string[] } } => (ids ? { caseId: { in: ids } } : {});

/** Relation filter `{ case: scope }` for models with a required case relation; {} for the full scope. */
export const viaCase = (scope: Prisma.CaseWhereInput | null | undefined): { case?: Prisma.CaseWhereInput } => (isFullScope(scope) ? {} : { case: scope! });

/**
 * Relation filter for models with an OPTIONAL case link (tasks, bookings, settlements …): rows without a case
 * stay visible, case-linked rows follow the scope.
 */
export const optionalCase = (scope: Prisma.CaseWhereInput | null | undefined): Record<string, unknown> =>
  isFullScope(scope) ? {} : { OR: [{ caseId: null }, { case: scope! }] };

/** In-memory filter of rows carrying a caseId (null ids pass only when `keepUnlinked`). */
export const filterByCaseIds = <T extends { caseId?: string | null }>(rows: T[], ids: string[] | null, keepUnlinked = false): T[] => {
  if (!ids) return rows;
  const set = new Set(ids);
  return rows.filter((r) => (r.caseId ? set.has(r.caseId) : keepUnlinked));
};

/** Clients (role CLIENT) only when they have a case in scope; every other account unchanged. */
export const clientUsersInScope = (scope: Prisma.CaseWhereInput | null | undefined): Prisma.UserWhereInput =>
  isFullScope(scope) ? {} : { OR: [{ role: { not: 'CLIENT' } }, { cases: { some: scope! } }] };
