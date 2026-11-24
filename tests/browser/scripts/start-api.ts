/**
 * Playwright web server #1 (see ../playwright.config.ts): prepares the browser-test database and runs the API.
 *
 *   1. prisma migrate deploy   (creates the database on first run)
 *   2. server/tests/browser/seed.ts   (wipes every row, then creates the users / cases / vacancy / mail fixture
 *      and writes tests/browser/.data/seed.json)
 *   3. server/tests/browser/serve.ts  (the real Express app on API_PORT, without the job scheduler)
 *
 * Run by hand (e.g. to debug in a browser): npx tsx tests/browser/scripts/start-api.ts
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DATA_DIR, serverEnv, serverRoot } from '../env';

const env = { ...process.env, ...serverEnv };
const require = createRequire(path.join(serverRoot, 'package.json'));
const prismaCli = require.resolve('prisma/build/index.js');

const step = (label: string, args: string[]) => {
  console.log(`[browser-api] ${label}`);
  const r = spawnSync(process.execPath, args, { cwd: serverRoot, env, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[browser-api] ${label} failed (exit ${r.status ?? r.signal})`);
    process.exit(1);
  }
};

for (const dir of [path.join(serverEnv.UPLOADS_DIR, 'private'), path.join(serverEnv.UPLOADS_DIR, 'public'), serverEnv.DOCS_DIR, DATA_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

step('migrate', [prismaCli, 'migrate', 'deploy']);
step('seed', ['--import', 'tsx', 'tests/browser/seed.ts']);

console.log('[browser-api] starting the API');
const api = spawn(process.execPath, ['--import', 'tsx', 'tests/browser/serve.ts'], { cwd: serverRoot, env, stdio: 'inherit' });
const stop = () => api.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
api.on('exit', (code) => process.exit(code ?? 0));
