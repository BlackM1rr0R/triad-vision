import { registerJob } from '../lib/scheduler.js';
import { runReportSchedules } from '../lib/reports/schedule.js';

/** Scheduled reports (lib/reports/schedule.ts): every 5 minutes, each due period of a schedule is sent once. */
registerJob({
  name: 'report-schedules',
  everyMs: 5 * 60 * 1000,
  firstRunAfterMs: 2 * 60 * 1000,
  run: async () => {
    await runReportSchedules();
  },
});
