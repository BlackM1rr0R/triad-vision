import { defineConfig, devices } from '@playwright/test';
import { API_URL, OUTPUT_DIR, WEB_PORT, WEB_URL, repoRoot } from './env';

/**
 * Browser end-to-end tests (Chromium): the built client (client/dist) served like production — static files plus
 * /api and /uploads proxied to the API (scripts/ci/static-server.mjs) — and the real API on a seeded MySQL database.
 * See README.md. CI: job "Browser tests" in .github/workflows/ci-cd.yml.
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './specs',
  outputDir: `${OUTPUT_DIR}/test-results`,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Each spec works on its own seeded client, but admin specs share the super admin: two workers are enough.
  fullyParallel: false,
  workers: CI ? 2 : 1,
  // The tests change the seeded data (uploads, submissions, reviews): a retry would start from another state.
  retries: 0,
  forbidOnly: CI,
  reporter: CI
    ? [['list'], ['github'], ['html', { outputFolder: `${OUTPUT_DIR}/report`, open: 'never' }]]
    : [['list'], ['html', { outputFolder: `${OUTPUT_DIR}/report`, open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    ...devices['Desktop Chrome'],
    // ≥ 1280 px: the staff inbox shows the profile beside the thread.
    viewport: { width: 1440, height: 900 },
    locale: 'az-AZ',
    timezoneId: 'Asia/Baku',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium' }],
  webServer: [
    {
      // migrate + seed + API (scripts/start-api.ts)
      command: 'npx tsx tests/browser/scripts/start-api.ts',
      cwd: repoRoot,
      url: `${API_URL}/api/health`,
      timeout: 240_000,
      reuseExistingServer: !CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `node scripts/ci/static-server.mjs --dir client/dist --port ${WEB_PORT} --api ${API_URL}`,
      cwd: repoRoot,
      url: WEB_URL,
      timeout: 30_000,
      reuseExistingServer: !CI,
    },
  ],
});
