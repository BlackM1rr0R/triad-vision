import { registerJob } from '../lib/scheduler.js';
import { runWeeklyReportJob } from '../lib/aiMgmt/report.js';
import { runSecurityScan } from '../lib/aiMgmt/security/alerts.js';

/**
 * Management AI (lib/aiMgmt):
 *  - weekly management report: hourly check, sent from Monday 08:00 Asia/Baku once per week (ReminderLog);
 *  - security alert rules: every 10 minutes (critical audit actions also trigger a scan in real time).
 */
registerJob({
  name: 'mgmt-weekly-report',
  everyMs: 60 * 60 * 1000,
  firstRunAfterMs: 6 * 60 * 1000,
  run: async () => {
    await runWeeklyReportJob();
  },
});

registerJob({
  name: 'security-alerts',
  everyMs: 10 * 60 * 1000,
  firstRunAfterMs: 2 * 60 * 1000,
  run: async () => {
    await runSecurityScan();
  },
});
