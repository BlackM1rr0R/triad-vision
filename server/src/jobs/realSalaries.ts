import { registerJob } from '../lib/scheduler.js';
import { runMonthlyRealSalaries } from '../lib/realSalaries/service.js';

/**
 * Real salary database (lib/realSalaries): every 6 hours; once per Baku month a new public snapshot is computed
 * (staff exclusions and new contracts show up then, or earlier through "recompute" in the admin page).
 */
registerJob({
  name: 'real-salaries-monthly',
  everyMs: 6 * 60 * 60 * 1000,
  firstRunAfterMs: 11 * 60 * 1000,
  run: async () => {
    await runMonthlyRealSalaries();
  },
});
