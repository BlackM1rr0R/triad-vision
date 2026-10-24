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
import { adminGermanRouter } from './german.js';
import { adminOpsRouter } from './ops.js';
import { adminSignaturesRouter } from './signatures.js';
import { FINAL_STATUSES } from '../../lib/caseFlow.js';
import { adminAgentsRouter } from './agents.js';
import { adminTranslationsRouter } from './translations.js';
import { adminPrivacyRouter } from './privacy.js';
import { adminLegalRouter } from './legal.js';
import { adminWaitingRoomRouter } from './waitingRoom.js';
import { adminArrivalsRouter } from './arrivals.js';
import { adminInterviewPrepRouter } from './interviewPrep.js';
import { adminFinanceRouter } from './finance.js';
import { adminSurveysRouter } from './surveys.js';
import { adminContractTemplatesRouter } from './contractTemplates.js';
import { adminCandidateRequestsRouter } from './candidateRequests.js';
import { adminPartnersRouter } from './partners.js';
import { adminRegisterRouter } from './register.js';
import { adminDocumentExpiryRouter } from './documentExpiry.js';
import { adminSettlementsRouter } from './settlements.js';
import { adminTranslateRouter } from './translate.js';
import { adminAiStaffRouter } from './aiStaff.js';
import { adminCaseAiRouter } from './caseAi.js';
import { adminCaseNextRouter } from './caseNext.js';
import { adminAiEmployerRouter } from './aiEmployer.js';
import { adminMgmtRouter } from './aiMgmt.js';
import { adminMyWorkRouter } from './myWork.js';
import { adminHistoryRouter } from './history.js';
import { adminAssignmentRouter, adminAutomationRouter } from './automation.js'; // no-code automation rules + automatic assignment
import { adminReportsRouter } from './reports.js';
import { adminProfitabilityRouter } from './profitability.js';
import { adminDuplicatesRouter } from './duplicates.js';
import { adminQuotesRouter } from './quotes.js';
import { adminSensitiveRouter } from './privacyTools.js';
import { adminCampaignsRouter } from './campaigns.js';
import { adminClientDataRouter } from './clientData.js';
import { adminTimeRouter } from './time.js'; // staff time tracking
import { adminCheckInsRouter } from './checkIns.js'; // post-arrival check-ins + retention
import { adminRenewalsRouter } from './renewals.js'; // residence-title renewal + probation end
import { adminFourEyesRouter } from './fourEyes.js'; // four-eyes check of the embassy package
import { adminAccessLogRouter } from '../accessLog.js'; // client access log (ADMIN+)
import { adminClientProcessRouter } from './clientProcess.js';
import { adminGrowthRouter } from './growth.js';
import { adminMarketingRouter } from './marketing.js'; // lead scoring, landing pages, cost calculator, origin analytics
import { adminCommandSearchRouter } from './commandSearch.js'; // Ctrl+K command palette search
import { adminPlacementRouter } from './placement.js'; // recognition, employer share links, evaluations, employment contracts
import { adminKpiRouter } from './kpi.js'; // staff KPI card + team leaderboard
import { adminTrainingRouter } from './training.js'; // internal training courses / lessons / quizzes
import { adminShiftsRouter } from './shifts.js'; // team calendar: shifts, leave, handovers, coverage
import { adminHandoverNotesRouter } from './handoverNotes.js'; // handover notes + checklists for absence handovers
import { adminGuidesRouter } from './guides.js'; // topic guides (/guides) CMS, per-language versions
import { adminNavRouter } from './nav.js'; // role desks, favourites, recent pages, module toggles, page usage
import { adminSiteFeaturesRouter } from './siteFeatures.js'; // search stats, job alert stats, story video upload, e-book lead magnets

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

