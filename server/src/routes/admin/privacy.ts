import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, PrivacyRequestStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { deleteUserAccount, userDeletionPreview } from '../../lib/userDeletion.js';
import { CONSENT_TYPES } from '../../lib/privacy/consents.js';
import { dataOverview, notifyRequestDecided, OPEN_STATUSES } from '../../lib/privacy/requests.js';

/**
 * Admin → Privacy requests (ADMIN+; executing a deletion is SUPER_ADMIN only).
 *
 *   GET  /requests?status=&type=&overdue=1&q=   list + counts
 *   GET  /requests/:id                           detail with the user's data overview (+ deletion preview)
 *   POST /requests/:id/status                    { status, decisionNote }
 *   POST /requests/:id/execute-deletion          { confirmEmail } → deleteUserAccount, request COMPLETED
 *   GET  /consents?email=&type=&from=&to=&format=csv   consent log search / CSV
 */
export const adminPrivacyRouter = Router();
adminPrivacyRouter.use(requireMinRole('ADMIN'));

const STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'] as const;
const TYPES = ['EXPORT', 'DELETION', 'RECTIFICATION', 'RESTRICTION', 'OBJECTION'] as const;
const FINAL: PrivacyRequestStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];
const DAY = 24 * 60 * 60 * 1000;
/** "Due soon" window shown in the list and used by the reminder job. */
export const DUE_SOON_DAYS = 7;

const listInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, locale: true } },
  handledBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PrivacyRequestInclude;

const withFlags = <T extends { status: PrivacyRequestStatus; dueAt: Date }>(r: T, now = new Date()) => {
  const open = (OPEN_STATUSES as readonly string[]).includes(r.status);
  return {
    ...r,
    overdue: open && r.dueAt.getTime() < now.getTime(),
    dueSoon: open && r.dueAt.getTime() >= now.getTime() && r.dueAt.getTime() < now.getTime() + DUE_SOON_DAYS * DAY,
  };
};

adminPrivacyRouter.get('/requests', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(STATUSES).optional(),
      type: z.enum(TYPES).optional(),
      overdue: z.enum(['1', 'true']).optional(),
      q: z.string().trim().max(200).optional(),
    }),
    req.query,
  );
  const now = new Date();
  const where: Prisma.PrivacyRequestWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.type) where.type = q.type;
  if (q.overdue) Object.assign(where, { status: { in: [...OPEN_STATUSES] }, dueAt: { lt: now } });
  if (q.q) where.email = { contains: q.q.toLowerCase() };

  const [items, byStatus, overdue, dueSoon] = await Promise.all([
    prisma.privacyRequest.findMany({ where, orderBy: [{ dueAt: 'asc' }], take: 500, include: listInclude }),
    prisma.privacyRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.privacyRequest.count({ where: { status: { in: [...OPEN_STATUSES] }, dueAt: { lt: now } } }),
    prisma.privacyRequest.count({ where: { status: { in: [...OPEN_STATUSES] }, dueAt: { gte: now, lt: new Date(now.getTime() + DUE_SOON_DAYS * DAY) } } }),
  ]);
  // Open first (by deadline), then closed (newest first).
  const sorted = [...items].sort((a, b) => {
    const ao = FINAL.includes(a.status) ? 1 : 0;
    const bo = FINAL.includes(b.status) ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return ao ? b.createdAt.getTime() - a.createdAt.getTime() : a.dueAt.getTime() - b.dueAt.getTime();
  });
  res.json({
    items: sorted.map((r) => withFlags(r, now)),
    counts: {
      byStatus: Object.fromEntries(STATUSES.map((s) => [s, byStatus.find((b) => b.status === s)?._count._all ?? 0])),
      overdue,
      dueSoon,
    },
  });
});

/** The account the request is about: linked user, else (public form) an account with the same email. */
const subjectUser = async (r: { userId: string | null; email: string }) => {
  if (r.userId) return prisma.user.findUnique({ where: { id: r.userId } });
  return prisma.user.findUnique({ where: { email: r.email } });
};

