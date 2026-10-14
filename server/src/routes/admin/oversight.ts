import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { notFound, parse } from '../../lib/http.js';
import { FINAL_STATUSES } from '../../lib/caseFlow.js';

/**
 * Super-admin oversight: who is in the system, what every staff member does, how long they are
 * online and how the business is moving. Every number here is computed from existing tables
 * (sessions, case events, messages, documents, workspaces, audit log) — nothing is double-stored.
 */
export const oversightRouter = Router();
oversightRouter.use(requireMinRole('SUPER_ADMIN'));

const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
const DAY = 24 * 60 * 60 * 1000;
/** A session counts as "online" when it was used in the last 5 minutes. */
const ONLINE_MS = 5 * 60 * 1000;

const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

type SessionLite = { userId: string; client: string; createdAt: Date; lastSeenAt: Date; revokedAt: Date | null; expiresAt: Date };

/** Effective end of a session's activity: last request, or "now" if it is still live. */
const sessionEnd = (s: SessionLite, now: number) => {
  const live = !s.revokedAt && s.expiresAt.getTime() > now && now - s.lastSeenAt.getTime() < ONLINE_MS;
  return live ? now : s.lastSeenAt.getTime();
};

/** Even a single request is a minute of work: a session never counts as 0 minutes. */
const MIN_SESSION_MS = 60 * 1000;
const activeMs = (s: SessionLite, now: number) => Math.max(MIN_SESSION_MS, sessionEnd(s, now) - s.createdAt.getTime());

/** Splits a session's active interval into per-calendar-day minutes (UTC). */
const addDailyMinutes = (into: Map<string, number>, s: SessionLite, now: number, from: Date) => {
  let start = Math.max(s.createdAt.getTime(), from.getTime());
  const end = Math.max(sessionEnd(s, now), s.createdAt.getTime() + MIN_SESSION_MS);
  while (start < end) {
    const dayStart = new Date(start);
    dayStart.setUTCHours(0, 0, 0, 0);
    const nextDay = dayStart.getTime() + DAY;
    const chunkEnd = Math.min(end, nextDay);
    const key = dayKey(dayStart);
    into.set(key, (into.get(key) ?? 0) + (chunkEnd - start) / 60000);
    start = chunkEnd;
  }
};

const isOnline = (sessions: SessionLite[], now: number) =>
  sessions.some((s) => !s.revokedAt && s.expiresAt.getTime() > now && now - s.lastSeenAt.getTime() < ONLINE_MS);

const countBy = <K extends string>(rows: { key: K; n: number }[]) =>
  Object.fromEntries(rows.map((r) => [r.key, r.n])) as Record<K, number>;

// ─── Summary ───────────────────────────────────────────────────────────

