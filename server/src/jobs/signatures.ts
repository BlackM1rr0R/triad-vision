import { registerJob } from '../lib/scheduler.js';
import { runSignatureJobs } from '../lib/esign/service.js';

/**
 * E-signatures: reminds pending signers 3 and 7 days after their invitation (ReminderLog keys keep
 * it idempotent), expires requests past their deadline (the creator is notified) and retries
 * completions whose PDF generation failed.
 */
registerJob({
  name: 'esignatures',
  everyMs: 30 * 60 * 1000,
  firstRunAfterMs: 90_000,
  run: async () => {
    const r = await runSignatureJobs();
    if (r.expired || r.reminded || r.completed) console.log(`[job:esignatures] expired=${r.expired} reminded=${r.reminded} completed=${r.completed}`);
  },
});
