/**
 * API process for the browser tests (tests/browser): the real Express app (createApp, every route and middleware)
 * listening on PORT, like src/index.ts but without the job scheduler, IMAP IDLE and the mail-server allow-list.
 * Jobs would change the seeded data while the tests run (reminders, notifications, mail sync).
 *
 * Started by tests/browser/scripts/start-api.ts with NODE_ENV=test and the browser-test database.
 */
import { config } from '../../src/config.js';
import { createApp } from '../../src/app.js';
import { getBrand } from '../../src/lib/brand/index.js';
import { logLicense, refreshLicense } from '../../src/lib/license/index.js';

if (!config.isTest) throw new Error('serve.ts is for the browser tests only (NODE_ENV=test)');

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandled rejection', reason);
});

logLicense(refreshLicense());
void getBrand();

const server = createApp().listen(config.port, () => {
  console.log(`[browser-api] listening on http://localhost:${config.port}`);
});
const shutdown = () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
