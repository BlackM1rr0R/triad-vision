import { registerJob } from '../lib/scheduler.js';
import { createQuarterlyReview } from '../lib/accessAudit/reviews.js';
import { flushRecordTouches } from '../lib/accessAudit/recordTouch.js';
import { runAccessAnomalies } from '../lib/accessAudit/anomalies.js';

/**
 * Access Center > Audit (lib/accessAudit):
 *  - quarterly access review: hourly check, creates the quarter's review once in days 1–7 of the quarter (idempotent)
 *  - access anomaly alerts: every 10 minutes (deterministic thresholds, no AI), record counter pruned after 14 days
 */
registerJob({
  name: 'access-review',
  everyMs: 60 * 60 * 1000,
  firstRunAfterMs: 6 * 60 * 1000,
  run: async () => {
    await createQuarterlyReview();
  },
});

registerJob({
  name: 'access-anomalies',
  everyMs: 10 * 60 * 1000,
  firstRunAfterMs: 5 * 60 * 1000,
  run: async () => {
    await flushRecordTouches();
    await runAccessAnomalies();
  },
});
