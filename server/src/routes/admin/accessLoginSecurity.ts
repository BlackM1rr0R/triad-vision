import { Router } from 'express';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { HttpError, badRequest, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { requireManageAccess } from '../../lib/access/index.js'; // SUPER_ADMIN, or ADMIN with "manage access"
import { LIMITS, LOGIN_ROLES, configLifetimes, invalidateLoginPolicy, isStaffRole, loginPolicy } from '../../lib/loginSecurity/index.js';

/**
 * Access Center › Login security — mounted at /api/admin/access/login-security (SUPER_ADMIN, or an ADMIN granted
 * "manage access"):
 *
 *   GET    /                 roles (stored values + what applies), server defaults, user overrides, 2FA counts per role
 *   PUT    /roles/:role      { require2fa?, webIdleMinutes?, webMaxHours?, mobileIdleDays?, mobileMaxDays?, requireActiveContract? }
 *   GET    /users?q=         find users for an override
 *   PUT    /users/:id        override of one user (same fields as a role, without the contract switch)
 *   DELETE /users/:id        remove the override
 *
 * Rules: staff 2FA can never be switched off (role or user — 400 STAFF_2FA_LOCKED); the contract switch exists for
 * AGENT only; lifetimes stay within LIMITS. Every change is audited (ACCESS_LOGIN_SECURITY_*, before → after) and
 * applies to the next request of every session (lib/loginSecurity cache is dropped).
 */
export const adminAccessLoginSecurityRouter = Router();
adminAccessLoginSecurityRouter.use(requireMinRole('ADMIN'), requireManageAccess);

const lifetime = {
  webIdleMinutes: z.number().int().min(LIMITS.webIdleMinutes.min).max(LIMITS.webIdleMinutes.max).nullable().optional(),
  webMaxHours: z.number().int().min(LIMITS.webMaxHours.min).max(LIMITS.webMaxHours.max).nullable().optional(),
  mobileIdleDays: z.number().int().min(LIMITS.mobileIdleDays.min).max(LIMITS.mobileIdleDays.max).nullable().optional(),
  mobileMaxDays: z.number().int().min(LIMITS.mobileMaxDays.min).max(LIMITS.mobileMaxDays.max).nullable().optional(),
};
const roleBody = z.object({ require2fa: z.boolean().nullable().optional(), requireActiveContract: z.boolean().optional(), ...lifetime }).strict();
const userBody = z.object({ require2fa: z.boolean().nullable().optional(), note: z.string().trim().max(300).nullable().optional(), ...lifetime }).strict();

const ROLE_FIELDS = ['require2fa', 'webIdleMinutes', 'webMaxHours', 'mobileIdleDays', 'mobileMaxDays', 'requireActiveContract'] as const;
const USER_FIELDS = ['require2fa', 'webIdleMinutes', 'webMaxHours', 'mobileIdleDays', 'mobileMaxDays', 'note'] as const;

const pickFields = <T extends Record<string, unknown>>(row: T | null, keys: readonly string[]) =>
  Object.fromEntries(keys.map((k) => [k, row ? (row[k] ?? null) : null]));

adminAccessLoginSecurityRouter.get('/', async (_req, res) => {
  const [roles, users, twoFa] = await Promise.all([
    prisma.loginSecurityRole.findMany(),
    prisma.loginSecurityUser.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 }),
    prisma.user.groupBy({ by: ['role'], where: { isActive: true }, _count: { _all: true } }),
  ]);
  const [withTotp, withEmail] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], where: { isActive: true, totpEnabledAt: { not: null } }, _count: { _all: true } }),
    prisma.user.groupBy({ by: ['role'], where: { isActive: true, totpEnabledAt: null, emailOtpEnabledAt: { not: null } }, _count: { _all: true } }),
  ]);
  const count = (rows: { role: Role; _count: { _all: number } }[], role: Role) => rows.find((r) => r.role === role)?._count._all ?? 0;
  const byRole = new Map(roles.map((r) => [r.role, r]));
  const people = users.length
    ? await prisma.user.findMany({ where: { id: { in: users.map((u) => u.userId) } }, select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, totpEnabledAt: true, emailOtpEnabledAt: true } })
    : [];
  const person = new Map(people.map((p) => [p.id, p]));
  res.json({
    defaults: configLifetimes(),
    limits: LIMITS,
    roles: LOGIN_ROLES.map((role) => {
      const row = byRole.get(role) ?? null;
      const staff = isStaffRole(role);
      return {
        role,
        ...pickFields(row as Record<string, unknown> | null, ROLE_FIELDS),
        requireActiveContract: row?.requireActiveContract ?? false,
        // What applies: staff always need 2FA (locked); others only when switched on.
        twoFactorLocked: staff,
        effective2fa: staff ? true : (row?.require2fa ?? false),
        contractAvailable: role === 'AGENT',
        users: count(twoFa, role),
        withTotp: count(withTotp, role),
        withEmailCode: staff ? 0 : count(withEmail, role),
        updatedAt: row?.updatedAt ?? null,
      };
    }),
    users: users.map((u) => {
      const p = person.get(u.userId);
      return {
        userId: u.userId,
        ...pickFields(u as unknown as Record<string, unknown>, USER_FIELDS),
        user: p ? { email: p.email, name: `${p.firstName} ${p.lastName}`.trim(), role: p.role, isActive: p.isActive, twoFactor: !!p.totpEnabledAt || (!isStaffRole(p.role) && !!p.emailOtpEnabledAt) } : null,
        updatedAt: u.updatedAt,
      };
    }),
  });
});

