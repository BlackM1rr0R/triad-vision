import { registerJob } from '../lib/scheduler.js';
import { runEventReminders } from '../lib/growth/events.js';
import { syncReferrals } from '../lib/growth/referral.js';

// Info sessions / webinars: 24 h and 1 h reminders to every registrant (idempotent via ReminderLog).
registerJob({
  name: 'info-event-reminders',
  everyMs: 10 * 60 * 1000,
  run: async () => {
    await runEventReminders();
  },
});

// Client referral programme: stages (case opened / visa approved) and PENDING → EARNED rewards.
registerJob({
  name: 'referral-sync',
  everyMs: 30 * 60 * 1000,
  run: async () => {
    await syncReferrals();
  },
});
