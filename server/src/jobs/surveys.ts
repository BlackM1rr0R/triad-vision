import { registerJob } from '../lib/scheduler.js';
import { runSurveyReminders } from '../lib/surveys/service.js';

/**
 * Satisfaction surveys: surveys are created and sent by the case flow the moment a case is approved,
 * refused or cancelled; this daily job sends the single reminder 3 days later (idempotent via remindedAt).
 */
registerJob({
  name: 'surveys',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 5 * 60 * 1000,
  run: async () => {
    const r = await runSurveyReminders();
    if (r.reminded) console.log(`[job:surveys] reminded=${r.reminded}`);
  },
});
