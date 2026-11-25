import { registerJob } from '../lib/scheduler.js';
import { runWeeklyReport } from '../lib/weeklyReport/service.js';

/** Weekly PDF for SUPER_ADMINs: every 30 minutes; sends on Monday from 07:00 Europe/Berlin, once per ISO week. */
registerJob({
  name: 'weekly-report',
  everyMs: 30 * 60 * 1000,
  firstRunAfterMs: 5 * 60 * 1000,
  run: async () => {
    await runWeeklyReport();
  },
});
