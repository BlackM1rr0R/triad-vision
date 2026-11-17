import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { notFound, parse } from '../../lib/http.js';
import { requireManageAccess } from '../../lib/access/index.js'; // SUPER_ADMIN, or ADMIN with "manage access"
import { companyMembersAccess, setMemberAccess } from '../../lib/companyAccess/service.js';
import { COMPANY_PERMS, COMPANY_ROLES, ROLE_TEMPLATES, type CompanyPerm, type CompanyRole } from '../../lib/companyAccess/permissions.js';

/**
 * Access Center › Employers (SUPER_ADMIN, or an ADMIN granted "manage access") — mounted at /api/admin/access/employers:
 *
 *   GET   /meta                         permissions, roles and their templates
 *   GET   /companies?q=                 companies with member counts and how many have a role
 *   GET   /companies/:id/members        members: role, overrides, effective permissions, owner flag
 *   PATCH /members/:userId              { role: STANDARD | OWNER | ADMIN | HR | MANAGER | VIEWER, overrides? }
 *
 * Every change is audit-logged (COMPANY_ACCESS_CHANGED, before → after). The company owner (oldest active login)
 * always keeps every permission, whatever is stored here.
 */
export const adminAccessEmployersRouter = Router();
adminAccessEmployersRouter.use(requireMinRole('ADMIN'), requireManageAccess);

adminAccessEmployersRouter.get('/meta', (_req, res) => {
  res.json({ permissions: COMPANY_PERMS, roles: COMPANY_ROLES, templates: ROLE_TEMPLATES });
});

adminAccessEmployersRouter.get('/companies', async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(100).optional() }), req.query).q;
  const companies = await prisma.company.findMany({
    where: q ? { name: { contains: q } } : {},
    orderBy: { name: 'asc' },
    take: 200,
    select: { id: true, name: true, city: true, status: true, _count: { select: { users: true } } },
  });
  const ids = companies.map((c) => c.id);
  const roles = ids.length
    ? await prisma.companyMemberAccess.groupBy({ by: ['companyId'], where: { companyId: { in: ids }, role: { not: null } }, _count: { _all: true } })
    : [];
  const withRole = new Map(roles.map((r) => [r.companyId, r._count._all]));
  res.json({
    items: companies.map((c) => ({ id: c.id, name: c.name, city: c.city, status: c.status, members: c._count.users, withRole: withRole.get(c.id) ?? 0 })),
  });
});

adminAccessEmployersRouter.get('/companies/:id/members', async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: String(req.params.id) }, select: { id: true, name: true } });
  if (!company) throw notFound('COMPANY_NOT_FOUND');
  const [users, team] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: company.id, role: 'COMPANY' },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, email: true, firstName: true, lastName: true, isActive: true, createdAt: true },
    }),
    companyMembersAccess(company.id),
  ]);
  res.json({
    company,
    members: users.map((u) => {
      const a = team.of(u.id);
      return { ...u, isOwner: a.isOwner, role: a.role ?? 'STANDARD', overrides: a.overrides, permissions: a.perms };
    }),
  });
});

const permsShape = z.object(Object.fromEntries(COMPANY_PERMS.map((p) => [p, z.boolean().optional()])) as Record<CompanyPerm, z.ZodOptional<z.ZodBoolean>>).strict();

adminAccessEmployersRouter.patch('/members/:userId', async (req, res) => {
  const body = parse(z.object({ role: z.enum(['STANDARD', ...COMPANY_ROLES]), overrides: permsShape.nullable().optional() }), req.body ?? {});
  const user = await prisma.user.findUnique({ where: { id: String(req.params.userId) }, select: { id: true, role: true, companyId: true } });
  if (!user || user.role !== 'COMPANY' || !user.companyId) throw notFound('MEMBER_NOT_FOUND');
  const role: CompanyRole | null = body.role === 'STANDARD' ? null : body.role;
  const overrides = body.overrides === undefined ? undefined : body.overrides === null ? null : Object.fromEntries(Object.entries(body.overrides).filter(([, v]) => typeof v === 'boolean'));
  const after = await setMemberAccess(req, { userId: user.id, companyId: user.companyId }, { role, overrides }, 'ACCESS_CENTER');
  const a = (await companyMembersAccess(user.companyId)).of(user.id);
  res.json({ role: after.role ?? 'STANDARD', overrides: after.overrides, permissions: a.perms, isOwner: a.isOwner });
});
