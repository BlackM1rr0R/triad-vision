import { registerJob } from '../lib/scheduler.js';
import { purgeJobAlerts, runJobAlertDigests } from '../lib/jobAlerts/service.js';

// Job alerts: daily digests (safety net next to the publish hook, at most one e-mail per alert per day) and
// DSGVO housekeeping (unconfirmed alerts after 7 days, unsubscribed ones 30 days after unsubscribing).
registerJob({
  name: 'job-alert-digests',
  everyMs: 30 * 60 * 1000,
  run: async () => {
    await runJobAlertDigests();
    await purgeJobAlerts();
  },
});
