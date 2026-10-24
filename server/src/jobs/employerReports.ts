import { registerJob } from '../lib/scheduler.js';
import { runMonthlyEmployerReports } from '../lib/employerReports/service.js';

/**
 * Monthly employer report (lib/employerReports): hourly check; from the 1st of the month 08:00 Asia/Baku the
 * previous month's PDF report is generated and e-mailed once per company (EmployerReport unique per month).
 */
registerJob({
  name: 'employer-monthly-report',
  everyMs: 60 * 60 * 1000,
  firstRunAfterMs: 7 * 60 * 1000,
  run: async () => {
    await runMonthlyEmployerReports();
  },
});
