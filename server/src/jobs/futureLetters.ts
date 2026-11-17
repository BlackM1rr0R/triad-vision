import { registerJob } from '../lib/scheduler.js';
import { runFutureLetterDeliveries } from '../lib/futureLetter/service.js';

/**
 * "Letter to my future self" (lib/futureLetter): every 3 hours (so a letter arrives on the day the arrival is
 * recorded; the client's own portal visit delivers it at once too) — letters of clients who arrived, or whose
 * fallback date began, are e-mailed once (deliveredAt is claimed atomically).
 */
registerJob({
  name: 'future-letters',
  everyMs: 3 * 60 * 60 * 1000,
  firstRunAfterMs: 11 * 60 * 1000,
  run: async () => {
    await runFutureLetterDeliveries();
  },
});
