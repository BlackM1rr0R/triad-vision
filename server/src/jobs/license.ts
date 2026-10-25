import { registerJob } from '../lib/scheduler.js';
import { logLicense, refreshLicense } from '../lib/license/index.js';

// White-label licence: re-verified once a day (expiry → grace banner → read-only mode for staff).
registerJob({
  name: 'license-check',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 5 * 60 * 1000,
  run: async () => {
    logLicense(refreshLicense());
  },
});
