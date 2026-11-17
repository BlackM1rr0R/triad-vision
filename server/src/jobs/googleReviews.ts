import { registerJob } from '../lib/scheduler.js';
import { runGoogleReviewRequests } from '../lib/googleReview/service.js';

/**
 * Automatic Google review requests (Admin → Rəylər → Google): visa approved / arrival / case closed triggers,
 * held invites released after a staff follow-up, one reminder after 7 days. Checked a few times a day (only what
 * is due is sent); idempotent through GoogleReviewInvite.dedupeKey + per-client cooldown. Does nothing until
 * the admin turns it on and sets the Google link / Place ID.
 */
registerJob({
  name: 'google-reviews',
  everyMs: 6 * 60 * 60 * 1000,
  firstRunAfterMs: 7 * 60 * 1000,
  run: async () => {
    const r = await runGoogleReviewRequests();
    if (r.sent || r.held || r.released || r.reminded) console.log(`[job:google-reviews] sent=${r.sent} held=${r.held} released=${r.released} reminded=${r.reminded} skipped=${r.skipped}`);
  },
});