adminAccessLoginSecurityRouter.put('/roles/:role', async (req, res) => {
  const role = parse(z.enum(LOGIN_ROLES), req.params.role);
  const body = parse(roleBody, req.body);
  if (isStaffRole(role) && body.require2fa === false) throw new HttpError(400, 'STAFF_2FA_LOCKED');
  if (role !== 'AGENT' && body.requireActiveContract) throw badRequest('CONTRACT_ONLY_FOR_PARTNERS');
  const before = await prisma.loginSecurityRole.findUnique({ where: { role } });
  // Staff: 2FA stays required whatever is stored; store null rather than a meaningless value.
  const data = { ...body, ...(isStaffRole(role) ? { require2fa: null } : {}), updatedById: req.user!.id };
  const after = await prisma.loginSecurityRole.upsert({ where: { role }, create: { role, ...data }, update: data });
  invalidateLoginPolicy();
  await loginPolicy();
  await audit(req, 'ACCESS_LOGIN_SECURITY_ROLE_CHANGED', `role:${role}`, {
    before: pickFields(before as Record<string, unknown> | null, ROLE_FIELDS),
    after: pickFields(after as unknown as Record<string, unknown>, ROLE_FIELDS),
  });
  res.json({ role: { role, ...pickFields(after as unknown as Record<string, unknown>, ROLE_FIELDS) } });
});

adminAccessLoginSecurityRouter.get('/users', async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().min(2).max(100) }), req.query).q;
  const items = await prisma.user.findMany({
    where: { OR: [{ email: { contains: q } }, { firstName: { contains: q } }, { lastName: { contains: q } }] },
    orderBy: [{ isActive: 'desc' }, { email: 'asc' }],
    take: 20,
    select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
  });
  res.json({ items });
});

adminAccessLoginSecurityRouter.put('/users/:id', async (req, res) => {
  const id = parse(z.string().min(1).max(64), req.params.id);
  const body = parse(userBody, req.body);
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, email: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  // Never relax 2FA for staff (super admins included): today's rule is the floor.
  if (isStaffRole(user.role) && body.require2fa === false) throw new HttpError(400, 'STAFF_2FA_LOCKED');
  const before = await prisma.loginSecurityUser.findUnique({ where: { userId: id } });
  const data = { ...body, ...(isStaffRole(user.role) ? { require2fa: null } : {}), updatedById: req.user!.id };
  const after = await prisma.loginSecurityUser.upsert({ where: { userId: id }, create: { userId: id, ...data }, update: data });
  invalidateLoginPolicy();
  await loginPolicy();
  await audit(req, 'ACCESS_LOGIN_SECURITY_USER_CHANGED', `user:${id}`, {
    email: user.email,
    before: pickFields(before as Record<string, unknown> | null, USER_FIELDS),
    after: pickFields(after as unknown as Record<string, unknown>, USER_FIELDS),
  });
  res.json({ override: { userId: id, ...pickFields(after as unknown as Record<string, unknown>, USER_FIELDS) } });
});

adminAccessLoginSecurityRouter.delete('/users/:id', async (req, res) => {
  const id = parse(z.string().min(1).max(64), req.params.id);
  const before = await prisma.loginSecurityUser.findUnique({ where: { userId: id } });
  if (!before) throw notFound('OVERRIDE_NOT_FOUND');
  await prisma.loginSecurityUser.delete({ where: { userId: id } });
  invalidateLoginPolicy();
  await loginPolicy();
  await audit(req, 'ACCESS_LOGIN_SECURITY_USER_REMOVED', `user:${id}`, { before: pickFields(before as unknown as Record<string, unknown>, USER_FIELDS) });
  res.json({ ok: true });
});
