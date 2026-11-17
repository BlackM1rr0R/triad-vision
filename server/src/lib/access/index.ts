/**
 * Central permission resolver for staff (documented interface of the access-control programme):
 *
 *   can(user, area, action)      → Promise<boolean>
 *   requirePerm(area, action)    → express middleware (403 NO_PERMISSION)
 *   caseScopeWhere(user)         → Promise<Prisma.CaseWhereInput> ({} = every case, today's default)
 *   assertCaseInScope(user, id)  → throws 403 OUT_OF_SCOPE
 *   isSuperAdmin(user), canManageAccess(user)
 *
 * Defaults reproduce today's access exactly: every STAFF / ADMIN user is on the legacy template of the role
 * (every area and action) with case scope ALL; the routes' own role checks stay on top.
 */

export * from './types.js';
export { BUILT_IN_TEMPLATES, LEGACY_ADMIN, LEGACY_STAFF, FULL_MATRIX, legacyKeyFor, normalizeMatrix, normalizeOverrides } from './templates.js';
export { effectivePermissions, canWith, scopeWhere, caseRowInScope, withCaseScope, toMatrix, permKey } from './resolve.js';
export { loadAccess, invalidateAccess, ensureBuiltInTemplates } from './store.js';
export { staffAccessGuard, requirePerm, AccessDenied } from './guard.js';
export { classifyRoute, actionFor } from './routeMap.js';
export { requestBreakGlass, revokeBreakGlass, BREAK_GLASS_HOURS, BREAK_GLASS_MIN_REASON } from './breakGlass.js';

export * from './api.js';
