import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { csrfGuard, loadUser } from './middleware/auth.js';
import { errorHandler, limiter, noStore, requestId } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { casesRouter } from './routes/cases.js';
import { scanUploadRouter } from './routes/scanUpload.js';
import { devicesRouter } from './routes/devices.js';
import { filesRouter } from './routes/files.js';
import { notificationsRouter } from './routes/notifications.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin/index.js';
import { impersonationRouter } from './routes/admin/privacyTools.js';
import { impersonation } from './lib/privacy/impersonation.js';
import { maskResponses } from './lib/privacy/mask.js';
import { accountRouter } from './routes/account.js';
import { accountBillingRouter } from './routes/billing.js'; // client portal: invoices, receipts, payment plan
import { packagesRouter } from './routes/packages.js'; // public service packages + online order
import { messagingRouter } from './routes/messaging.js';
import { messagingPlusRouter } from './routes/messagingPlus.js';
import { documentsRouter } from './routes/documents.js';
import { journeyRouter } from './routes/journey.js';
import { familyRouter } from './routes/family.js';
import { germanRouter } from './routes/german.js';
import { interviewsRouter } from './routes/interviews.js';
import { partnerRouter } from './routes/partner.js';
import { calendarRouter } from './routes/calendar.js';
import { mailRouter } from './routes/mail.js';
import { mailboxRouter } from './routes/mailbox.js';
import { mailAutoconfigRouter } from './routes/mailAutoconfig.js';
import { chatRouter } from './routes/chat.js';
import { eventsRouter } from './routes/events.js';
import { contactsRouter } from './routes/contacts.js';
import { workspaceRouter } from './routes/workspace.js';
import { agentPortalRouter } from './routes/agentPortal.js';
import { partnerPortalRouter } from './routes/partnerPortal.js';
import { translationsRouter } from './routes/translations.js';
import { privacyRouter } from './routes/privacy.js';
import { legalRouter } from './routes/legal.js';
import { waitingRoomRouter } from './routes/waitingRoom.js';
import { cvRouter } from './routes/cv.js';
import { vaultRouter } from './routes/vault.js';
import { arrivalRouter } from './routes/arrival.js';
import { housingRouter } from './routes/housing.js'; // housing search checklist + Anmeldung (client)
import { interviewPrepRouter } from './routes/interviewPrep.js';
import { surveysRouter } from './routes/surveys.js';
import { checkInsRouter } from './routes/checkIns.js'; // post-arrival check-ins (answer side)
import { accessLogRouter } from './routes/accessLog.js'; // "who viewed my documents"
import { companyRequestsRouter } from './routes/companyRequests.js';
import { twoFactorRouter } from './routes/twoFactor.js';
import { companyRouter } from './routes/company.js';
import { companyInvoicesRouter } from './routes/companyInvoices.js';
import { companyQuotesRouter, quotePublicRouter } from './routes/quotes.js';
import { vacanciesRouter } from './routes/vacancies.js';
import { bookingRouter } from './routes/booking.js';
import { reviewsRouter } from './routes/reviews.js';
import { trackRouter } from './routes/track.js';
import { seoRouter } from './routes/seo.js';
import { guidesRouter } from './routes/guides.js';
import { driveRouter } from './routes/drive.js';
import { driveCreateRouter } from './routes/driveCreate.js';
import { pdfToolsRouter } from './routes/pdfTools.js';
import { driveIntelRouter } from './routes/driveIntel.js';
import { driveCollabRouter } from './routes/driveCollab.js';
import { shareRouter } from './routes/share.js';
import { fileLockedHandler } from './lib/driveCollab/lock.js';
import { sheetsRouter } from './routes/sheets.js';
import { tasksRouter } from './routes/tasks.js';
import { signRouter, signaturesRouter } from './routes/signatures.js';
import { photoCheckRouter } from './routes/photoCheck.js'; // on-demand biometric passport photo check
import { aiRouter } from './routes/ai.js';
import { aiWritingRouter } from './routes/aiWriting.js';
import { companyAiRouter } from './routes/companyAi.js';
import { companyFormsRouter } from './routes/companyForms.js'; // official forms the employer completes and signs
import { companyWorkersRouter } from './routes/companyWorkers.js';
import { companyReportsRouter } from './routes/companyReports.js';
import { publicAiRouter } from './routes/publicAi.js';
import { aiDocsRouter } from './routes/aiDocs.js';
import { originalsRouter } from './routes/originals.js';
import { campaignPublicRouter } from './routes/campaignPublic.js';
import { aiMailRouter } from './routes/aiMail.js';
import { uploadAiRouter } from './routes/uploadAi.js';
import { clientDataRouter } from './routes/clientData.js';
import { clientProcessRouter } from './routes/clientProcess.js';
import { siteRouter } from './routes/site.js';
import { growthRouter } from './routes/growth.js';
import { landingRouter } from './routes/landing.js'; // public landing pages (/l/:slug)
import { historyMiddleware } from './lib/history/context.js';
import { callsRouter } from './routes/calls.js';
import { callWebhooksRouter } from './routes/callWebhooks.js';
import { callbackRouter } from './routes/callback.js';
import { livechatRouter } from './routes/livechat.js';
import { candidateShareRouter } from './routes/candidateShare.js';
import { introVideoRouter } from './routes/introVideo.js';
import { skillVideosRouter } from './routes/skillVideos.js'; // candidate skill videos (record / upload, consent)
import { companySkillVideosRouter } from './routes/companySkillVideos.js'; // employer side of the skill videos
import { searchRouter } from './routes/search.js';
import { compareRouter } from './routes/compare.js';
import { leadMagnetsRouter } from './routes/leadMagnets.js';
import { jobAlertsRouter } from './routes/jobAlerts.js';
import { accountRecognitionRouter } from './routes/accountRecognition.js'; // client portal: recognition status card
import { accountSuccessShareRouter, publicSuccessShareRouter } from './routes/successShare.js'; // "visa approved" share cards + /success/:token
import { googleReviewPublicRouter } from './routes/googleReview.js'; // Google review request: tracked redirect + opt-out
import { budgetRouter } from './routes/budget.js'; // first-month budget calculator (/budget): config, estimate, PDF, portal prefill
import { jobFeedsRouter } from './routes/jobFeeds.js'; // /feeds/*.xml: job board feeds (Indeed, StepStone, generic) behind a secret token
import { brandTextResponses, registerBrandApp } from './lib/brand/index.js'; // white-label brand (API JSON follows it)
import './lib/brand/pdfPatch.js'; // white-label brand in every generated PDF
import { licenseGuard } from './middleware/license.js'; // white-label licence: read-only mode for staff
import { certificatePublicRouter, courseRouter } from './routes/course.js'; // pre-departure course (client) + public certificate verification

