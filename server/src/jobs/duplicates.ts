import { registerJob } from '../lib/scheduler.js';
import { scanAllDuplicates } from '../lib/duplicates/detect.js';

/**
 * Duplicate client detection: a full scan once a day (registration, profile changes and merges scan the
 * affected client right away). Idempotent: pairs are upserted, NOT_DUPLICATE / MERGED decisions stay.
 */
registerJob({
  name: 'duplicates',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 15 * 60 * 1000,
  run: async () => {
    const r = await scanAllDuplicates();
    if (r.created || r.removed) console.log(`[job:duplicates] found=${r.found} new=${r.created} removed=${r.removed}`);
  },
});
