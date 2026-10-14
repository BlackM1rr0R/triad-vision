import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Overridable so tests (or a deployment) can keep uploads outside the source tree.
const uploadsRoot = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(serverRoot, 'uploads');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  jwtSecret: required('JWT_SECRET'),
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL ?? '',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'Triad Vision <no-reply@triad-vision.de>',
  },
  uploads: {
    privateDir: path.join(uploadsRoot, 'private'),
    publicDir: path.join(uploadsRoot, 'public'),
    maxFileSize: 15 * 1024 * 1024,
  },
};
