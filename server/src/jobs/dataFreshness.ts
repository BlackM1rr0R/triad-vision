import { registerJob } from '../lib/scheduler.js';
import { runFreshnessReminders } from '../lib/dataFreshness/service.js';

/**
 * Data freshness (lib/dataFreshness): every 6 hours (effectively daily — each reminder is sent once per item, kind
 * and due date via ReminderLog), admins get one notification listing the items whose review is 30 days away or due.
 */
registerJob({
  name: 'data-freshness-reminders',
  everyMs: 6 * 60 * 60 * 1000,
  firstRunAfterMs: 13 * 60 * 1000,
  run: async () => {
    await runFreshnessReminders();
  },
});
