import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole, revokeUserSessions } from '../../middleware/auth.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { ensurePersonalRoot } from '../../lib/drive/roots.js';
import { password } from '../auth.js';
import { deleteUserAccount, loadDeletionTarget, userDeletionPreview } from '../../lib/userDeletion.js';
import { XLSX_MIME, buildClientsWorkbook } from '../../lib/clientsExcel.js';

export const adminUsersRouter = Router();

const userSelect = {
  id: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  phone: true,
  locale: true,
  isActive: true,
  createdAt: true,
  _count: { select: { cases: true, assignedCases: true, docFiles: true, messages: true } },
} as const;

adminUsersRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({ role: z.enum(['CLIENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN']).optional(), search: z.string().trim().max(120).optional() }),
    req.query,
  );
  const users = await prisma.user.findMany({
    where: {
      ...(q.role ? { role: q.role } : {}),
      ...(q.search
        ? {
            OR: [
              { email: { contains: q.search } },
              { firstName: { contains: q.search } },
              { lastName: { contains: q.search } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: userSelect,
  });
  // Last activity and live sessions, from the session table (one query for the whole page).
  const ids = users.map((u) => u.id);
  const [seen, live, logins30] = ids.length
    ? await Promise.all([
        prisma.session.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _max: { lastSeenAt: true, createdAt: true } }),
        prisma.session.groupBy({ by: ['userId'], where: { userId: { in: ids }, revokedAt: null, expiresAt: { gt: new Date() } }, _count: { _all: true } }),
        prisma.session.groupBy({ by: ['userId'], where: { userId: { in: ids }, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, _count: { _all: true } }),
      ])
    : [[], [], []];
  const seenBy = new Map(seen.map((s) => [s.userId, s._max]));
  const liveBy = new Map(live.map((s) => [s.userId, s._count._all]));
  const loginsBy = new Map(logins30.map((s) => [s.userId, s._count._all]));
  const ONLINE_MS = 5 * 60 * 1000;
  res.json({
    users: users.map((u) => {
      const m = seenBy.get(u.id);
      return {
        ...u,
        lastSeenAt: m?.lastSeenAt ?? null,
        lastLoginAt: m?.createdAt ?? null,
        online: !!m?.lastSeenAt && Date.now() - m.lastSeenAt.getTime() < ONLINE_MS && (liveBy.get(u.id) ?? 0) > 0,
        liveSessions: liveBy.get(u.id) ?? 0,
        logins30d: loginsBy.get(u.id) ?? 0,
      };
    }),
  });
});

adminUsersRouter.get('/staff', async (_req, res) => {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: { firstName: 'asc' },
  });
  res.json({ staff });
});

/** Only the super admin creates staff accounts. A new account also gets its document workspace. */
adminUsersRouter.post('/', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const body = parse(
    z.object({
      email: z.string().trim().toLowerCase().email().max(200),
      password,
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      phone: z.string().trim().max(40).optional(),
      role: z.enum(['STAFF', 'ADMIN']),
    }),
    req.body,
  );
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('EMAIL_TAKEN');
  const { password: pw, ...rest } = body;
  const user = await prisma.user.create({
    data: { ...rest, passwordHash: await bcrypt.hash(pw, 12) },
    select: userSelect,
  });
  await ensurePersonalRoot(user.id);
  await audit(req, 'USER_CREATED', `user:${user.id}`, { email: user.email, role: user.role });
  res.status(201).json({ user });
});

adminUsersRouter.patch('/:id', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const body = parse(
    z.object({
      role: z.enum(['CLIENT', 'STAFF', 'ADMIN']).optional(),
      isActive: z.boolean().optional(),
      password: password.optional(),
    }),
    req.body,
  );
  const id = String(req.params.id);
  if (id === req.user!.id && (body.role || body.isActive === false)) throw badRequest('CANNOT_CHANGE_SELF');
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) throw notFound('USER_NOT_FOUND');
  // There is exactly one super admin (the seeded account); it cannot be demoted or locked out through the API.
  if (target.role === 'SUPER_ADMIN' && (body.role || body.isActive === false)) throw badRequest('CANNOT_CHANGE_SUPER_ADMIN');

  const { password: pw, ...rest } = body;
  const user = await prisma.user.update({
    where: { id },
    data: { ...rest, ...(pw ? { passwordHash: await bcrypt.hash(pw, 12) } : {}) },
    select: userSelect,
  });
  // A new password or a deactivation must take effect on every device at once (a role change is
  // picked up by the next request, because the role is read from the user row each time).
  if (pw || body.isActive === false) await revokeUserSessions(id);
  if (body.role && body.role !== 'CLIENT') await ensurePersonalRoot(id);
  await audit(req, 'USER_UPDATED', `user:${id}`, {
    ...(body.role ? { role: body.role } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    ...(pw ? { passwordReset: true } : {}),
  });
  res.json({ user });
});

/** Logs a user out everywhere (e.g. a lost phone). */
adminUsersRouter.post('/:id/revoke-sessions', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const { count } = await revokeUserSessions(String(req.params.id));
  await audit(req, 'SESSIONS_REVOKED', `user:${req.params.id}`, { count });
  res.json({ ok: true, revoked: count });
});

/** What deleting this account would remove or hand over (shown in the confirmation dialog). */
/** GET /api/admin/users/clients.xlsx — every client as an Excel sheet (super admin; also kept in their drive). */
adminUsersRouter.get('/clients.xlsx', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const data = await buildClientsWorkbook();
  await audit(req, 'CLIENTS_EXPORTED', undefined, { format: 'xlsx' });
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="Butun-musteriler-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(data);
});

adminUsersRouter.get('/:id/deletion-preview', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  res.json(await userDeletionPreview(req.user!.id, String(req.params.id)));
});

/**
 * Hard delete (super admin only). The client must echo the account's email as confirmation.
 * See lib/userDeletion.ts for what is removed, kept, reassigned and moved.
 */
adminUsersRouter.delete('/:id', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const body = parse(z.object({ confirmEmail: z.string().trim().toLowerCase().max(200) }), req.body ?? {});
  const id = String(req.params.id);
  const target = await loadDeletionTarget(req.user!.id, id);
  if (body.confirmEmail !== target.email.toLowerCase()) throw badRequest('CONFIRMATION_MISMATCH');
  const { user, counts } = await deleteUserAccount(req.user!.id, id, req.ip);
  res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role }, counts });
});
