import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../../lib/http.js';
import {
  ACTIONS,
  AREAS,
  BREAK_GLASS_HOURS,
  BREAK_GLASS_MIN_REASON,
  BUILT_IN_TEMPLATES,
  CASE_SCOPES,
  canManageAccess,
  ensureBuiltInTemplates,
  invalidateAccess,
  legacyKeyFor,
  loadAccess,
  normalizeMatrix,
  normalizeOverrides,
  requestBreakGlass,
  requireManageAccess,
  revokeBreakGlass,
  toMatrix,
} from '../../lib/access/index.js';
import { matrixEquals } from '../../lib/access/templates.js';

/**
 * Access Center › staff roles + case scope (core of the access-control programme), mounted at /api/admin/access:
 *
 *   GET    /me                                  can the caller open the Access Center (any staff)
 *   POST   /break-glass                         { caseId, reason ≥ 10 } emergency access to one case (any staff)
 *   GET    /break-glass/mine                    own active grants (any staff)
 *   ── SUPER_ADMIN, or an ADMIN granted "manage access" ──
 *   GET    /staff/meta                          areas, actions, scopes, built-in keys
 *   GET    /staff/templates                     templates (+ users per template)
 *   POST   /staff/templates                     custom template
 *   PUT    /staff/templates/:id                 name / description / matrix (built-in ones too)
 *   POST   /staff/templates/:id/reset           built-in template back to its definition
 *   DELETE /staff/templates/:id                 custom template that nobody uses
 *   GET    /staff/users                         staff with template, overrides, scope, teams
 *   PUT    /staff/users/:id                     { templateId | null, overrides, manageAccess? }
 *   GET    /staff/users/:id/preview             effective permissions ("what this user can do")
 *   PUT    /scope/users/:id                     { caseScope: ALL | ASSIGNED | TEAM }
 *   GET    /scope/teams · POST · PUT /:id · DELETE /:id
 *   GET    /scope/break-glass                   break-glass log
 *   POST   /scope/break-glass/:id/revoke
 *
 * Rules: SUPER_ADMIN accounts are never restricted (always everything) and nobody edits their own access;
 * "manage access" is granted by a SUPER_ADMIN only, and only to ADMIN users. Every change is audit-logged with
 * before → after.
 */
export const adminAccessStaffRouter = Router();

// ─── Any staff member ─────────────────────────────────────────────────

adminAccessStaffRouter.get('/me', async (req, res) => {
  res.json({ canManage: await canManageAccess(req.user), superAdmin: req.user!.role === 'SUPER_ADMIN' });
});

adminAccessStaffRouter.post('/break-glass', async (req, res) => {
  const body = parse(z.object({ caseId: z.string().trim().min(1).max(40), reason: z.string().trim().min(BREAK_GLASS_MIN_REASON).max(2000) }), req.body);
  const grant = await requestBreakGlass(req, body.caseId, body.reason);
  res.status(201).json({ grant, hours: BREAK_GLASS_HOURS });
});

adminAccessStaffRouter.get('/break-glass/mine', async (req, res) => {
  const grants = await prisma.breakGlassGrant.findMany({
    where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ grants });
});

// ─── Access Center (manage access) ──────────────────────────────────────

// Only this router's own tabs: other tabs (/access/employers, /access/sensitive, …) bring their own checks.
adminAccessStaffRouter.use(['/staff', '/scope'], requireManageAccess);
const gated = adminAccessStaffRouter;

const localized = z.object({
  az: z.string().trim().min(1).max(120),
  de: z.string().trim().max(120).optional(),
  en: z.string().trim().max(120).optional(),
  ru: z.string().trim().max(120).optional(),
});
const localizedLong = z.object({ az: z.string().trim().max(400), de: z.string().trim().max(400).optional(), en: z.string().trim().max(400).optional(), ru: z.string().trim().max(400).optional() });
const fill = (v: { az: string; de?: string; en?: string; ru?: string }) => ({ az: v.az, de: v.de || v.az, en: v.en || v.az, ru: v.ru || v.az });
const matrixSchema = z.record(z.enum(AREAS), z.array(z.enum(ACTIONS)).max(ACTIONS.length));
const overridesSchema = z.array(z.object({ area: z.enum(AREAS), action: z.enum(ACTIONS), effect: z.enum(['grant', 'deny']) })).max(AREAS.length * ACTIONS.length);

