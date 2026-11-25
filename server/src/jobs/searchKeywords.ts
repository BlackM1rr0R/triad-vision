import { registerJob } from '../lib/scheduler.js';
import { syncAllKeywords } from '../lib/searchConsoleTracker.js';

/**
 * Search Console keyword tracker (Admin → Search performance): once a day clicks / impressions / position of every
 * tracked keyword are loaded for the last 90 days and stored. Does nothing until the GSC_* credentials are set.
 */
registerJob({
  name: 'search-keywords',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 25 * 60 * 1000,
  run: async () => {
    const r = await syncAllKeywords();
    if (r.synced || r.failed) console.log(`[job:search-keywords] synced=${r.synced} failed=${r.failed}`);
  },
});
