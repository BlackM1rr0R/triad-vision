import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Company } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole, revokeUserSessions } from '../middleware/auth.js';
import { conflict, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { notifyStaff } from '../lib/notifications.js';
import { COMPANY_TEAM_CAP, createTeamMember, sendTeamInvite } from '../lib/companyTeam.js';
import { companyMembersAccess, memberAccess, setMemberAccess } from '../lib/companyAccess/service.js'; // employer roles
import { PORTAL_ASSIGNABLE_ROLES, type CompanyRole } from '../lib/companyAccess/permissions.js';

/**
 * Employer team — mounted at /api/company/team (COMPANY users of a not suspended company):
 *
 *   GET    /             → { members, ownerId, isOwner, canManage, cap }   (every member may look)
 *   POST   /             { email, firstName, lastName, locale?, role? }   manager: invite (set-password link, 7 days)
 *   POST   /:id/resend   manager: new link for a member who has not set a password yet
 *   PATCH  /:id/role     { role: STANDARD | ADMIN | HR | MANAGER | VIEWER }  manager: change a colleague's role
 *   DELETE /:id          manager: deactivate (sessions revoked; the row stays)
 *
 * "Manager" = permission manageTeam (lib/companyAccess): the owner always; ADMIN / OWNER roles too. The owner and
 * explicit OWNER members can only be changed by the owner (or Triad Vision in the Access Center).
 * Only the company's own logins are ever listed or touched. See lib/companyTeam.ts for the owner rule.
 */
export const companyTeamRouter = Router();

const loadCompany: RequestHandler = async (req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: true } });
  if (!u?.company) return next(forbidden('NO_COMPANY'));
  if (u.company.status === 'SUSPENDED') return next(forbidden('COMPANY_SUSPENDED'));
  res.locals.company = u.company;
  next();
};
companyTeamRouter.use(requireRole('COMPANY'), loadCompany);

const co = (res: { locals: Record<string, unknown> }) => res.locals.company as Company;

/** Team management: the owner (today's rule) or a member whose role grants manageTeam. */
const requireOwner: RequestHandler = async (req, res, next) => {
  const access = await memberAccess(req.user!.id);
  if (!access || access.companyId !== co(res).id || !access.perms.manageTeam) return next(forbidden('NOT_COMPANY_OWNER'));
  res.locals.teamActor = access;
  next();
};

/** The owner and explicit OWNER members can only be changed by the owner. */
const assertMayChange = async (res: { locals: Record<string, unknown> }, targetId: string) => {
  const actor = res.locals.teamActor as { isOwner: boolean } | undefined;
  const team = await companyMembersAccess(co(res).id);
  const target = team.of(targetId);
  if (target.isOwner || (target.role === 'OWNER' && !actor?.isOwner)) throw forbidden('CANNOT_CHANGE_OWNER');
  return target;
};

const roleInput = z.enum(['STANDARD', ...PORTAL_ASSIGNABLE_ROLES]);
const storedRole = (r: z.infer<typeof roleInput>): CompanyRole | null => (r === 'STANDARD' ? null : r);

/** Per company owner; invitations send mail, so they are bounded. */
const inviteLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 20, keyGenerator: (req) => `company-team:${req.user?.id ?? req.ip}` });

const memberSelect = { id: true, email: true, firstName: true, lastName: true, isActive: true, createdAt: true, emailVerifiedAt: true } as const;

const ownMember = async (companyId: string, id: string) => {
  const m = await prisma.user.findFirst({ where: { id, companyId, role: 'COMPANY' }, select: { ...memberSelect, locale: true } });
  if (!m) throw notFound('MEMBER_NOT_FOUND');
  return m;
};

companyTeamRouter.get('/', async (req, res) => {
  const company = co(res);
  const [rows, team] = await Promise.all([
    prisma.user.findMany({ where: { companyId: company.id, role: 'COMPANY' }, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }], select: memberSelect }),
    companyMembersAccess(company.id),
  ]);
  const { ownerId } = team;
  const mine = team.of(req.user!.id);
  res.json({
    members: rows.map(({ emailVerifiedAt, ...m }) => ({
      ...m,
      // Invited, password not set yet (setting it through the link verifies the address).
      pending: m.isActive && !emailVerifiedAt,
      owner: m.id === ownerId,
      me: m.id === req.user!.id,
      // Employer role (lib/companyAccess); STANDARD = no role stored (full access, team management for the owner).
      role: m.id === ownerId ? 'OWNER' : (team.of(m.id).role ?? 'STANDARD'),
    })),
    ownerId,
    isOwner: ownerId === req.user!.id,
    canManage: mine.perms.manageTeam,
    assignableRoles: ['STANDARD', ...PORTAL_ASSIGNABLE_ROLES],
    cap: COMPANY_TEAM_CAP,
    activeCount: rows.filter((r) => r.isActive).length,
  });
});