adminRouter.use(adminNavRouter); // /me/nav*, /nav/* (desks, usage, modules)
adminRouter.use('/command-search', adminCommandSearchRouter); // staff command palette: cases, people, companies, vacancies, drive, tasks
adminRouter.use(adminSensitiveRouter); // /reveal, /sensitive/* (masked fields: reveal with reason, settings, reveal log)
adminRouter.use('/client-process', adminClientProcessRouter); // client tasks, office visits, ball-in-court ETA settings
adminRouter.use('/my-work', adminMyWorkRouter); // "my work today" queue + snooze / expiry remind
adminRouter.use('/history', adminHistoryRouter); // field-level change history + one-click revert
adminRouter.use('/automation', adminAutomationRouter); // automation rules (ADMIN+)
adminRouter.use('/assignment', adminAssignmentRouter); // auto-assignment settings, load, rebalance, handovers
adminRouter.use('/campaigns', adminCampaignsRouter); // campaigns to client segments (ADMIN+)
adminRouter.use('/time', adminTimeRouter); // time tracking (STAFF: own entries; rates SUPER_ADMIN)
adminRouter.use('/kpi', adminKpiRouter); // staff KPI (own card STAFF; team + others ADMIN+)
adminRouter.use('/training', adminTrainingRouter); // training: learn (STAFF), authoring + progress (ADMIN+)
adminRouter.use('/shifts', adminShiftsRouter); // team calendar (STAFF read, ADMIN+ edit)
adminRouter.use('/handover-notes', adminHandoverNotesRouter); // handover notes / checklists
adminRouter.use('/check-ins', adminCheckInsRouter); // post-arrival check-ins, retention
adminRouter.use('/renewals', adminRenewalsRouter); // residence-title renewal cases, probation reminders
adminRouter.use(adminFourEyesRouter); // /cases/:id/four-eyes*, /four-eyes/* (embassy package review)
adminRouter.use('/access-log', adminAccessLogRouter); // "who viewed my documents" per client
adminRouter.use('/placement', adminPlacementRouter); // recognition, employer share links, interview evaluations, Arbeitsvertrag tracker
adminRouter.use('/growth', adminGrowthRouter); // events (Tədbirlər), calculator assumptions, placement map, client referrals
adminRouter.use('/marketing', adminMarketingRouter); // lead scoring, landing pages, cost calculator, origin → destination analytics
adminRouter.use('/oversight', oversightRouter);
adminRouter.use('/messaging', adminMessagingRouter);
adminRouter.use('/requirements', adminRequirementsRouter);
adminRouter.use('/journey', adminJourneyRouter);
adminRouter.use('/german', adminGermanRouter); // German progress per candidate + exam dates (İmtahan tarixləri)
adminRouter.use('/ops', adminOpsRouter);
adminRouter.use('/agents', adminAgentsRouter);
adminRouter.use('/translations', adminTranslationsRouter);
adminRouter.use('/privacy', adminPrivacyRouter);
adminRouter.use('/legal', adminLegalRouter); // versioned AGB / privacy / cookie texts (ADMIN+)
adminRouter.use('/waiting-room', adminWaitingRoomRouter); // client waiting room CMS (STAFF read, ADMIN+ edit)
adminRouter.use('/arrivals', adminArrivalsRouter);
adminRouter.use('/interview-prep', adminInterviewPrepRouter);
adminRouter.use('/finance', adminFinanceRouter);
adminRouter.use('/reports', adminReportsRouter); // report builder (ADMIN+)
adminRouter.use('/profitability', adminProfitabilityRouter); // profitability per case (ADMIN+)
adminRouter.use('/surveys', adminSurveysRouter);
adminRouter.use('/contract-templates', adminContractTemplatesRouter);
adminRouter.use('/candidate-requests', adminCandidateRequestsRouter);
adminRouter.use('/partners', adminPartnersRouter);
adminRouter.use('/register', adminRegisterRouter);
adminRouter.use('/settlements', adminSettlementsRouter);
adminRouter.use('/signatures', adminSignaturesRouter);
adminRouter.use('/translate', adminTranslateRouter);
adminRouter.use('/ai-staff', adminAiStaffRouter);
adminRouter.use('/mgmt', adminMgmtRouter); // weekly management report + security alerts (SUPER_ADMIN)
adminRouter.use('/ai/employer', adminAiEmployerRouter);
// Any successful CMS write (incl. vacancy, employer and review moderation) must be visible on the public site right away.
// The cache is cleared before the response is sent, so the admin's next public read is already fresh.
adminRouter.use(['/content', '/settings', '/vacancies', '/companies', '/reviews', '/guides', '/site-features'], (req, res, next) => {
  if (req.method !== 'GET') {
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400) clearCache();
      return json(body);
    };
  }
  next();
});

adminRouter.use(adminCaseAiRouter); // /cases/:id/ai/*, /case-ai/settings
adminRouter.use(adminCaseNextRouter); // /cases/:id/next-step*, /cases/:id/embassy-package*
adminRouter.use(adminClientDataRouter); // /case-forms/*, /cases/:id/forms*, /cases/:id/data-confirmation*, /doc-guides*
adminRouter.use(adminDocumentExpiryRouter); // /cases/:caseId/documents/:docId/expiry, /expiring
adminRouter.use('/cases', adminCasesRouter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/duplicates', requireMinRole('ADMIN'), adminDuplicatesRouter); // duplicate clients: review, not-a-duplicate, merge
adminRouter.use('/mailboxes', requireMinRole('ADMIN'), adminMailboxesRouter);
adminRouter.use('/companies', adminCompaniesRouter);
adminRouter.use('/vacancies', adminVacanciesRouter);
adminRouter.use('/candidates', adminCandidatesRouter);
adminRouter.use('/booking', adminBookingRouter);
adminRouter.use('/invoices', requireMinRole('ADMIN'), adminInvoicesRouter);
adminRouter.use('/quotes', requireMinRole('ADMIN'), adminQuotesRouter); // Angebote for employers
adminRouter.use('/reviews', adminReviewsRouter);
adminRouter.use('/analytics', adminAnalyticsRouter);
adminRouter.use('/upload', requireMinRole('ADMIN'), adminUploadRouter);
adminRouter.use('/settings', requireMinRole('ADMIN'), adminSettingsRouter);
adminRouter.use('/content', requireMinRole('ADMIN'), adminContentRouter);
adminRouter.use('/guides', requireMinRole('ADMIN'), adminGuidesRouter);
adminRouter.use('/site-features', adminSiteFeaturesRouter); // read: staff; writes: ADMIN (checked per route)

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
