import { registerJob } from '../lib/scheduler.js';
import { runRiskRecompute } from '../lib/checkIns/risk.js';
import { runRenewals } from '../lib/renewals/service.js';

/**
 * After the arrival: the churn risk of every employed worker is recomputed twice a day (unanswered check-ins
 * and the probation end move with time; answers recompute it at once), and the renewal job opens residence-title
 * renewal cases (90 days ahead) and sends probation-end reminders (14 days ahead). All idempotent.
 */
registerJob({ name: 'arrival-churn-risk', everyMs: 12 * 60 * 60 * 1000, firstRunAfterMs: 5 * 60 * 1000, run: async () => void (await runRiskRecompute()) });
registerJob({ name: 'renewals', everyMs: 6 * 60 * 60 * 1000, firstRunAfterMs: 3 * 60 * 1000, run: async () => void (await runRenewals()) });
