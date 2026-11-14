import { registerJob } from '../lib/scheduler.js';
import { scheduledArbeitnowRefresh } from '../lib/germanyJobs/arbeitnow.js';

/** Almaniya iş bazası: the free Arbeitnow feed, refreshed at most hourly (lib/germanyJobs/arbeitnow.ts; backoff on errors). */
registerJob({
  name: 'germany-jobs-feed',
  everyMs: 15 * 60 * 1000, // checks every 15 min; a refetch happens only once the feed is an hour old (or after the backoff)
  firstRunAfterMs: 3 * 60 * 1000,
  run: scheduledArbeitnowRefresh,
});