type RequestWithRawBody = import('express').Request & { rawBody?: Buffer };

/** Builds the Express app without listening, so tests can drive it with supertest. */
export const createApp = () => {
  const app = express();
  registerBrandApp(app);
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.set('etag', 'weak');
  app.use(requestId);
  app.use(brandTextResponses); // white-label brand in text responses (no-op for the default brand)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // The API only returns JSON and files; a strict CSP stops any of it being rendered as a page.
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(compression());
  // Mobile apps send no Origin header, so CORS only applies to browsers.
  app.use(cors({ origin: config.allowedOrigins, credentials: true, maxAge: 600 }));

  // Public CMS images: static, cacheable, no session lookup. The CSP stops an uploaded SVG from running scripts.
  app.use(
    '/uploads',
    express.static(config.uploads.publicDir, {
      maxAge: '7d',
      index: false,
      dotfiles: 'deny',
      setHeaders: (res) => {
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  // Keep the raw body: webhook providers (WhatsApp/Meta) sign the exact bytes they sent.
  app.use(express.json({ limit: '3mb', verify: (req, _res, buf) => { (req as RequestWithRawBody).rawBody = buf; } }));
  // Telephony provider webhooks (Twilio / sipgate / fake): no session, no CSRF — each request is signature-checked.
  app.use('/api/calls/webhooks', callWebhooksRouter);
  app.use(cookieParser());
  app.use(loadUser);
  app.use(impersonation); // "view as client": req.user = viewed user, read-only (lib/privacy/impersonation.ts)
  app.use(licenseGuard); // licence expired / invalid on a customer instance: staff read-only, clients unaffected
  app.use(csrfGuard);
  app.use(historyMiddleware); // field history: actor / source / request id for every Prisma update
  app.use(maskResponses); // sensitive fields masked for STAFF / ADMIN per settings (lib/privacy/mask.ts)
  // A broad per-IP ceiling for everything; sensitive routes add their own tighter limits.
  // (Skipped in tests: hundreds of requests go through one in-process app there.)
  app.use('/api', limiter({ windowMs: 60 * 1000, limit: 600, skip: () => config.isTest }));
  app.use('/api', noStore);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth/2fa', twoFactorRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/cases', scanUploadRouter); // POST /:caseId/documents/scan (before the cases router)
  app.use('/api/cases', casesRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/drive/sheets', sheetsRouter);
  app.use('/api/drive/create', driveCreateRouter);
  app.use('/api/drive/pdf-tools', pdfToolsRouter);
  app.use('/api/drive/intel', driveIntelRouter);
  app.use('/api/drive/collab', driveCollabRouter);
  app.use('/api/drive', driveRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/sign', signRouter);
  app.use('/api/photo-check', photoCheckRouter); // "check my passport photo" (signed in, nothing stored)
  app.use('/api/angebot', quotePublicRouter); // public quote link (accept / decline)
  app.use('/api/packages', packagesRouter); // service packages: list, order, order status (token)
  app.use('/api/share', shareRouter);
  app.use('/api/candidate-share', candidateShareRouter); // employer share link of a candidate (no login)
  app.use('/api/intro-video', introVideoRouter); // candidate's video introduction for employers
  app.use('/api/skill-videos', skillVideosRouter); // candidate's skill videos (staff review, employer consent)
  app.use('/api/signatures', signaturesRouter);
  app.use('/api/admin/impersonate', impersonationRouter); // before the staff-only admin router (req.user is the client then)
  app.use('/api/admin', adminRouter);
  app.use('/api/account/billing', accountBillingRouter); // before the account router
  app.use('/api/account/recognition', accountRecognitionRouter); // read-only Anerkennung status of the own case
  app.use('/api/account/success-share', accountSuccessShareRouter); // visa approved: share card (consent, revoke)
  app.use('/api/account', accountRouter);
  app.use('/api/company/invoices', companyInvoicesRouter);
  app.use('/api/company/quotes', companyQuotesRouter);
  app.use('/api/company/requests', companyRequestsRouter);
  app.use('/api/company/ai', companyAiRouter);
  app.use('/api/company/skill-videos', companySkillVideosRouter); // approved + consented skill videos of presented candidates
  app.use('/api/company/forms', companyFormsRouter); // Erklärung zum Beschäftigungsverhältnis: complete + sign
  app.use('/api/company/workers', companyWorkersRouter); // "my workers" panel, worker drawer, CSV / Excel export
  app.use('/api/company/reports', companyReportsRouter); // monthly employer reports (list, PDF, e-mail opt-out)
  app.use('/api/company', companyRouter);
  app.use('/api/vacancies', vacanciesRouter);
  app.use('/api/booking', bookingRouter);
  app.use('/api/guides', guidesRouter); // public topic guides (SEO)
  app.use('/api/search', searchRouter); // public site search (guides, visas, services, FAQ, news, jobs, events, tools)
  app.use('/api/compare-visas', compareRouter); // "which visa fits me?" comparison table + FAQ
  app.use('/api/lead-magnets', leadMagnetsRouter); // e-book lead magnets: form → Inquiry + signed download link
  app.use('/api/job-alerts', jobAlertsRouter); // "notify me about new jobs" (double opt-in, digests)
  app.use('/api/growth', growthRouter); // start-date calculator, placement map, info sessions, client referrals
  app.use('/api/budget', budgetRouter); // first-month budget in Germany (public + client portal prefill)
  app.use('/api/landing', landingRouter); // landing pages: page, view counter, form → Inquiry
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/track', trackRouter);
  app.use('/api/messaging-plus', messagingPlusRouter); // translation, three-party threads, voice messages
  app.use('/api/messaging', messagingRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/journey', journeyRouter);
  app.use('/api/family', familyRouter); // family members (Familiennachzug): details + checklists per member
  app.use('/api/german', germanRouter); // German language progress: goal, courses, exams, certificate
  app.use('/api/interviews', interviewsRouter);
  app.use('/api/v1', partnerRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/mail', mailRouter);
  app.use('/api/mailbox', mailboxRouter);
  app.use('/api/mail-autoconfig', mailAutoconfigRouter); // public: Thunderbird autoconfig + Outlook autodiscover (Caddy routes them here)
  app.use('/api/chat', chatRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/contacts', contactsRouter);
  app.use('/api/workspace', workspaceRouter);
  app.use('/api/agent', agentPortalRouter);
  app.use('/api/partner', partnerPortalRouter);
  app.use('/api/translations', translationsRouter);
  app.use('/api/legal', legalRouter); // versioned AGB / privacy / cookie texts, re-acceptance, cookie consent log
  app.use('/api/waiting-room', waitingRoomRouter); // client "while you wait" lessons, exercises, checklists
  app.use('/api/privacy/access-log', accessLogRouter); // before the privacy centre router
  app.use('/api/privacy', privacyRouter);
  app.use('/api/cv', cvRouter);
  app.use('/api/vault', vaultRouter);
  app.use('/api/arrival', arrivalRouter);
  app.use('/api/housing', housingRouter);
  app.use('/api/interview-prep', interviewPrepRouter);
  app.use('/api/surveys', surveysRouter);
  app.use('/api/check-ins', checkInsRouter);
  app.use('/api/ai-docs', aiDocsRouter);
  app.use('/api/ai-mail', aiMailRouter);
  app.use('/api/upload-ai', uploadAiRouter); // smart uploads: recognition proposals + scan quality
  app.use('/api/client-data', clientDataRouter); // questionnaires, data confirmation, document guides (portal)
  app.use('/api/client-process', clientProcessRouter); // ball in court, client tasks, office visits (portal / app)
  app.use('/api/ai', aiRouter);
  app.use('/api/ai-writing', aiWritingRouter);
  app.use('/api/public-ai', publicAiRouter);
  app.use('/api/calls', callsRouter); // click-to-call, call log, notes / AI summary, callback requests (staff)
  app.use('/api/callback', callbackRouter); // public / portal "call me back" requests
  app.use('/api/livechat', livechatRouter); // AI advisor → human live chat (visitor token + staff queue)
  app.use('/api/originals', originalsRouter); // physical originals, QR labels, drive retention + storage report
  app.use('/api/site', siteRouter); // web push (PWA), public status check, "Problem bildir" reports
  app.use('/api/success', publicSuccessShareRouter); // public success share page data, card PNGs, lead form
  app.use('/api/r/review', googleReviewPublicRouter); // Google review link (click counter) + opt-out
  app.use('/api/course', courseRouter); // pre-departure course: lessons, video, quizzes, certificate PDF (CLIENT)
  app.use('/api/certificates', certificatePublicRouter); // public course certificate check (initials, course, date)
  app.use('/api', campaignPublicRouter); // campaigns: /o/:token.gif, /c/:token/:link, /unsubscribe/:token

  app.use('/feeds', jobFeedsRouter); // job board XML feeds (Caddy forwards /feeds/* here)
  // /sitemap.xml, /robots.txt and /api/seo/* (Caddy forwards the first two here).
  app.use(seoRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  app.use(fileLockedHandler);
  app.use(errorHandler);
  return app;
};
