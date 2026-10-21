import { registerJob } from '../lib/scheduler.js';
import { runOriginalsOverdue } from '../lib/originals/overdue.js';

/** Daily: overdue physical originals (given out / at apostille / with a courier too long) → in-app notification to the assigned staff. */
registerJob({
  name: 'originals-overdue',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 15 * 60 * 1000,
  run: async () => {
    const r = await runOriginalsOverdue();
    if (r.notified) console.log(`[originals] ${r.notified} overdue original(s) flagged`);
  },
});
