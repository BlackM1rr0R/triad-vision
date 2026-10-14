import os from 'node:os';
import path from 'node:path';

/**
 * Environment shared by every test worker and the global setup. Tests always use a separate
 * database (triad_vision_test) and a temp upload directory, never the dev DB or server/uploads.
 */
const DB_HOST = process.env.TEST_DB_HOST ?? 'localhost:3308';
const DB_USER = process.env.TEST_DB_USER ?? 'triad';
const DB_PASS = process.env.TEST_DB_PASSWORD ?? 'triad_dev_password';
export const TEST_DB_NAME = process.env.TEST_DB_NAME ?? 'triad_vision_test';

if (TEST_DB_NAME === 'triad_vision') throw new Error('Refusing to run tests against the dev database');

export const TEST_DATABASE_URL = `mysql://${DB_USER}:${DB_PASS}@${DB_HOST}/${TEST_DB_NAME}`;
export const TEST_UPLOADS_DIR = path.join(os.tmpdir(), 'triad-vision-test-uploads');
export const ADMIN_INBOX = 'staff-inbox@test.local';

export const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'test-jwt-secret-please-do-not-use-elsewhere',
  CLIENT_URL: 'http://localhost:5173',
  UPLOADS_DIR: TEST_UPLOADS_DIR,
  ADMIN_NOTIFY_EMAIL: ADMIN_INBOX,
  // Empty SMTP host: mail is recorded in the EmailLog table instead of being sent.
  SMTP_HOST: '',
};
