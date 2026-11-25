import { registerJob } from '../lib/scheduler.js';
import { scheduledArbeitnowRefresh } from '../lib/germanyJobs/arbeitnow.js';
import { purgeGermanyJobAlerts, runGermanyJobAlerts } from '../lib/germanyJobs/alerts.js';
import { purgeDiscoveryCache } from '../lib/germanyJobs/discovery/index.js';

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
 * "Apply via Triad Vision" for external listings is retired (owner decision: the candidate applies to the employer
 * directly; lib/germanyJobs/autoSettings.ts EXTERNAL_APPLY_RETIRED). No automatic sending, employer e-mail discovery
 * or client reminders any more — only the harmless cleanup of the expired discovery cache stays.
 */
registerJob({
  name: 'external-applications-cleanup',
  everyMs: 6 * 60 * 60 * 1000,
  firstRunAfterMs: 8 * 60 * 1000,
  run: async () => {
    await purgeDiscoveryCache();
  },
});