gated.get('/staff/meta', (_req, res) => {
  res.json({ areas: AREAS, actions: ACTIONS, scopes: CASE_SCOPES, builtIn: BUILT_IN_TEMPLATES.map((t) => t.key), breakGlassHours: BREAK_GLASS_HOURS });
});

const templateUsage = async () => {
  const rows = await prisma.staffAccess.groupBy({ by: ['templateId'], _count: { _all: true } });
  return new Map(rows.map((r) => [r.templateId ?? '', r._count._all]));
};

gated.get('/staff/templates', async (_req, res) => {
  await ensureBuiltInTemplates();
  const [rows, usage, staff] = await Promise.all([
    prisma.staffRoleTemplate.findMany({ orderBy: [{ builtIn: 'desc' }, { createdAt: 'asc' }] }),
    templateUsage(),
    prisma.user.findMany({ where: { role: { in: ['STAFF', 'ADMIN'] } }, select: { id: true, role: true } }),
  ]);
  // Users without an explicit template are on the legacy template of their role.
  const explicit = new Set((await prisma.staffAccess.findMany({ where: { templateId: { not: null } }, select: { userId: true } })).map((r) => r.userId));
  const legacyCount = (key: string) => staff.filter((u) => !explicit.has(u.id) && legacyKeyFor(u.role) === key).length;
  const order = BUILT_IN_TEMPLATES.map((t) => t.key);
  res.json({
    templates: rows
      .map((t) => {
        const def = BUILT_IN_TEMPLATES.find((b) => b.key === t.key);
        return {
          id: t.id,
          key: t.key,
          name: t.name,
          description: t.description,
          matrix: normalizeMatrix(t.matrix),
          builtIn: t.builtIn,
          modified: def ? !matrixEquals(def.matrix, normalizeMatrix(t.matrix)) : false,
          users: (usage.get(t.id) ?? 0) + (t.key ? legacyCount(t.key) : 0),
          updatedAt: t.updatedAt,
        };
      })
      .sort((a, b) => (a.key ? order.indexOf(a.key) : 99) - (b.key ? order.indexOf(b.key) : 99)),
  });
});

const templateSnapshot = (t: { name: unknown; description: unknown; matrix: unknown }) => ({ name: t.name, description: t.description, matrix: normalizeMatrix(t.matrix) }) as Prisma.InputJsonObject;

gated.post('/staff/templates', async (req, res) => {
  const body = parse(z.object({ name: localized, description: localizedLong.optional(), matrix: matrixSchema }), req.body);
  const t = await prisma.staffRoleTemplate.create({
    data: { name: fill(body.name), description: body.description ? fill(body.description) : undefined, matrix: normalizeMatrix(body.matrix) as Prisma.InputJsonValue, updatedById: req.user!.id },
  });
  await audit(req, 'ACCESS_TEMPLATE_CREATED', `staff-template:${t.id}`, { before: null, after: templateSnapshot(t) });
  res.status(201).json({ template: t });
});

gated.put('/staff/templates/:id', async (req, res) => {
  const body = parse(z.object({ name: localized.optional(), description: localizedLong.nullable().optional(), matrix: matrixSchema.optional() }), req.body);
  const before = await prisma.staffRoleTemplate.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound('TEMPLATE_NOT_FOUND');
  const t = await prisma.staffRoleTemplate.update({
    where: { id: before.id },
    data: {
      ...(body.name ? { name: fill(body.name) } : {}),
      ...(body.description !== undefined ? { description: body.description ? fill(body.description) : undefined } : {}),
      ...(body.matrix ? { matrix: normalizeMatrix(body.matrix) as Prisma.InputJsonValue } : {}),
      updatedById: req.user!.id,
    },
  });
  invalidateAccess();
  await audit(req, 'ACCESS_TEMPLATE_UPDATED', `staff-template:${t.id}`, { key: t.key, before: templateSnapshot(before), after: templateSnapshot(t) });
  res.json({ template: t });
});

