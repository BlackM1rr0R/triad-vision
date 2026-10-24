import { registerJob } from '../lib/scheduler.js';
import { runEventReminders } from '../lib/growth/events.js';
import { syncReferrals } from '../lib/growth/referral.js';
import { rescoreOpenLeads } from '../lib/marketing/leadScoring.js';
import { pruneVisitors } from '../lib/marketing/visitors.js';

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

// Lead scoring: recency decays, so open leads are rescored a few times a day (no HOT notifications here);
// lead visitors that never became a lead are deleted 13 months after their last visit (DSGVO).
registerJob({
  name: 'lead-score-refresh',
  everyMs: 6 * 60 * 60 * 1000,
  run: async () => {
    await rescoreOpenLeads();
    await pruneVisitors();
  },
});
