import { defineConfig } from 'vitest/config';
import { testEnv } from './tests/helpers/testEnv';

export default defineConfig({
  test: {
    env: testEnv,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/helpers/globalSetup.ts'],
          setupFiles: ['tests/helpers/e2eSetup.ts'],
          // All e2e files share one MySQL database, so they must run one after another.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
