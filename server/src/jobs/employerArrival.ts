import { registerJob } from '../lib/scheduler.js';
import { runFirstDayReminders } from '../lib/employerArrival.js';

/**
 * Employer arrival checklist: once per first work day, FIRST_DAY_REMIND_DAYS before it, the company's portal
 * users are told how many checklist items are still open (lib/employerArrival.ts). Hourly; idempotent via remindedAt.
 */
registerJob({
  name: 'employer-arrival-checklist',
  everyMs: 60 * 60 * 1000,
  run: async () => {
    await runFirstDayReminders();
  },
});
