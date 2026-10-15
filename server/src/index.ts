import { config } from './config.js';
import { createApp } from './app.js';
import { purgeDeadSessions } from './middleware/auth.js';
import { startScheduler } from './lib/scheduler.js';
import './jobs/index.js';

const server = createApp().listen(config.port, () => {
  console.log(`Triad Vision API listening on http://localhost:${config.port}`);
});

// Slowloris-style protection: do not keep idle or half-open connections around for long.
server.headersTimeout = 20_000;
server.requestTimeout = 60_000;
server.keepAliveTimeout = 10_000;

// Expired and long-revoked sessions are useless; clean them up once an hour.
const cleanup = setInterval(() => {
  purgeDeadSessions().catch((err) => console.error('[sessions] purge failed', err));
}, 60 * 60 * 1000);
cleanup.unref();

const stopJobs = startScheduler();

const shutdown = () => {
  clearInterval(cleanup);
  stopJobs();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
