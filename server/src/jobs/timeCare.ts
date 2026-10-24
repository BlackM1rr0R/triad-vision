import { registerJob } from '../lib/scheduler.js';
import { runTimerIdleCheck } from '../lib/timeTracking/service.js';
import { runCheckIns } from '../lib/checkIns/service.js';

/**
 * Staff timer idle protection (every 10 minutes: "still working?" at 10 h, auto-stop at 12 h) and the
 * post-arrival check-ins (hourly: follow-ups for arrived workers, +30 / +90 / +180 day messages, employer
 * check-ins). Both are idempotent (unique rows / claimed updates).
 */
registerJob({ name: 'time-idle', everyMs: 10 * 60 * 1000, run: async () => void (await runTimerIdleCheck()) });
registerJob({ name: 'arrival-checkins', everyMs: 60 * 60 * 1000, run: async () => void (await runCheckIns()) });