oversightRouter.get('/summary', async (_req, res) => {
  const now = Date.now();
  const since30 = daysAgo(30);
  const since7 = daysAgo(7);
  const since1 = daysAgo(1);

  const [
    usersByRole,
    clientsNew7,
    clientsNew30,
    casesByStatus,
    casesNew7,
    casesNew30,
    decided30,
    decidedAll,
    inquiriesByStatus,
    inquiriesByKind,
    docsByStatus,
    workspace,
    folders,
    emails30,
    loginFailed24,
    audit30,
    staffUsers,
    sessions30,
    eventsByActor30,
    messagesByAuthor30,
    reviewsByActor30,
    uploadsByUser30,
    auditByActor30,
    assignedOpen,
    assignedClosed,
    filesByFolder,
    appointmentsNext7,
    waitingOverdue,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { role: 'CLIENT', createdAt: { gte: since7 } } }),
    prisma.user.count({ where: { role: 'CLIENT', createdAt: { gte: since30 } } }),
    prisma.case.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.case.count({ where: { createdAt: { gte: since7 } } }),
    prisma.case.count({ where: { createdAt: { gte: since30 } } }),
    prisma.case.groupBy({ by: ['status'], where: { status: { in: ['APPROVED', 'REJECTED'] }, decisionAt: { gte: since30 } }, _count: { _all: true } }),
    prisma.case.findMany({ where: { status: { in: ['APPROVED', 'REJECTED'] }, decisionAt: { not: null } }, select: { createdAt: true, decisionAt: true, status: true } }),
    prisma.inquiry.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.inquiry.groupBy({ by: ['kind'], _count: { _all: true } }),
    prisma.document.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.docFile.aggregate({ _count: { _all: true }, _sum: { size: true } }),
    prisma.docFolder.count(),
    prisma.emailLog.groupBy({ by: ['status'], where: { createdAt: { gte: since30 } }, _count: { _all: true } }),
    prisma.auditLog.count({ where: { action: 'LOGIN_FAILED', createdAt: { gte: since1 } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: since30 } } }),
    prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true, createdAt: true, docFolder: { select: { id: true, slug: true } } },
      orderBy: [{ role: 'desc' }, { firstName: 'asc' }],
    }),
    prisma.session.findMany({
      where: { OR: [{ createdAt: { gte: since30 } }, { lastSeenAt: { gte: since30 } }] },
      select: { userId: true, client: true, createdAt: true, lastSeenAt: true, revokedAt: true, expiresAt: true },
    }),
    prisma.caseEvent.groupBy({ by: ['actorId'], where: { createdAt: { gte: since30 }, actorId: { not: null } }, _count: { _all: true } }),
    prisma.caseMessage.groupBy({ by: ['authorId'], where: { createdAt: { gte: since30 } }, _count: { _all: true } }),
    prisma.caseEvent.groupBy({ by: ['actorId'], where: { createdAt: { gte: since30 }, type: { in: ['DOCUMENT_ACCEPTED', 'DOCUMENT_REJECTED'] } }, _count: { _all: true } }),
    prisma.docFile.groupBy({ by: ['uploadedById'], where: { updatedAt: { gte: since30 } }, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ['actorId'], where: { createdAt: { gte: since30 }, actorId: { not: null }, action: { not: 'LOGIN_FAILED' } }, _count: { _all: true } }),
    prisma.case.groupBy({ by: ['assignedStaffId'], where: { assignedStaffId: { not: null }, status: { notIn: FINAL_STATUSES } }, _count: { _all: true } }),
    prisma.case.groupBy({ by: ['assignedStaffId'], where: { assignedStaffId: { not: null }, status: { in: FINAL_STATUSES } }, _count: { _all: true } }),
    prisma.docFile.groupBy({ by: ['folderId'], _count: { _all: true }, _sum: { size: true }, _max: { updatedAt: true } }),
    prisma.case.count({ where: { status: 'APPOINTMENT_SCHEDULED', appointmentAt: { gte: new Date(now), lte: daysAgo(-7) } } }),
    prisma.case.count({ where: { status: { in: ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW'] }, updatedAt: { lt: daysAgo(3) } } }),
  ]);

  const sessionsByUser = new Map<string, SessionLite[]>();
  for (const s of sessions30) {
    const list = sessionsByUser.get(s.userId) ?? [];
    list.push(s);
    sessionsByUser.set(s.userId, list);
  }
  const byKey = <T extends { _count: { _all: number } }>(rows: T[], key: (r: T) => string | null) =>
    new Map(rows.filter((r) => key(r) !== null).map((r) => [key(r) as string, r._count._all]));
  const events = byKey(eventsByActor30, (r) => r.actorId);
  const messages = byKey(messagesByAuthor30, (r) => r.authorId);
  const reviews = byKey(reviewsByActor30, (r) => r.actorId);
  const uploads = byKey(uploadsByUser30, (r) => r.uploadedById);
  const audits = byKey(auditByActor30, (r) => r.actorId);
  const open = byKey(assignedOpen, (r) => r.assignedStaffId);
  const closed = byKey(assignedClosed, (r) => r.assignedStaffId);
  const files = new Map(filesByFolder.map((f) => [f.folderId, { count: f._count._all, bytes: f._sum.size ?? 0, lastUploadAt: f._max.updatedAt }]));

  const staff = staffUsers.map((u) => {
    const sess = sessionsByUser.get(u.id) ?? [];
    const last7 = sess.filter((s) => sessionEnd(s, now) >= since7.getTime());
    const lastSeenAt = sess.reduce<Date | null>((m, s) => (!m || s.lastSeenAt > m ? s.lastSeenAt : m), null);
    const ws = u.docFolder ? files.get(u.docFolder.id) : undefined;
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      online: isOnline(sess, now),
      lastSeenAt,
      logins30d: sess.filter((s) => s.createdAt >= since30).length,
      activeMinutes7d: Math.round(last7.reduce((a, s) => a + Math.max(s.createdAt >= since7 ? MIN_SESSION_MS : 0, sessionEnd(s, now) - Math.max(s.createdAt.getTime(), since7.getTime())) / 60000, 0)),
      activeMinutes30d: Math.round(sess.reduce((a, s) => a + activeMs(s, now) / 60000, 0)),
      activeDays30d: (() => {
        const days = new Map<string, number>();
        for (const s of sess) addDailyMinutes(days, s, now, since30);
        return [...days.values()].filter((m) => m >= 1).length;
      })(),
      caseActions30d: events.get(u.id) ?? 0,
      documentsReviewed30d: reviews.get(u.id) ?? 0,
      messages30d: messages.get(u.id) ?? 0,
      workspaceUploads30d: uploads.get(u.id) ?? 0,
      adminActions30d: audits.get(u.id) ?? 0,
      assignedOpen: open.get(u.id) ?? 0,
      assignedClosed: closed.get(u.id) ?? 0,
      workspace: u.docFolder ? { folderId: u.docFolder.id, slug: u.docFolder.slug, files: ws?.count ?? 0, bytes: ws?.bytes ?? 0, lastUploadAt: ws?.lastUploadAt ?? null } : null,
    };
  });

  const clientSessions = sessions30.filter((s) => !staffUsers.some((u) => u.id === s.userId));
  const activeClientIds = (from: Date) => new Set(clientSessions.filter((s) => s.lastSeenAt >= from).map((s) => s.userId)).size;

  const decisionDays = decidedAll.map((c) => (c.decisionAt!.getTime() - c.createdAt.getTime()) / DAY);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

  res.json({
    generatedAt: new Date(now),
    users: {
      byRole: countBy(usersByRole.map((r) => ({ key: r.role, n: r._count._all }))),
      total: usersByRole.reduce((a, r) => a + r._count._all, 0),
      clientsNew7d: clientsNew7,
      clientsNew30d: clientsNew30,
      clientsActive7d: activeClientIds(since7),
      clientsActive30d: activeClientIds(since30),
      clientsOnline: new Set(clientSessions.filter((s) => isOnline([s], now)).map((s) => s.userId)).size,
      staffOnline: staff.filter((s) => s.online).length,
      sessionsLive: sessions30.filter((s) => !s.revokedAt && s.expiresAt.getTime() > now).length,
    },
    cases: {
      byStatus: countBy(casesByStatus.map((r) => ({ key: r.status, n: r._count._all }))),
      total: casesByStatus.reduce((a, r) => a + r._count._all, 0),
      new7d: casesNew7,
      new30d: casesNew30,
      decided30d: countBy(decided30.map((r) => ({ key: r.status, n: r._count._all }))),
      approvalRate: decidedAll.length ? Math.round((decidedAll.filter((c) => c.status === 'APPROVED').length / decidedAll.length) * 100) : null,
      avgDaysToDecision: avg(decisionDays),
      appointmentsNext7d: appointmentsNext7,
      waitingOverdue3d: waitingOverdue,
    },
    inquiries: {
      byStatus: countBy(inquiriesByStatus.map((r) => ({ key: r.status, n: r._count._all }))),
      byKind: countBy(inquiriesByKind.map((r) => ({ key: r.kind, n: r._count._all }))),
    },
    documents: {
      byStatus: countBy(docsByStatus.map((r) => ({ key: r.status, n: r._count._all }))),
      total: docsByStatus.reduce((a, r) => a + r._count._all, 0),
    },
    workspaces: { folders, files: workspace._count._all, bytes: workspace._sum.size ?? 0 },
    emails30d: countBy(emails30.map((r) => ({ key: r.status, n: r._count._all }))),
    security: { loginFailed24h: loginFailed24, auditEntries30d: audit30 },
    staff,
  });
});

