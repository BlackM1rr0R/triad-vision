import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { parse } from '../../lib/http.js';
import { clearCache } from '../../lib/cache.js';
import { adminCasesRouter } from './cases.js';
import { adminContentRouter, adminSettingsRouter, adminUploadRouter } from './content.js';
import { adminUsersRouter } from './users.js';
import { adminMailboxesRouter } from './mailboxes.js';
import { adminCompaniesRouter } from './companies.js';
import { adminVacanciesRouter } from './vacancies.js';
import { adminCandidatesRouter } from './candidates.js';
import { adminBookingRouter } from './booking.js';
import { adminInvoicesRouter } from './invoices.js';
import { adminReviewsRouter } from './reviews.js';
import { adminAnalyticsRouter } from './analytics.js';
import { oversightRouter } from './oversight.js';
import { adminMessagingRouter } from './messaging.js';
import { adminRequirementsRouter } from './requirements.js';
import { adminJourneyRouter } from './journey.js';
import { adminOpsRouter } from './ops.js';
import { adminSignaturesRouter } from './signatures.js';
import { FINAL_STATUSES } from '../../lib/caseFlow.js';

export const adminRouter = Router();
adminRouter.use(requireMinRole('STAFF'));

adminRouter.get('/dashboard', async (req, res) => {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const monthAgo = new Date(now - 30 * DAY);
  const weekAgo = new Date(now - 7 * DAY);
  const [byStatus, newInquiries, clients, recentEvents, waiting, docsPending, casesNew7d, appointments, waitingOverdue, decided30d, inquiriesByStatus, myOpen, unansweredClientMessages, decidedAll] = await Promise.all([
    prisma.case.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.inquiry.count({ where: { status: 'NEW' } }),
    prisma.user.count({ where: { role: 'CLIENT', createdAt: { gte: monthAgo } } }),
    prisma.caseEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: {
        case: { select: { id: true, number: true } },
        actor: { select: { firstName: true, lastName: true, role: true } },
      },
    }),
    // cases waiting for a staff action
    prisma.case.findMany({
      where: { status: { in: ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW'] } },
      orderBy: { updatedAt: 'asc' },
      take: 10,
      include: { client: { select: { firstName: true, lastName: true } } },
    }),
    prisma.document.count({ where: { status: 'PENDING', stage: { in: ['INITIAL', 'EMBASSY'] } } }),
    prisma.case.count({ where: { createdAt: { gte: weekAgo } } }),
    // embassy appointments in the next 14 days
    prisma.case.findMany({
      where: { status: 'APPOINTMENT_SCHEDULED', appointmentAt: { gte: new Date(now), lte: new Date(now + 14 * DAY) } },
      orderBy: { appointmentAt: 'asc' },
      take: 8,
      select: { id: true, number: true, appointmentAt: true, appointmentPlace: true, client: { select: { firstName: true, lastName: true } } },
    }),
    prisma.case.count({ where: { status: { in: ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW'] }, updatedAt: { lt: new Date(now - 3 * DAY) } } }),
    prisma.case.groupBy({ by: ['status'], where: { status: { in: ['APPROVED', 'REJECTED'] }, decisionAt: { gte: monthAgo } }, _count: { _all: true } }),
    prisma.inquiry.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.case.count({ where: { assignedStaffId: req.user!.id, status: { notIn: FINAL_STATUSES } } }),
    // open cases whose latest message came from the client (someone should answer)
    prisma.$queryRaw<{ n: bigint | number }[]>`
      SELECT COUNT(*) AS n FROM \`Case\` c
      JOIN CaseMessage m ON m.id = (SELECT id FROM CaseMessage WHERE caseId = c.id ORDER BY createdAt DESC, id DESC LIMIT 1)
      WHERE c.status NOT IN ('APPROVED','REJECTED','CANCELLED') AND m.authorId = c.clientId`,
    prisma.case.findMany({ where: { status: { in: ['APPROVED', 'REJECTED'] }, decisionAt: { not: null } }, select: { createdAt: true, decisionAt: true } }),
  ]);
  const decisionDays = decidedAll.map((c) => (c.decisionAt!.getTime() - c.createdAt.getTime()) / DAY);
  res.json({
    counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
    newInquiries,
    newClients30d: clients,
    recentEvents,
    waiting,
    docsPending,
    casesNew7d,
    appointments,
    waitingOverdue3d: waitingOverdue,
    decided30d: Object.fromEntries(decided30d.map((b) => [b.status, b._count._all])),
    inquiriesByStatus: Object.fromEntries(inquiriesByStatus.map((b) => [b.status, b._count._all])),
    myOpenCases: myOpen,
    unansweredClientMessages: Number(unansweredClientMessages[0]?.n ?? 0),
    avgDaysToDecision: decisionDays.length ? Math.round((decisionDays.reduce((a, b) => a + b, 0) / decisionDays.length) * 10) / 10 : null,
  });
});

adminRouter.use('/oversight', oversightRouter);
adminRouter.use('/messaging', adminMessagingRouter);
adminRouter.use('/requirements', adminRequirementsRouter);
adminRouter.use('/journey', adminJourneyRouter);
adminRouter.use('/ops', adminOpsRouter);
adminRouter.use('/signatures', adminSignaturesRouter);
// Any successful CMS write (incl. vacancy, employer and review moderation) must be visible on the public site right away.
// The cache is cleared before the response is sent, so the admin's next public read is already fresh.
adminRouter.use(['/content', '/settings', '/vacancies', '/companies', '/reviews'], (req, res, next) => {
  if (req.method !== 'GET') {
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400) clearCache();
      return json(body);
    };
  }
  next();
});

adminRouter.use('/cases', adminCasesRouter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/mailboxes', requireMinRole('ADMIN'), adminMailboxesRouter);
adminRouter.use('/companies', adminCompaniesRouter);
adminRouter.use('/vacancies', adminVacanciesRouter);
adminRouter.use('/candidates', adminCandidatesRouter);
adminRouter.use('/booking', adminBookingRouter);
adminRouter.use('/invoices', requireMinRole('ADMIN'), adminInvoicesRouter);
adminRouter.use('/reviews', adminReviewsRouter);
adminRouter.use('/analytics', adminAnalyticsRouter);
adminRouter.use('/upload', requireMinRole('ADMIN'), adminUploadRouter);
adminRouter.use('/settings', requireMinRole('ADMIN'), adminSettingsRouter);
adminRouter.use('/content', requireMinRole('ADMIN'), adminContentRouter);

adminRouter.get('/inquiries', async (_req, res) => {
  const DAY = 24 * 60 * 60 * 1000;
  const [items, byStatus, byKind, new7d, openOldest] = await Promise.all([
    prisma.inquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
    prisma.inquiry.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.inquiry.groupBy({ by: ['kind'], _count: { _all: true } }),
    prisma.inquiry.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * DAY) } } }),
    prisma.inquiry.findFirst({ where: { status: 'NEW' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);
  res.json({
    items,
    summary: {
      byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      byKind: Object.fromEntries(byKind.map((b) => [b.kind, b._count._all])),
      new7d,
      oldestOpenDays: openOldest ? Math.floor((Date.now() - openOldest.createdAt.getTime()) / DAY) : null,
      workersRequested: items.reduce((a, i) => a + (i.workersNeeded ?? 0), 0),
    },
  });
});

adminRouter.patch('/inquiries/:id', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['NEW', 'IN_PROGRESS', 'DONE', 'ARCHIVED']) }), req.body);
  res.json({ item: await prisma.inquiry.update({ where: { id: req.params.id }, data: { status } }) });
});
