import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { TEST_UPLOADS_DIR, testEnv } from './testEnv';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');

const prisma = (args: string[]) =>
  execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: serverRoot,
    env: { ...process.env, ...testEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/**
 * Runs once before the e2e project: applies all migrations to the test database (prisma
 * migrate deploy creates it when missing). Never touches the dev database; rows are reset
 * before every test by tests/helpers/e2eSetup.ts.
 */
export default function setup() {
  try {
    // migrate deploy creates the database when it does not exist yet.
    prisma(['migrate', 'deploy']);
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `Test database setup failed. Is the MySQL container running (npm run db:up)?\n${e.stdout ?? ''}\n${e.stderr ?? ''}`,
    );
  }
  fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'private'), { recursive: true });
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'public'), { recursive: true });

  return () => {
    fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
  };
}
