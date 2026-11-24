import os from 'node:os';
import path from 'node:path';

/**
 * One place for the ports, database and server environment of the browser tests. Read by playwright.config.ts
 * (URLs, web servers) and by scripts/start-api.ts (migrate + seed + API). Never points at the dev or prod database:
 * the default database is triad_vision_browser and "triad_vision" is refused.
 */
// CommonJS (the repo root has no "type": "module"): Playwright and tsx both provide __dirname here.
export const browserDir = __dirname;
export const repoRoot = path.resolve(browserDir, '..', '..');
export const serverRoot = path.join(repoRoot, 'server');

export const API_PORT = Number(process.env.BROWSER_API_PORT ?? 4100);
export const WEB_PORT = Number(process.env.BROWSER_WEB_PORT ?? 4173);
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/** Written by the seed (server/tests/browser/seed.ts), read by the specs (fixtures.ts). */
export const DATA_DIR = path.join(browserDir, '.data');
export const SEED_FILE = path.join(DATA_DIR, 'seed.json');
export const OUTPUT_DIR = path.join(browserDir, 'output');
export const CRAWL_DIR = path.join(OUTPUT_DIR, 'crawl');

// Same variables as the server e2e tests (CI: mysql service on 127.0.0.1:3306, root/root), own database.
const DB_HOST = process.env.TEST_DB_HOST ?? 'localhost:3308';
const DB_USER = process.env.TEST_DB_USER ?? 'triad';
const DB_PASS = process.env.TEST_DB_PASSWORD ?? 'triad_dev_password';
const DB_NAME = process.env.BROWSER_DB_NAME ?? 'triad_vision_browser';
if (DB_NAME === 'triad_vision') throw new Error('Refusing to run browser tests against the dev database');

/** Environment of the seed and of the API process (NODE_ENV=test: no rate limit on /api, no AI, no OCR, no SMTP). */
export const serverEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  DATABASE_URL: `mysql://${DB_USER}:${DB_PASS}@${DB_HOST}/${DB_NAME}`,
  JWT_SECRET: 'browser-test-jwt-secret-not-for-any-real-instance',
  TOTP_ENC_KEY: '',
  CLIENT_URL: WEB_URL,
  UPLOADS_DIR: path.join(os.tmpdir(), 'triad-vision-browser-uploads'),
  DOCS_DIR: path.join(os.tmpdir(), 'triad-vision-browser-docs'),
  ADMIN_NOTIFY_EMAIL: 'staff-inbox@test.local',
  // Mail is recorded in EmailLog instead of being sent; no shared rate-limit store.
  SMTP_HOST: '',
  REDIS_URL: '',
  // Long enough that a slow CI run never hits the idle logout.
  SESSION_IDLE_MINUTES: '180',
  // Like the server e2e tests: clients may open a case without a vacancy (the seed creates cases through the API).
  VACANCY_POLICY_DEFAULTS: 'legacy',
  BROWSER_SEED_FILE: SEED_FILE,
};