gated.post('/staff/templates/:id/reset', async (req, res) => {
  const before = await prisma.staffRoleTemplate.findUnique({ where: { id: String(req.params.id) } });
  const def = BUILT_IN_TEMPLATES.find((b) => b.key === before?.key);
  if (!before || !def) throw notFound('TEMPLATE_NOT_FOUND');
  const t = await prisma.staffRoleTemplate.update({
    where: { id: before.id },
    data: { name: def.name, description: def.description, matrix: normalizeMatrix(def.matrix) as Prisma.InputJsonValue, updatedById: req.user!.id },
  });
  invalidateAccess();
  await audit(req, 'ACCESS_TEMPLATE_UPDATED', `staff-template:${t.id}`, { key: t.key, reset: true, before: templateSnapshot(before), after: templateSnapshot(t) });
  res.json({ template: t });
});

gated.delete('/staff/templates/:id', async (req, res) => {
  const t = await prisma.staffRoleTemplate.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  if (t.builtIn) throw badRequest('BUILT_IN_TEMPLATE');
  if (await prisma.staffAccess.count({ where: { templateId: t.id } })) throw conflict('TEMPLATE_IN_USE');
  await prisma.staffRoleTemplate.delete({ where: { id: t.id } });
  await audit(req, 'ACCESS_TEMPLATE_DELETED', `staff-template:${t.id}`, { before: templateSnapshot(t), after: null });
  res.status(204).end();
});

// ─── Users ─────────────────────────────────────────────────────────────

const staffUsers = () =>
  prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true },
    orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }],
  });

gated.get('/staff/users', async (_req, res) => {
  const [users, rows, members] = await Promise.all([
    staffUsers(),
    prisma.staffAccess.findMany(),
    prisma.staffTeamMember.findMany({ select: { userId: true, teamId: true } }),
  ]);
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  res.json({
    users: users.map((u) => {
      const row = byUser.get(u.id);
      return {
        ...u,
        templateId: row?.templateId ?? null,
        legacyKey: legacyKeyFor(u.role),
        overrides: normalizeOverrides(row?.overrides),
        caseScope: u.role === 'SUPER_ADMIN' ? 'ALL' : (row?.caseScope ?? 'ALL'),
        manageAccess: u.role === 'SUPER_ADMIN' || (u.role === 'ADMIN' && !!row?.manageAccess),
        teamIds: members.filter((m) => m.userId === u.id).map((m) => m.teamId),
      };
    }),
  });
});

/** Target of an access change: an existing STAFF / ADMIN account that is not the caller. */
const editableTarget = async (req: Request) => {
  const id = String(req.params.id);
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) throw notFound('USER_NOT_FOUND');
  if (target.role === 'SUPER_ADMIN') throw badRequest('SUPER_ADMIN_ALWAYS_FULL');
  if (target.id === req.user!.id) throw badRequest('CANNOT_CHANGE_OWN_ACCESS');
  if (target.role !== 'STAFF' && target.role !== 'ADMIN') throw badRequest('NOT_STAFF');
  return target;
};

const accessSnapshot = (r: { templateId: string | null; overrides: unknown; caseScope: string; manageAccess: boolean } | null) =>
  r ? ({ templateId: r.templateId, overrides: normalizeOverrides(r.overrides), caseScope: r.caseScope, manageAccess: r.manageAccess } as unknown as Prisma.InputJsonObject) : null;