// ─── Daily activity series ─────────────────────────────────────────────

const seriesSchema = z.object({ days: z.coerce.number().int().min(7).max(180).default(30) });

/** Counts rows per UTC day for one table/column over the window. */
const dailyCounts = async (table: string, column: string, since: Date, extra = Prisma.empty) => {
  const rows = await prisma.$queryRaw<{ d: Date | string; n: bigint | number }[]>(
    Prisma.sql`SELECT DATE(${Prisma.raw('`' + column + '`')}) AS d, COUNT(*) AS n FROM ${Prisma.raw('`' + table + '`')} WHERE ${Prisma.raw('`' + column + '`')} >= ${since} ${extra} GROUP BY d`,
  );
  return new Map(rows.map((r) => [typeof r.d === 'string' ? r.d.slice(0, 10) : dayKey(r.d), Number(r.n)]));
};

oversightRouter.get('/activity', async (req, res) => {
  const { days } = parse(seriesSchema, req.query);
  const since = new Date(Date.now() - (days - 1) * DAY);
  since.setUTCHours(0, 0, 0, 0);
  const now = Date.now();

  const [logins, caseEvents, messages, documents, inquiries, newClients, newCases, uploads, failedLogins, sessions] = await Promise.all([
    dailyCounts('Session', 'createdAt', since),
    dailyCounts('CaseEvent', 'createdAt', since),
    dailyCounts('CaseMessage', 'createdAt', since),
    dailyCounts('Document', 'createdAt', since),
    dailyCounts('Inquiry', 'createdAt', since),
    dailyCounts('User', 'createdAt', since, Prisma.sql`AND role = 'CLIENT'`),
    dailyCounts('Case', 'createdAt', since),
    dailyCounts('DocFile', 'createdAt', since),
    dailyCounts('AuditLog', 'createdAt', since, Prisma.sql`AND action = 'LOGIN_FAILED'`),
    prisma.session.findMany({
      where: { user: { role: { in: STAFF_ROLES } }, OR: [{ createdAt: { gte: since } }, { lastSeenAt: { gte: since } }] },
      select: { userId: true, client: true, createdAt: true, lastSeenAt: true, revokedAt: true, expiresAt: true },
    }),
  ]);
  const staffMinutes = new Map<string, number>();
  for (const s of sessions) addDailyMinutes(staffMinutes, s, now, since);

  const series = [];
  for (let t = since.getTime(); t <= now; t += DAY) {
    const key = dayKey(new Date(t));
    series.push({
      day: key,
      logins: logins.get(key) ?? 0,
      caseEvents: caseEvents.get(key) ?? 0,
      messages: messages.get(key) ?? 0,
      documents: documents.get(key) ?? 0,
      inquiries: inquiries.get(key) ?? 0,
      newClients: newClients.get(key) ?? 0,
      newCases: newCases.get(key) ?? 0,
      workspaceUploads: uploads.get(key) ?? 0,
      failedLogins: failedLogins.get(key) ?? 0,
      staffActiveMinutes: Math.round(staffMinutes.get(key) ?? 0),
    });
  }
  res.json({ days, since, series });
});