adminPrivacyRouter.get('/requests/:id', async (req, res) => {
  const r = await prisma.privacyRequest.findUnique({ where: { id: String(req.params.id) }, include: listInclude });
  if (!r) throw notFound('REQUEST_NOT_FOUND');
  const subject = await subjectUser(r);
  let overview = null;
  let deletionPreview: Awaited<ReturnType<typeof userDeletionPreview>> | null = null;
  let deletionBlocked: string | null = null;
  if (subject) {
    overview = await dataOverview(subject.id);
    if (r.type === 'DELETION' && !FINAL.includes(r.status)) {
      try {
        deletionPreview = await userDeletionPreview(req.user!.id, subject.id);
      } catch (err) {
        deletionBlocked = (err as { code?: string }).code ?? 'USER_DELETE_BLOCKED';
      }
    }
  }
  const [consentLog, otherRequests] = await Promise.all([
    subject
      ? prisma.consentRecord.findMany({ where: { userId: subject.id }, orderBy: { createdAt: 'desc' }, take: 50 })
      : prisma.consentRecord.findMany({ where: { email: r.email }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.privacyRequest.findMany({
      where: { id: { not: r.id }, OR: [{ email: r.email }, ...(subject ? [{ userId: subject.id }] : [])] },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, type: true, status: true, createdAt: true, dueAt: true },
    }),
  ]);
  res.json({
    item: withFlags(r),
    subject: subject && {
      id: subject.id,
      email: subject.email,
      firstName: subject.firstName,
      lastName: subject.lastName,
      role: subject.role,
      phone: subject.phone,
      locale: subject.locale,
      isActive: subject.isActive,
      createdAt: subject.createdAt,
      // Matched by email only (public form): identity must be verified before acting.
      matchedByEmail: !r.userId,
    },
    overview,
    deletionPreview,
    deletionBlocked,
    consentLog,
    otherRequests,
  });
});

adminPrivacyRouter.post('/requests/:id/status', async (req, res) => {
  const body = parse(
    z.object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED']),
      decisionNote: z.string().trim().max(5000).optional(),
    }),
    req.body ?? {},
  );
  const r = await prisma.privacyRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound('REQUEST_NOT_FOUND');
  if (FINAL.includes(r.status)) throw conflict('REQUEST_CLOSED');
  if (body.status === 'REJECTED' && !body.decisionNote) throw badRequest('DECISION_NOTE_REQUIRED');
  if (body.status === 'COMPLETED' && r.type === 'DELETION' && (await subjectUser(r))) {
    // The account still exists: completion goes through execute-deletion (super admin).
    throw conflict('USE_EXECUTE_DELETION');
  }
  const final = body.status === 'COMPLETED' || body.status === 'REJECTED';
  const updated = await prisma.privacyRequest.update({
    where: { id: r.id },
    data: {
      status: body.status,
      decisionNote: body.decisionNote ?? r.decisionNote,
      handledById: req.user!.id,
      completedAt: final ? new Date() : null,
    },
    include: listInclude,
  });
  await audit(req, 'PRIVACY_REQUEST_STATUS', `privacy-request:${r.id}`, { from: r.status, to: body.status, type: r.type });
  if (final) await notifyRequestDecided(updated);
  res.json({ item: withFlags(updated) });
});

adminPrivacyRouter.post('/requests/:id/execute-deletion', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const { confirmEmail } = parse(z.object({ confirmEmail: z.string().trim().max(200) }), req.body ?? {});
  const r = await prisma.privacyRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound('REQUEST_NOT_FOUND');
  if (r.type !== 'DELETION') throw badRequest('NOT_A_DELETION_REQUEST');
  if (r.status !== 'IN_PROGRESS') throw conflict('REQUEST_NOT_IN_PROGRESS');
  const subject = await subjectUser(r);
  if (!subject) throw notFound('USER_NOT_FOUND');
  if (confirmEmail.toLowerCase() !== subject.email.toLowerCase()) throw badRequest('CONFIRMATION_MISMATCH');
  const locale = subject.locale;

  const { user, counts } = await deleteUserAccount(req.user!.id, subject.id, req.ip);

  // The request row stays (userId is now NULL) with the email as proof of completion.
  const updated = await prisma.privacyRequest.update({
    where: { id: r.id },
    data: { status: 'COMPLETED', completedAt: new Date(), handledById: req.user!.id, decisionNote: r.decisionNote ?? 'Account deleted' },
  });
  await audit(req, 'PRIVACY_DELETION_EXECUTED', `privacy-request:${r.id}`, { userId: user.id, email: user.email, counts: { ...counts } });
  await notifyRequestDecided(updated, locale);
  res.json({ ok: true, counts, item: withFlags(updated) });
});

// ─── Consent log ───────────────────────────────────────────────────────

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

adminPrivacyRouter.get('/consents', async (req, res) => {
  const q = parse(
    z.object({
      email: z.string().trim().max(200).optional(),
      type: z.enum(CONSENT_TYPES).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      format: z.enum(['json', 'csv']).optional(),
    }),
    req.query,
  );
  const where: Prisma.ConsentRecordWhereInput = {};
  if (q.email) {
    const e = q.email.toLowerCase();
    where.OR = [{ email: { contains: e } }, { user: { email: { contains: e } } }];
  }
  if (q.type) where.type = q.type;
  if (q.from || q.to) {
    where.createdAt = {
      ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
      ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + DAY) } : {}),
    };
  }
  const csv = q.format === 'csv';
  const rows = await prisma.consentRecord.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: csv ? 50_000 : 500,
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
  });
  if (!csv) {
    const total = await prisma.consentRecord.count({ where });
    res.json({ items: rows, total, types: CONSENT_TYPES });
    return;
  }
  await audit(req, 'CONSENT_LOG_EXPORTED', undefined, { rows: rows.length, filter: { ...q } });
  const header = ['createdAt', 'email', 'userId', 'name', 'type', 'granted', 'version', 'source', 'ip', 'userAgent'];
  const lines = rows.map((r) =>
    [r.createdAt, r.user?.email ?? r.email, r.userId, r.user ? `${r.user.firstName} ${r.user.lastName}`.trim() : '', r.type, r.granted ? 'yes' : 'no', r.version, r.source, r.ip, r.userAgent]
      .map(csvCell)
      .join(','),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="consent-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${header.join(',')}\r\n${lines.join('\r\n')}\r\n`);
});