gated.put('/staff/users/:id', async (req, res) => {
  const target = await editableTarget(req);
  const body = parse(z.object({ templateId: z.string().max(40).nullable().optional(), overrides: overridesSchema.optional(), manageAccess: z.boolean().optional() }), req.body);
  if (body.templateId && !(await prisma.staffRoleTemplate.count({ where: { id: body.templateId } }))) throw badRequest('TEMPLATE_NOT_FOUND');
  const before = await prisma.staffAccess.findUnique({ where: { userId: target.id } });
  if (body.manageAccess !== undefined && body.manageAccess !== !!before?.manageAccess) {
    if (req.user!.role !== 'SUPER_ADMIN') throw forbidden('SUPER_ADMIN_ONLY');
    if (body.manageAccess && target.role !== 'ADMIN') throw badRequest('MANAGE_ACCESS_ADMIN_ONLY');
  }
  const data = {
    ...(body.templateId !== undefined ? { templateId: body.templateId } : {}),
    ...(body.overrides ? { overrides: normalizeOverrides(body.overrides) as unknown as Prisma.InputJsonValue } : {}),
    ...(body.manageAccess !== undefined ? { manageAccess: body.manageAccess && target.role === 'ADMIN' } : {}),
    updatedById: req.user!.id,
  };
  const after = await prisma.staffAccess.upsert({ where: { userId: target.id }, create: { userId: target.id, ...data }, update: data });
  invalidateAccess(target.id);
  await audit(req, 'ACCESS_USER_UPDATED', `user:${target.id}`, { before: accessSnapshot(before), after: accessSnapshot(after) });
  res.json({ access: { ...after, overrides: normalizeOverrides(after.overrides) } });
});

gated.get('/staff/users/:id/preview', async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: String(req.params.id) }, select: { id: true, role: true, firstName: true, lastName: true } });
  if (!u || !['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(u.role)) throw notFound('USER_NOT_FOUND');
  const access = await loadAccess(u);
  res.json({
    user: u,
    superAdmin: access.superAdmin,
    templateId: access.templateId,
    templateKey: access.templateKey,
    matrix: toMatrix(access),
    caseScope: access.caseScope,
    teamMemberIds: access.teamMemberIds,
    breakGlassCaseIds: access.breakGlassCaseIds,
    manageAccess: access.manageAccess,
  });
});

// ─── Case scope + teams ────────────────────────────────────────────────

gated.put('/scope/users/:id', async (req, res) => {
  const target = await editableTarget(req);
  const body = parse(z.object({ caseScope: z.enum(CASE_SCOPES) }), req.body);
  const before = await prisma.staffAccess.findUnique({ where: { userId: target.id } });
  const after = await prisma.staffAccess.upsert({
    where: { userId: target.id },
    create: { userId: target.id, caseScope: body.caseScope, updatedById: req.user!.id },
    update: { caseScope: body.caseScope, updatedById: req.user!.id },
  });
  invalidateAccess(target.id);
  await audit(req, 'ACCESS_SCOPE_UPDATED', `user:${target.id}`, { before: accessSnapshot(before), after: accessSnapshot(after) });
  res.json({ access: { ...after, overrides: normalizeOverrides(after.overrides) } });
});

const teamInclude = { members: { select: { userId: true } } } as const;
const teamSnapshot = (t: { name: string; description: string | null; members: { userId: string }[] }) => ({ name: t.name, description: t.description, memberIds: t.members.map((m) => m.userId).sort() });

gated.get('/scope/teams', async (_req, res) => {
  const teams = await prisma.staffTeam.findMany({ include: teamInclude, orderBy: { name: 'asc' } });
  res.json({ teams: teams.map((t) => ({ id: t.id, name: t.name, description: t.description, memberIds: t.members.map((m) => m.userId) })) });
});

const teamBody = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(300).nullable().optional(), memberIds: z.array(z.string().max(40)).max(500).default([]) });

const staffIds = async (ids: string[]) =>
  (await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] }, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } })).map((u) => u.id);

gated.post('/scope/teams', async (req, res) => {
  const body = parse(teamBody, req.body);
  const members = await staffIds(body.memberIds);
  const t = await prisma.staffTeam.create({ data: { name: body.name, description: body.description ?? null, members: { create: members.map((userId) => ({ userId })) } }, include: teamInclude });
  invalidateAccess();
  await audit(req, 'ACCESS_TEAM_CREATED', `staff-team:${t.id}`, { before: null, after: teamSnapshot(t) });
  res.status(201).json({ team: { id: t.id, name: t.name, description: t.description, memberIds: t.members.map((m) => m.userId) } });
});

