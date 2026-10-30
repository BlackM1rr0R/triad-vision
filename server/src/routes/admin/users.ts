import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { assertStaffSeat, STAFF_ROLES } from '../../lib/license/index.js';
import { prisma } from '../../db.js';
import { requireMinRole, revokeUserSessions } from '../../middleware/auth.js';
import { HttpError, badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { ensurePersonalRoot } from '../../lib/drive/roots.js';
import { password } from '../auth.js';
import { deleteUserAccount, loadDeletionTarget, userDeletionPreview } from '../../lib/userDeletion.js';
import { XLSX_MIME, buildClientsWorkbook } from '../../lib/clientsExcel.js';
import { clientSettings, stalwartConfig, stalwartDomain } from '../../lib/stalwart/config.js';
import { createStaffMailbox, localPartSchema, preflightStaffMailbox, suggestLocalPart } from '../../lib/stalwart/service.js';

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
  mergedIntoId: true, // merged duplicate (closed stub) → link to the primary
  ownerPartner: { select: { id: true, name: true } }, // partner-owned client (badge; lib/partners/owned.ts)
  _count: { select: { cases: true, assignedCases: true, docFiles: true, messages: true } },
} as const;

adminUsersRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      role: z.enum(['CLIENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN']).optional(),
      search: z.string().trim().max(120).optional(),
      // Clients of a referral partner: a partner id, "any" (some partner) or "none".
      ownerPartnerId: z.string().trim().min(1).max(40).optional(),
      // Only accounts with a live session seen in the last 5 minutes.
      online: z.enum(['1']).optional(),
      // Server paging (default 50 per page, at most 200).
      page: z.coerce.number().int().min(1).max(100_000).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }),
    req.query,
  );
  const ONLINE_MS = 5 * 60 * 1000;
  const now = new Date();
  const onlineWhere: Prisma.UserWhereInput = { sessions: { some: { revokedAt: null, expiresAt: { gt: now }, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) } } } };
  const base: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.ownerPartnerId ? { ownerPartnerId: q.ownerPartnerId === 'none' ? null : q.ownerPartnerId === 'any' ? { not: null } : q.ownerPartnerId } : {}),
    ...(q.search
      ? {
          OR: [
            { email: { contains: q.search } },
            { firstName: { contains: q.search } },
            { lastName: { contains: q.search } },
            { phone: { contains: q.search } },
          ],
        }
      : {}),
  };
  const where: Prisma.UserWhereInput = q.online ? { AND: [base, onlineWhere] } : base;
  const [users, total, onlineCount] = await Promise.all([
    prisma.user.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: userSelect }),
    prisma.user.count({ where }),
    prisma.user.count({ where: { AND: [base, onlineWhere] } }),
  ]);
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
  res.json({
    total,
    page: q.page,
    pageSize: q.pageSize,
    onlineCount,
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

/** "Create mailbox" checkbox of the new-staff dialog: the suggested ad.soyad local part and our domain. */
adminUsersRouter.get('/mailbox-suggestion', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const q = parse(z.object({ firstName: z.string().trim().max(80).default(''), lastName: z.string().trim().max(80).default('') }), req.query);
  res.json({ localPart: suggestLocalPart(q.firstName, q.lastName), domain: stalwartDomain(), configured: !!stalwartConfig() });
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
      // Optional: also create the @domain mailbox (default ad.soyad) on our mail server; password shown once.
      createMailbox: z.boolean().optional(),
      mailboxLocalPart: localPartSchema.optional(),
    }),
    req.body,
  );
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('EMAIL_TAKEN');
  await assertStaffSeat(); // white-label plan: staff seat limit (lib/license)
  const { password: pw, createMailbox: wantsMailbox, mailboxLocalPart, ...rest } = body;
  // Mailbox: checked before the account exists (mail server configured, address free), so a refusal creates nothing.
  let plan: (Awaited<ReturnType<typeof preflightStaffMailbox>> & { localPart: string }) | null = null;
  if (wantsMailbox) {
    const localPart = mailboxLocalPart || suggestLocalPart(rest.firstName, rest.lastName);
    if (!localPart) throw badRequest('INVALID_LOCAL_PART');
    plan = { ...(await preflightStaffMailbox(localPart)), localPart };
  }
  const user = await prisma.user.create({
    data: { ...rest, passwordHash: await bcrypt.hash(pw, 12) },
    select: userSelect,
  });
  await ensurePersonalRoot(user.id);
  await audit(req, 'USER_CREATED', `user:${user.id}`, { email: user.email, role: user.role, ...(plan ? { mailbox: plan.address } : {}) });
  let mailbox: { address: string; password: string; workspaceConnected: boolean; settings: ReturnType<typeof clientSettings> } | { address: string; error: string } | null = null;
  if (plan) {
    try {
      const r = await createStaffMailbox(plan.cfg, user, plan.localPart);
      await audit(req, 'MAILBOX_CREATED', r.mailbox.address, { id: r.mailbox.id, forUser: user.id, generatedPassword: true, workspaceConnected: !!r.workspaceAccountId });
      // The only time this password leaves the server: the admin hands it to the new colleague.
      mailbox = { address: r.mailbox.address, password: r.password, workspaceConnected: !!r.workspaceAccountId, settings: clientSettings() };
    } catch (err) {
      // The staff account stays; the admin can retry on the mailboxes page.
      mailbox = { address: plan.address, error: err instanceof HttpError ? err.code : 'MAIL_SERVER_ERROR' };
    }
  }
  res.status(201).json({ user, mailbox });
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
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
  if (!target) throw notFound('USER_NOT_FOUND');
  // White-label plan: one more active staff account (promotion to staff, or re-activating a staff account)
  // must fit the staff seat limit of the licence (lib/license).
  const wasActiveStaff = target.isActive && STAFF_ROLES.includes(target.role as (typeof STAFF_ROLES)[number]);
  const willBeActiveStaff = (body.isActive ?? target.isActive) && STAFF_ROLES.includes((body.role ?? target.role) as (typeof STAFF_ROLES)[number]);
  if (willBeActiveStaff && !wasActiveStaff) await assertStaffSeat();
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