companyTeamRouter.post('/', inviteLimiter, requireOwner, async (req, res) => {
  const body = parse(
    z.object({
      email: z.string().trim().toLowerCase().email().max(191),
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      locale: z.enum(['az', 'de', 'en', 'ru']).optional(),
      role: roleInput.optional(),
    }),
    req.body,
  );
  const company = co(res);
  const active = await prisma.user.count({ where: { companyId: company.id, role: 'COMPANY', isActive: true } });
  if (active >= COMPANY_TEAM_CAP) throw conflict('TEAM_LIMIT_REACHED');
  if (await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } })) throw conflict('EMAIL_TAKEN');
  const inviter = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, locale: true } });
  let user;
  try {
    user = await createTeamMember(company.id, { email: body.email, firstName: body.firstName, lastName: body.lastName, locale: body.locale ?? inviter.locale });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('EMAIL_TAKEN');
    throw err;
  }
  const role = body.role ? storedRole(body.role) : null;
  if (role) await setMemberAccess(req, { userId: user.id, companyId: company.id }, { role }, 'PORTAL');
  await sendTeamInvite(user, `${inviter.firstName} ${inviter.lastName}`.trim(), company.name);
  await audit(req, 'COMPANY_TEAM_INVITED', `company:${company.id}`, { userId: user.id, email: user.email, ...(role ? { role } : {}) });
  await notifyStaff(
    `İşəgötürən komandası: ${company.name}`,
    `${inviter.firstName} ${inviter.lastName} ${company.name} şirkətinin kabinetinə yeni istifadəçi dəvət etdi: ${user.firstName} ${user.lastName} <${user.email}>.`,
    { link: `/admin/companies?id=${company.id}`, type: 'COMPANY_TEAM_INVITED' },
  );
  res.status(201).json({ member: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, isActive: true, createdAt: user.createdAt, pending: true, owner: false, me: false, role: role ?? 'STANDARD' } });
});

companyTeamRouter.patch('/:id/role', requireOwner, async (req, res) => {
  const body = parse(z.object({ role: roleInput }), req.body ?? {});
  const company = co(res);
  const m = await ownMember(company.id, String(req.params.id));
  if (m.id === req.user!.id) throw conflict('CANNOT_CHANGE_SELF');
  await assertMayChange(res, m.id);
  const after = await setMemberAccess(req, { userId: m.id, companyId: company.id }, { role: storedRole(body.role) }, 'PORTAL');
  res.json({ ok: true, role: after.role ?? 'STANDARD' });
});

companyTeamRouter.post('/:id/resend', inviteLimiter, requireOwner, async (req, res) => {
  const company = co(res);
  const m = await ownMember(company.id, String(req.params.id));
  if (!m.isActive) throw conflict('MEMBER_INACTIVE');
  if (m.emailVerifiedAt) throw conflict('ALREADY_ACTIVE');
  const inviter = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
  await sendTeamInvite(m, `${inviter.firstName} ${inviter.lastName}`.trim(), company.name);
  await audit(req, 'COMPANY_TEAM_INVITE_RESENT', `company:${company.id}`, { userId: m.id });
  res.json({ ok: true });
});

companyTeamRouter.delete('/:id', requireOwner, async (req, res) => {
  const company = co(res);
  const m = await ownMember(company.id, String(req.params.id));
  if (m.id === req.user!.id) throw conflict('CANNOT_REMOVE_SELF');
  await assertMayChange(res, m.id);
  if (!m.isActive) {
    res.json({ ok: true });
    return;
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: m.id }, data: { isActive: false } }),
    // An unused set-password link must not reactivate access either.
    prisma.passwordResetToken.updateMany({ where: { userId: m.id, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  await revokeUserSessions(m.id);
  await audit(req, 'COMPANY_TEAM_REMOVED', `company:${company.id}`, { userId: m.id, email: m.email });
  await notifyStaff(
    `İşəgötürən komandası: ${company.name}`,
    `${company.name} şirkətinin kabinetindən istifadəçi deaktiv edildi: ${m.firstName} ${m.lastName} <${m.email}>.`,
    { link: `/admin/companies?id=${company.id}`, type: 'COMPANY_TEAM_REMOVED' },
  );
  res.json({ ok: true });
});
