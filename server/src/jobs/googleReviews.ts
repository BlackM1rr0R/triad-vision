import { registerJob } from '../lib/scheduler.js';
import { runGoogleReviewRequests } from '../lib/googleReview/service.js';

/**
 * Google review requests (Admin → Rəylər → Google): once a day, every client whose visa approval (or
 * arrival) is `delayDays` old gets ONE request — or, after a low satisfaction score, a staff task instead.
 * Idempotent through ReminderLog claims; does nothing until the admin turns it on and pastes the link.
 */
registerJob({
  name: 'google-reviews',
  everyMs: 6 * 60 * 60 * 1000,
  firstRunAfterMs: 7 * 60 * 1000,
  run: async () => {
    const r = await runGoogleReviewRequests();
    if (r.sent || r.internal) console.log(`[job:google-reviews] sent=${r.sent} internal=${r.internal} skipped=${r.skipped}`);
  },
});
