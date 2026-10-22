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
import { accountRouter } from './routes/account.js';
import { messagingRouter } from './routes/messaging.js';
import { documentsRouter } from './routes/documents.js';
import { journeyRouter } from './routes/journey.js';
import { interviewsRouter } from './routes/interviews.js';
import { partnerRouter } from './routes/partner.js';
import { calendarRouter } from './routes/calendar.js';
import { mailRouter } from './routes/mail.js';
import { mailboxRouter } from './routes/mailbox.js';
import { chatRouter } from './routes/chat.js';
import { eventsRouter } from './routes/events.js';
import { contactsRouter } from './routes/contacts.js';
import { workspaceRouter } from './routes/workspace.js';
import { agentPortalRouter } from './routes/agentPortal.js';
import { partnerPortalRouter } from './routes/partnerPortal.js';
import { translationsRouter } from './routes/translations.js';
import { privacyRouter } from './routes/privacy.js';
import { cvRouter } from './routes/cv.js';
import { vaultRouter } from './routes/vault.js';
import { arrivalRouter } from './routes/arrival.js';
import { interviewPrepRouter } from './routes/interviewPrep.js';
import { surveysRouter } from './routes/surveys.js';
import { companyRequestsRouter } from './routes/companyRequests.js';
import { twoFactorRouter } from './routes/twoFactor.js';
import { companyRouter } from './routes/company.js';
import { companyInvoicesRouter } from './routes/companyInvoices.js';
import { vacanciesRouter } from './routes/vacancies.js';
import { bookingRouter } from './routes/booking.js';
import { reviewsRouter } from './routes/reviews.js';
import { trackRouter } from './routes/track.js';
import { seoRouter } from './routes/seo.js';
import { driveRouter } from './routes/drive.js';
import { driveCreateRouter } from './routes/driveCreate.js';
import { driveIntelRouter } from './routes/driveIntel.js';
import { driveCollabRouter } from './routes/driveCollab.js';
import { shareRouter } from './routes/share.js';
import { fileLockedHandler } from './lib/driveCollab/lock.js';
import { sheetsRouter } from './routes/sheets.js';
import { tasksRouter } from './routes/tasks.js';
import { signRouter, signaturesRouter } from './routes/signatures.js';
import { aiRouter } from './routes/ai.js';
import { aiWritingRouter } from './routes/aiWriting.js';
import { companyAiRouter } from './routes/companyAi.js';
import { publicAiRouter } from './routes/publicAi.js';
import { aiDocsRouter } from './routes/aiDocs.js';
import { aiMailRouter } from './routes/aiMail.js';
import { uploadAiRouter } from './routes/uploadAi.js';

type RequestWithRawBody = import('express').Request & { rawBody?: Buffer };

/** Builds the Express app without listening, so tests can drive it with supertest. */
export const createApp = () => {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.set('etag', 'weak');
  app.use(requestId);
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
  app.use(cookieParser());
  app.use(loadUser);
  app.use(csrfGuard);
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
  app.use('/api/drive/intel', driveIntelRouter);
  app.use('/api/drive/collab', driveCollabRouter);
  app.use('/api/drive', driveRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/sign', signRouter);
  app.use('/api/share', shareRouter);
  app.use('/api/signatures', signaturesRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/company/invoices', companyInvoicesRouter);
  app.use('/api/company/requests', companyRequestsRouter);
  app.use('/api/company/ai', companyAiRouter);
  app.use('/api/company', companyRouter);
  app.use('/api/vacancies', vacanciesRouter);
  app.use('/api/booking', bookingRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/track', trackRouter);
  app.use('/api/messaging', messagingRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/journey', journeyRouter);
  app.use('/api/interviews', interviewsRouter);
  app.use('/api/v1', partnerRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/mail', mailRouter);
  app.use('/api/mailbox', mailboxRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/contacts', contactsRouter);
  app.use('/api/workspace', workspaceRouter);
  app.use('/api/agent', agentPortalRouter);
  app.use('/api/partner', partnerPortalRouter);
  app.use('/api/translations', translationsRouter);
  app.use('/api/privacy', privacyRouter);
  app.use('/api/cv', cvRouter);
  app.use('/api/vault', vaultRouter);
  app.use('/api/arrival', arrivalRouter);
  app.use('/api/interview-prep', interviewPrepRouter);
  app.use('/api/surveys', surveysRouter);
  app.use('/api/ai-docs', aiDocsRouter);
  app.use('/api/ai-mail', aiMailRouter);
  app.use('/api/upload-ai', uploadAiRouter); // smart uploads: recognition proposals + scan quality
  app.use('/api/ai', aiRouter);
  app.use('/api/ai-writing', aiWritingRouter);
  app.use('/api/public-ai', publicAiRouter);

  // /sitemap.xml, /robots.txt and /api/seo/* (Caddy forwards the first two here).
  app.use(seoRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  app.use(fileLockedHandler);
  app.use(errorHandler);
  return app;
};
