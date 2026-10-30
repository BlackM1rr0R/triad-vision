import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { parse } from '../../lib/http.js';
import { clearCache } from '../../lib/cache.js';
import { adminCasesRouter } from './cases.js';
import { adminContentRouter, adminSettingsRouter, adminUploadRouter } from './content.js';
import { adminUsersRouter } from './users.js';
import { adminInquiriesRouter } from './inquiries.js';
import { adminMailboxesRouter } from './mailboxes.js';
import { adminCompaniesRouter } from './companies.js';
import { adminEmployerReportsRouter } from './employerReports.js';
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
import { adminHousingRouter } from './housing.js'; // housing + Anmeldung, partner landlord listings
import { adminInterviewPrepRouter } from './interviewPrep.js';
import { adminFinanceRouter } from './finance.js';
import { adminSurveysRouter } from './surveys.js';
import { adminContractTemplatesRouter } from './contractTemplates.js';
import { adminCandidateRequestsRouter } from './candidateRequests.js';
import { adminPartnersRouter } from './partners.js';
import { adminRegisterRouter } from './register.js';
import { adminDocumentExpiryRouter } from './documentExpiry.js';
import { adminSkillVideosRouter } from './skillVideos.js';
import { adminSettlementsRouter } from './settlements.js';
import { adminTranslateRouter } from './translate.js';
import { adminAiStaffRouter } from './aiStaff.js';
import { adminCaseAiRouter } from './caseAi.js';
import { adminCaseNextRouter } from './caseNext.js';
import { adminAiEmployerRouter } from './aiEmployer.js';
import { adminMgmtRouter } from './aiMgmt.js';
import { adminMyWorkRouter } from './myWork.js';
import { adminCaseProcessingRouter } from './caseProcessing.js'; // team document workflow: Schon geschrieben → Fertig, Ablehnung
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
import { adminPermitsRouter } from './permits.js'; // permit expiry reminders (residence permit / Blue Card, passport, insurance)
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
import { adminClientBillingRouter } from './clientBilling.js'; // client invoices, payments, payment plans
import { adminCountersignRouter } from './countersign.js'; // Triad Vision countersignature of service contracts
import { adminAccountingRouter } from './accounting.js'; // currencies, billing entities, exchange rates, DATEV export, XRechnung
import { adminPackagesRouter } from './packages.js'; // service packages + online orders
import { adminSiteFeaturesRouter } from './siteFeatures.js'; // search stats, job alert stats, story video upload, e-book lead magnets
import { adminOfficialFormsRouter } from './officialForms.js'; // official fillable PDFs: templates, mapping, case fills, employer declaration
import { adminAcceleratedRouter, adminRecognitionRouter } from './recognition.js'; // Anerkennung tracker + § 81a accelerated procedure
import { adminDashboardLayoutRouter } from './dashboardLayout.js'; // personal dashboard widget layout
import { adminPresenceRouter } from './presence.js'; // live "who is viewing this case / inquiry"
import { adminBrandRouter, adminLicenseRouter, adminWhitelabelRouter } from './whitelabel.js'; // white-label: brand, licence, owner's customer list
import { adminCourseRouter } from './course.js'; // pre-departure course: builder (ADMIN+), progress report + enroll (STAFF+)
import { adminCityCostsRouter } from './cityCosts.js'; // first-month budget: city cost table (Sayt → Şəhər xərcləri)
import { adminJobFeedsRouter } from './jobFeeds.js'; // external job boards: feed URLs + token, per-vacancy distribution, BA HR-BA-XML
import { adminStaffUiRouter } from './staffUi.js'; // saved views, table settings, "what's new" (Setting rows per user / team)
import { audit } from '../../lib/audit.js';
import { adminBulkRouter } from './bulk.js'; // bulk actions on cases / inquiries / candidates (per-item results, audited)
import { adminReviewRouter } from './review.js'; // fast document review queue

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
adminRouter.use('/brand', requireMinRole('SUPER_ADMIN'), adminBrandRouter); // white-label brand (System → Brand)
adminRouter.use('/license', requireMinRole('SUPER_ADMIN'), adminLicenseRouter); // white-label licence status (System → License)
adminRouter.use('/whitelabel', requireMinRole('SUPER_ADMIN'), adminWhitelabelRouter); // owner instance: customers / instances
adminRouter.use(adminDashboardLayoutRouter); // /me/dashboard (widget order, sizes, hidden widgets)
adminRouter.use(adminStaffUiRouter); // /me/saved-views, /me/table-prefs, /me/whats-new, /whats-new/overrides
adminRouter.use('/bulk', adminBulkRouter); // /bulk/cases/*, /bulk/inquiries/*, /bulk/candidates/*
adminRouter.use('/review', adminReviewRouter); // /review/queue (pending uploads with AI findings + checklist)
adminRouter.use('/presence', adminPresenceRouter); // /presence/:kind/:id (join / heartbeat / leave)
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
adminRouter.use('/course', adminCourseRouter); // pre-departure course (client LMS): builder ADMIN+, report STAFF+
adminRouter.use('/shifts', adminShiftsRouter); // team calendar (STAFF read, ADMIN+ edit)
adminRouter.use('/handover-notes', adminHandoverNotesRouter); // handover notes / checklists
adminRouter.use('/check-ins', adminCheckInsRouter); // post-arrival check-ins, retention
adminRouter.use('/renewals', adminRenewalsRouter); // residence-title renewal cases, probation reminders
adminRouter.use('/permits', adminPermitsRouter); // permit expiry reminders after arrival (90 / 60 / 30 days)
adminRouter.use('/recognition', adminRecognitionRouter); // Anerkennung: processes, checklist, letters, deficits, fee, deadlines
adminRouter.use('/accelerated', adminAcceleratedRouter); // § 81a beschleunigtes Fachkräfteverfahren: stepper, correspondence, deadlines
adminRouter.use(adminFourEyesRouter); // /cases/:id/four-eyes*, /four-eyes/* (embassy package review)
adminRouter.use(adminCaseProcessingRouter); // /cases/:id/processing, /case-processing/board (Schon geschrieben → Fertig, Ablehnung)
adminRouter.use('/access-log', adminAccessLogRouter); // "who viewed my documents" per client
adminRouter.use('/placement', adminPlacementRouter); // recognition, employer share links, interview evaluations, Arbeitsvertrag tracker
adminRouter.use('/growth', adminGrowthRouter); // events (Tədbirlər), calculator assumptions, placement map, client referrals
adminRouter.use('/city-costs', requireMinRole('ADMIN'), adminCityCostsRouter); // first-month budget city costs (ADMIN+, audited)
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
adminRouter.use('/housing', adminHousingRouter); // STAFF+; listing edits ADMIN+ (checked in the router)
adminRouter.use('/interview-prep', adminInterviewPrepRouter);
adminRouter.use('/finance', adminFinanceRouter);
adminRouter.use('/reports', adminReportsRouter); // report builder (ADMIN+)
adminRouter.use('/profitability', adminProfitabilityRouter); // profitability per case (ADMIN+)
adminRouter.use('/surveys', adminSurveysRouter);
adminRouter.use('/contract-templates', adminContractTemplatesRouter);
adminRouter.use('/candidate-requests', adminCandidateRequestsRouter);
adminRouter.use('/skill-videos', adminSkillVideosRouter); // candidates' skill videos: review queue, approve / reject, view log
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
adminRouter.use(adminOfficialFormsRouter); // /official-forms/*, /cases/:id/official-forms*
adminRouter.use(adminCaseNextRouter); // /cases/:id/next-step*, /cases/:id/embassy-package*
adminRouter.use(adminClientDataRouter); // /case-forms/*, /cases/:id/forms*, /cases/:id/data-confirmation*, /doc-guides*
adminRouter.use(adminDocumentExpiryRouter); // /cases/:caseId/documents/:docId/expiry, /expiring
adminRouter.use('/cases', adminCasesRouter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/duplicates', requireMinRole('ADMIN'), adminDuplicatesRouter); // duplicate clients: review, not-a-duplicate, merge
adminRouter.use('/mailboxes', requireMinRole('ADMIN'), adminMailboxesRouter);
adminRouter.use('/companies', adminCompaniesRouter);
adminRouter.use('/employer-reports', adminEmployerReportsRouter); // monthly employer report: preview, regenerate, send
adminRouter.use('/vacancies', adminVacanciesRouter);
adminRouter.use('/job-feeds', requireMinRole('ADMIN'), adminJobFeedsRouter); // İş elanı kanalları (ADMIN+)
adminRouter.use('/candidates', adminCandidatesRouter);
adminRouter.use('/booking', adminBookingRouter);
adminRouter.use('/invoices', requireMinRole('ADMIN'), adminInvoicesRouter);
adminRouter.use('/client-billing', adminClientBillingRouter); // case-level STAFF; list, CSV, settings ADMIN (per route)
adminRouter.use('/packages', requireMinRole('ADMIN'), adminPackagesRouter);
adminRouter.use('/countersign', requireMinRole('ADMIN'), adminCountersignRouter);
adminRouter.use('/accounting', requireMinRole('ADMIN'), adminAccountingRouter);
adminRouter.use('/quotes', requireMinRole('ADMIN'), adminQuotesRouter); // Angebote for employers
adminRouter.use('/reviews', adminReviewsRouter);
adminRouter.use('/analytics', adminAnalyticsRouter);
adminRouter.use('/upload', requireMinRole('ADMIN'), adminUploadRouter);
adminRouter.use('/settings', requireMinRole('ADMIN'), adminSettingsRouter);
adminRouter.use('/content', requireMinRole('ADMIN'), adminContentRouter);
adminRouter.use('/guides', requireMinRole('ADMIN'), adminGuidesRouter);
adminRouter.use('/site-features', adminSiteFeaturesRouter); // read: staff; writes: ADMIN (checked per route)

adminRouter.use('/inquiries', adminInquiriesRouter); // leads: paged list, owner, notes, conversion (routes/admin/inquiries.ts)
