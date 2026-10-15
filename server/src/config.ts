import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

const int = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Environment variable ${name} must be a non-negative number`);
  return n;
};

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Overridable so tests (or a deployment) can keep uploads outside the source tree.
const uploadsRoot = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(serverRoot, 'uploads');
// Staff document workspaces: <docsDir>/<user-slug>/...  (default: server/docs)
const docsRoot = process.env.DOCS_DIR ? path.resolve(process.env.DOCS_DIR) : path.join(serverRoot, 'docs');

const jwtSecret = required('JWT_SECRET');
if (isProd && (jwtSecret.length < 32 || /change-me/i.test(jwtSecret))) {
  throw new Error('JWT_SECRET must be a random string of at least 32 characters in production');
}

/**
 * `trust proxy` for Express. Only enable it when the API sits behind exactly that many reverse
 * proxies, otherwise clients can spoof X-Forwarded-For (rate limits, signer IP in contracts).
 *   TRUST_PROXY=1      one proxy (nginx/Caddy/Traefik in front)
 *   TRUST_PROXY=false  API exposed directly (default)
 */
const parseTrustProxy = (raw: string | undefined): boolean | number | string => {
  if (raw === undefined || raw === '' || raw === 'false' || raw === '0') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw; // e.g. "loopback" or a CIDR list
};

const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl,
  /** Origins allowed for CORS and accepted by the CSRF origin check (cookie sessions only). */
  allowedOrigins: Array.from(new Set([new URL(clientUrl).origin, ...extraOrigins])),
  jwtSecret,
  isProd,
  isTest,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL ?? '',
  session: {
    /** Web sessions end after this many minutes without a request (0 disables). */
    webIdleMinutes: int('SESSION_IDLE_MINUTES', 30),
    /** Absolute lifetime of a web session. */
    webMaxHours: int('SESSION_MAX_HOURS', 12),
    /** Mobile apps are used intermittently, so they get a longer idle window. */
    mobileIdleDays: int('MOBILE_SESSION_IDLE_DAYS', 14),
    mobileMaxDays: int('MOBILE_SESSION_MAX_DAYS', 30),
  },
  login: {
    /** Failed logins per e-mail before the account is locked for `lockMinutes`. */
    maxFailures: int('LOGIN_MAX_FAILURES', 5),
    lockMinutes: int('LOGIN_LOCK_MINUTES', 15),
  },
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
    /** Client case documents (PDF, images, Word). */
    maxFileSize: int('UPLOAD_MAX_FILE_MB', 5) * 1024 * 1024,
  },
  docs: {
    dir: docsRoot,
    maxFileSize: int('DOCS_MAX_FILE_MB', 5) * 1024 * 1024,
    /** Every workspace has this top-level directory; company folders live inside it. */
    rootDir: 'senedleri',
    /** Inside a company folder, documents go here. */
    companyDocsDir: 'senedler',
  },
  drive: {
    /** Team drive files live in <DOCS_DIR>/drive/<storageKey>. */
    dir: path.join(docsRoot, 'drive'),
    maxFileSize: int('DRIVE_MAX_FILE_MB', 50) * 1024 * 1024,
    /** Items stay in the recycle bin this many days before they are purged for good. */
    trashDays: int('DRIVE_TRASH_DAYS', 30),
  },
};
