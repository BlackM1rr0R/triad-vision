import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { loadUser } from './middleware/auth.js';
import { errorHandler } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { casesRouter } from './routes/cases.js';
import { devicesRouter } from './routes/devices.js';
import { filesRouter } from './routes/files.js';
import { notificationsRouter } from './routes/notifications.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin/index.js';
import { accountRouter } from './routes/account.js';

/** Builds the Express app without listening, so tests can drive it with supertest. */
export const createApp = () => {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  // Mobile apps send no Origin header, so CORS only applies to the web client.
  app.use(cors({ origin: config.clientUrl, credentials: true }));
  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser());
  app.use(loadUser);

  // Public CMS images. The CSP stops an uploaded SVG from running scripts.
  app.use(
    '/uploads',
    express.static(config.uploads.publicDir, {
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/cases', casesRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/account', accountRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  app.use(errorHandler);
  return app;
};
