import { registerJob } from '../lib/scheduler.js';
import { purgeOldErrors, runErrorDigest } from '../lib/browserErrors/service.js';

/**
 * Browser error log (lib/browserErrors): once a day the admins get one notification about new error groups
 * (each group is announced once) and groups not seen for 30 days are deleted.
 */
registerJob({
  name: 'browser-errors',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 17 * 60 * 1000,
  run: async () => {
    await runErrorDigest();
    await purgeOldErrors();
  },
});
