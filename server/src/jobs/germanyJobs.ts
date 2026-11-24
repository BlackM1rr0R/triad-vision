import { registerJob } from '../lib/scheduler.js';
import { scheduledArbeitnowRefresh } from '../lib/germanyJobs/arbeitnow.js';
import { purgeGermanyJobAlerts, runGermanyJobAlerts } from '../lib/germanyJobs/alerts.js';
import { runExternalAutoSend } from '../lib/germanyJobs/autoSend.js';

/** Almaniya iş bazası: the free Arbeitnow feed, refreshed at most hourly (lib/germanyJobs/arbeitnow.ts; backoff on errors). */
registerJob({
  name: 'germany-jobs-feed',
  everyMs: 15 * 60 * 1000, // checks every 15 min; a refetch happens only once the feed is an hour old (or after the backoff)
  firstRunAfterMs: 3 * 60 * 1000,
  run: scheduledArbeitnowRefresh,
});

/**
 * Germany job alerts (lib/germanyJobs/alerts.ts): due daily / weekly alerts, one lookup per distinct search
 * (Arbeitnow from the cached feed, Careerjet within CAREERJET_ALERT_CALLS_PER_DAY), and DSGVO housekeeping.
 */
registerJob({
  name: 'germany-job-alerts',
  everyMs: 30 * 60 * 1000,
  firstRunAfterMs: 6 * 60 * 1000, // after the first feed refresh
  run: async () => {
    await runGermanyJobAlerts();
    await purgeGermanyJobAlerts();
  },
});

/**
 * "Apply via Triad Vision" automatic sending (lib/germanyJobs/autoSend.ts): queued applications that are due (next
 * day after a limit, retry after an SMTP error, sending switched on again), re-check of applications waiting for
 * client data, and rows stuck in SENDING. The daily / per-domain limits are checked per send.
 */
registerJob({
  name: 'external-applications-auto-send',
  everyMs: 15 * 60 * 1000,
  firstRunAfterMs: 8 * 60 * 1000,
  run: async () => {
    await runExternalAutoSend();
  },
});
