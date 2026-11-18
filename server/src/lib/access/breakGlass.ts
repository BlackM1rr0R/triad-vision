import type { Request } from 'express';
import { prisma } from '../../db.js';
import { audit } from '../audit.js';
import { HttpError, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { caseRowInScope } from './resolve.js';
import { invalidateAccess, loadAccess } from './store.js';
import { accessText } from './texts.js';
import { canManageAccess } from './api.js';

/**
 * Break-glass: a staff member with a restricted case scope opens one case outside it in an emergency. The
 * reason is mandatory (≥ 10 characters), the grant expires after BREAK_GLASS_HOURS, every grant is audit-logged
 * and every ADMIN / SUPER_ADMIN is notified.
 */
export const BREAK_GLASS_HOURS = 8;
export const BREAK_GLASS_MIN_REASON = 10;

export const requestBreakGlass = async (req: Request, caseId: string, reason: string) => {
  const user = req.user!;
  if (user.role !== 'STAFF' && user.role !== 'ADMIN') throw new HttpError(400, 'NOT_NEEDED');
  const trimmed = reason.trim();
  if (trimmed.length < BREAK_GLASS_MIN_REASON) throw new HttpError(400, 'REASON_TOO_SHORT');
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, assignedStaffId: true, processingAssigneeId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const access = await loadAccess(user);
  if (caseRowInScope(access, c)) throw new HttpError(409, 'ALREADY_IN_SCOPE');
  const expiresAt = new Date(Date.now() + BREAK_GLASS_HOURS * 60 * 60 * 1000);
  const grant = await prisma.breakGlassGrant.create({ data: { userId: user.id, caseId: c.id, reason: trimmed.slice(0, 2000), expiresAt } });
  invalidateAccess(user.id);
  await audit(req, 'ACCESS_BREAK_GLASS', `case:${c.id}`, { grantId: grant.id, reason: trimmed.slice(0, 2000), expiresAt: expiresAt.toISOString(), caseNumber: c.number });
  const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true, id: { not: user.id } }, select: { id: true, role: true, locale: true } });
  const who = `${user.firstName} ${user.lastName}`.trim() || user.email;
  await Promise.all(
    admins.map(async (a) => {
      const t = accessText(a.locale);
      // Only those who may open the Access Center get the link (others would land on "no access").
      const link = (await canManageAccess(a)) ? '/admin/access?tab=scope' : undefined;
      return notifyUser(a.id, {
        type: 'ACCESS_BREAK_GLASS',
        title: t.breakGlassTitle(who, c.number),
        body: t.breakGlassBody(trimmed.slice(0, 500), BREAK_GLASS_HOURS),
        link,
        caseId: c.id,
        push: true,
        email: true,
      }).catch(() => undefined);
    }),
  );
  return { id: grant.id, caseId: c.id, expiresAt };
};

export const revokeBreakGlass = async (req: Request, grantId: string) => {
  const g = await prisma.breakGlassGrant.findUnique({ where: { id: grantId } });
  if (!g) throw notFound('GRANT_NOT_FOUND');
  if (g.revokedAt) return g;
  const updated = await prisma.breakGlassGrant.update({ where: { id: g.id }, data: { revokedAt: new Date(), revokedById: req.user!.id } });
  invalidateAccess(g.userId);
  await audit(req, 'ACCESS_BREAK_GLASS_REVOKED', `case:${g.caseId}`, { grantId: g.id, userId: g.userId });
  return updated;
};
