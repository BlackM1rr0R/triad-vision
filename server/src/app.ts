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
import { devicesRouter } from './routes/devices.js';
import { filesRouter } from './routes/files.js';
import { notificationsRouter } from './routes/notifications.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin/index.js';
import { accountRouter } from './routes/account.js';
import { twoFactorRouter } from './routes/twoFactor.js';
import { companyRouter } from './routes/company.js';
import { companyInvoicesRouter } from './routes/companyInvoices.js';
import { vacanciesRouter } from './routes/vacancies.js';
import { bookingRouter } from './routes/booking.js';
import { reviewsRouter } from './routes/reviews.js';
import { trackRouter } from './routes/track.js';
import { seoRouter } from './routes/seo.js';
import { driveRouter } from './routes/drive.js';
import { tasksRouter } from './routes/tasks.js';

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

  app.use(express.json({ limit: '3mb' }));
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
  app.use('/api/cases', casesRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/drive', driveRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/company/invoices', companyInvoicesRouter);
  app.use('/api/company', companyRouter);
  app.use('/api/vacancies', vacanciesRouter);
  app.use('/api/booking', bookingRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/track', trackRouter);

  // /sitemap.xml, /robots.txt and /api/seo/* (Caddy forwards the first two here).
  app.use(seoRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  app.use(errorHandler);
  return app;
};
