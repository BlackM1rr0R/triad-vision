import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { effectivePermissions } from './resolve.js';
import { BUILT_IN_TEMPLATES, FULL_MATRIX, builtInByKey, legacyKeyFor, normalizeMatrix, normalizeOverrides } from './templates.js';
import { isCaseScope, type AccessUser, type PermissionMatrix, type ResolvedAccess } from './types.js';

/**
 * Database side of the resolver: loads a staff member's template, overrides, scope, teams and break-glass
 * grants, cached per user. Every write in the Access Center calls invalidateAccess(); entries also expire after
 * CACHE_TTL_MS (and never outlive a break-glass grant), so a change reaches every request within seconds.
 */

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { until: number; access: ResolvedAccess }>();

export const invalidateAccess = (userId?: string) => {
  if (userId) cache.delete(userId);
  else cache.clear();
};

const STAFF_ROLES = new Set(['STAFF', 'ADMIN']);

const superAccess = (user: AccessUser): ResolvedAccess => ({
  userId: user.id,
  role: user.role,
  templateId: null,
  templateKey: null,
  superAdmin: true,
  allowed: new Set(),
  caseScope: 'ALL',
  teamMemberIds: [],
  breakGlassCaseIds: [],
  breakGlassExpiresAt: null,
  manageAccess: true,
});

/** Non-staff (CLIENT / COMPANY / AGENT): no staff permissions at all. */
const noAccess = (user: AccessUser): ResolvedAccess => ({ ...superAccess(user), superAdmin: false, manageAccess: false });

/** Matrix of a built-in template: the stored row when there is one, else the code definition. */
export const builtInMatrix = async (key: string): Promise<{ id: string | null; matrix: PermissionMatrix }> => {
  const row = await prisma.staffRoleTemplate.findUnique({ where: { key }, select: { id: true, matrix: true } });
  if (row) return { id: row.id, matrix: normalizeMatrix(row.matrix) };
  return { id: null, matrix: builtInByKey(key)?.matrix ?? FULL_MATRIX };
};

const loadFresh = async (user: AccessUser): Promise<ResolvedAccess> => {
  const now = new Date();
  const row = await prisma.staffAccess.findUnique({ where: { userId: user.id } });
  let template: { id: string | null; key: string | null; matrix: PermissionMatrix } | null = null;
  if (row?.templateId) {
    const t = await prisma.staffRoleTemplate.findUnique({ where: { id: row.templateId }, select: { id: true, key: true, matrix: true } });
    if (t) template = { id: t.id, key: t.key, matrix: normalizeMatrix(t.matrix) };
  }
  if (!template) {
    // No template chosen (or it vanished): today's access through the legacy template of the role.
    const key = legacyKeyFor(user.role);
    const b = await builtInMatrix(key);
    template = { id: b.id, key, matrix: b.matrix };
  }
  const caseScope = isCaseScope(row?.caseScope) ? row!.caseScope : 'ALL';
  let teamMemberIds: string[] = [];
  if (caseScope === 'TEAM') {
    const mine = await prisma.staffTeamMember.findMany({ where: { userId: user.id }, select: { teamId: true } });
    if (mine.length) {
      const members = await prisma.staffTeamMember.findMany({ where: { teamId: { in: mine.map((m) => m.teamId) } }, select: { userId: true } });
      teamMemberIds = [...new Set(members.map((m) => m.userId))];
    }
  }
  const grants =
    caseScope === 'ALL'
      ? []
      : await prisma.breakGlassGrant.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } }, select: { caseId: true, expiresAt: true } });
  return {
    userId: user.id,
    role: user.role,
    templateId: template.id,
    templateKey: template.key,
    superAdmin: false,
    allowed: effectivePermissions(template.matrix, normalizeOverrides(row?.overrides)),
    caseScope,
    teamMemberIds,
    breakGlassCaseIds: [...new Set(grants.map((g) => g.caseId))],
    breakGlassExpiresAt: grants.length ? Math.min(...grants.map((g) => g.expiresAt.getTime())) : null,
    manageAccess: user.role === 'ADMIN' && !!row?.manageAccess,
  };
};

/** Resolved access of a user (cached). SUPER_ADMIN never touches the database: always everything. */
export const loadAccess = async (user: AccessUser): Promise<ResolvedAccess> => {
  if (user.role === 'SUPER_ADMIN') return superAccess(user);
  if (!STAFF_ROLES.has(user.role)) return noAccess(user);
  const hit = cache.get(user.id);
  const now = Date.now();
  if (hit && hit.until > now && hit.access.role === user.role) return hit.access;
  const access = await loadFresh(user);
  cache.set(user.id, { until: Math.min(now + CACHE_TTL_MS, access.breakGlassExpiresAt ?? Infinity), access });
  return access;
};

/** Creates the built-in template rows that are missing (fresh or test databases); existing rows stay as edited. */
export const ensureBuiltInTemplates = async () => {
  const have = new Set((await prisma.staffRoleTemplate.findMany({ where: { builtIn: true }, select: { key: true } })).map((r) => r.key));
  for (const t of BUILT_IN_TEMPLATES) {
    if (have.has(t.key)) continue;
    await prisma.staffRoleTemplate
      .create({
        data: {
          key: t.key,
          name: t.name as unknown as Prisma.InputJsonValue,
          description: t.description as unknown as Prisma.InputJsonValue,
          matrix: normalizeMatrix(t.matrix) as Prisma.InputJsonValue,
          builtIn: true,
        },
      })
      .catch(() => undefined); // created by a parallel request: fine
  }
};