gated.put('/scope/teams/:id', async (req, res) => {
  const body = parse(teamBody.partial(), req.body);
  const before = await prisma.staffTeam.findUnique({ where: { id: String(req.params.id) }, include: teamInclude });
  if (!before) throw notFound('TEAM_NOT_FOUND');
  const members = body.memberIds ? await staffIds(body.memberIds) : null;
  const t = await prisma.$transaction(async (tx) => {
    if (members) {
      await tx.staffTeamMember.deleteMany({ where: { teamId: before.id } });
      if (members.length) await tx.staffTeamMember.createMany({ data: members.map((userId) => ({ teamId: before.id, userId })) });
    }
    return tx.staffTeam.update({
      where: { id: before.id },
      data: { ...(body.name ? { name: body.name } : {}), ...(body.description !== undefined ? { description: body.description ?? null } : {}) },
      include: teamInclude,
    });
  });
  invalidateAccess();
  await audit(req, 'ACCESS_TEAM_UPDATED', `staff-team:${t.id}`, { before: teamSnapshot(before), after: teamSnapshot(t) });
  res.json({ team: { id: t.id, name: t.name, description: t.description, memberIds: t.members.map((m) => m.userId) } });
});

gated.delete('/scope/teams/:id', async (req, res) => {
  const before = await prisma.staffTeam.findUnique({ where: { id: String(req.params.id) }, include: teamInclude });
  if (!before) throw notFound('TEAM_NOT_FOUND');
  await prisma.staffTeam.delete({ where: { id: before.id } });
  invalidateAccess();
  await audit(req, 'ACCESS_TEAM_DELETED', `staff-team:${before.id}`, { before: teamSnapshot(before), after: null });
  res.status(204).end();
});

// ─── Break-glass log ───────────────────────────────────────────────────

gated.get('/scope/break-glass', async (req, res) => {
  const q = parse(z.object({ active: z.enum(['1', 'true', '0', 'false']).optional() }), req.query);
  const activeOnly = q.active === '1' || q.active === 'true';
  const grants = await prisma.breakGlassGrant.findMany({
    where: activeOnly ? { revokedAt: null, expiresAt: { gt: new Date() } } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const [users, cases] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(grants.flatMap((g) => [g.userId, g.revokedById].filter((x): x is string => !!x)))] } }, select: { id: true, firstName: true, lastName: true, email: true } }),
    prisma.case.findMany({ where: { id: { in: [...new Set(grants.map((g) => g.caseId))] } }, select: { id: true, number: true } }),
  ]);
  const u = new Map(users.map((x) => [x.id, x]));
  const c = new Map(cases.map((x) => [x.id, x.number]));
  const now = Date.now();
  res.json({
    grants: grants.map((g) => ({
      ...g,
      user: u.get(g.userId) ?? null,
      revokedBy: g.revokedById ? (u.get(g.revokedById) ?? null) : null,
      caseNumber: c.get(g.caseId) ?? null,
      active: !g.revokedAt && g.expiresAt.getTime() > now,
    })),
  });
});

gated.post('/scope/break-glass/:id/revoke', async (req, res) => {
  const g = await revokeBreakGlass(req, String(req.params.id));
  res.json({ grant: g });
});

// ─── Own permissions (GET /api/admin/me/permissions): the sidebar hides what the user cannot open ──────────

export const adminMePermissionsRouter = Router();

adminMePermissionsRouter.get('/me/permissions', async (req, res) => {
  const access = await loadAccess(req.user!);
  const template = access.templateId ? await prisma.staffRoleTemplate.findUnique({ where: { id: access.templateId }, select: { id: true, key: true, name: true } }) : null;
  res.json({
    role: req.user!.role,
    superAdmin: access.superAdmin,
    template: template ?? (access.templateKey ? { id: null, key: access.templateKey, name: BUILT_IN_TEMPLATES.find((t) => t.key === access.templateKey)?.name ?? null } : null),
    matrix: toMatrix(access),
    caseScope: access.caseScope,
    manageAccess: access.superAdmin || access.manageAccess,
    breakGlassCaseIds: access.breakGlassCaseIds,
  });
});