// ─── One staff member in depth ─────────────────────────────────────────

oversightRouter.get('/staff/:id', async (req, res) => {
  const id = String(req.params.id);
  const now = Date.now();
  const since30 = daysAgo(30);
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true, role: true, isActive: true, locale: true, createdAt: true,
      docFolder: { select: { id: true, slug: true, createdAt: true, _count: { select: { files: true, grants: true } } } },
      _count: { select: { assignedCases: true, events: true, messages: true, documents: true, docFiles: true, auditLogs: true, sessions: true } },
    },
  });
  if (!user || !STAFF_ROLES.includes(user.role)) throw notFound('USER_NOT_FOUND');

  const [sessions, events, audit, assigned, wsBytes, grantsOut, grantsIn, eventTypes30, reviewed] = await Promise.all([
    prisma.session.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 60, select: { id: true, userId: true, client: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true, revokedAt: true, expiresAt: true } }),
    prisma.caseEvent.findMany({
      where: { actorId: id },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: { id: true, type: true, fromStatus: true, toStatus: true, note: true, createdAt: true, case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } } } },
    }),
    prisma.auditLog.findMany({ where: { actorId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, target: true, details: true, ip: true, createdAt: true } }),
    prisma.case.findMany({
      where: { assignedStaffId: id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, number: true, status: true, profession: true, updatedAt: true, createdAt: true, client: { select: { firstName: true, lastName: true } } },
    }),
    user.docFolder ? prisma.docFile.aggregate({ where: { folderId: user.docFolder.id }, _sum: { size: true }, _max: { updatedAt: true } }) : Promise.resolve(null),
    user.docFolder ? prisma.docGrant.findMany({ where: { folderId: user.docFolder.id }, select: { access: true, user: { select: { id: true, firstName: true, lastName: true } } } }) : Promise.resolve([]),
    prisma.docGrant.findMany({ where: { userId: id }, select: { access: true, folder: { select: { id: true, slug: true, owner: { select: { firstName: true, lastName: true } } } } } }),
    prisma.caseEvent.groupBy({ by: ['type'], where: { actorId: id, createdAt: { gte: since30 } }, _count: { _all: true } }),
    prisma.caseEvent.groupBy({ by: ['type'], where: { actorId: id, type: { in: ['DOCUMENT_ACCEPTED', 'DOCUMENT_REJECTED'] } }, _count: { _all: true } }),
  ]);

  const daily = new Map<string, number>();
  for (const s of sessions) addDailyMinutes(daily, s, now, since30);
  const dailyActive = [];
  for (let t = since30.getTime(); t <= now; t += DAY) {
    const key = dayKey(new Date(t));
    dailyActive.push({ day: key, minutes: Math.round(daily.get(key) ?? 0) });
  }
  const hourHistogram = new Array(24).fill(0) as number[];
  for (const e of events) hourHistogram[e.createdAt.getUTCHours()] += 1;

  res.json({
    user: { ...user, docFolder: undefined, _count: undefined },
    totals: user._count,
    online: isOnline(sessions, now),
    lastSeenAt: sessions[0]?.lastSeenAt ?? null,
    activeMinutes30d: Math.round(sessions.filter((s) => sessionEnd(s, now) >= since30.getTime()).reduce((a, s) => a + Math.max(s.createdAt >= since30 ? MIN_SESSION_MS : 0, sessionEnd(s, now) - Math.max(s.createdAt.getTime(), since30.getTime())) / 60000, 0)),
    dailyActive,
    hourHistogram,
    sessions: sessions.map((s) => ({ ...s, userId: undefined, activeMinutes: Math.round(activeMs(s, now) / 60000), live: !s.revokedAt && s.expiresAt.getTime() > now })),
    eventTypes30d: countBy(eventTypes30.map((r) => ({ key: r.type, n: r._count._all }))),
    documentsReviewed: countBy(reviewed.map((r) => ({ key: r.type, n: r._count._all }))),
    events,
    audit,
    assignedCases: { open: assigned.filter((c) => !FINAL_STATUSES.includes(c.status)), closed: assigned.filter((c) => FINAL_STATUSES.includes(c.status)) },
    workspace: user.docFolder
      ? {
          folderId: user.docFolder.id,
          slug: user.docFolder.slug,
          files: user.docFolder._count.files,
          bytes: wsBytes?._sum.size ?? 0,
          lastUploadAt: wsBytes?._max.updatedAt ?? null,
          sharedWith: grantsOut,
          accessTo: grantsIn.map((g) => ({ access: g.access, folder: g.folder })),
        }
      : null,
  });
});
