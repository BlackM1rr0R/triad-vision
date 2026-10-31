import { registerJob } from '../lib/scheduler.js';
import { runPartnerContractJob } from '../lib/partnerRecords/reminders.js';
import { moveCompanyExtrasToColumns } from '../lib/officialForms/resolve.js';

const HOUR = 60 * 60 * 1000;

/**
 * Employer / referral partner contracts (lib/partnerRecords): lifecycle (ACTIVE / EXPIRED / auto-renewal) and the
 * expiry / notice-deadline reminder to the responsible staff. Idempotent (reminderSentAt, guarded updates), so it
 * runs every 6 hours rather than once a day: a restart never skips a day.
 */
registerJob({
  name: 'partner-contracts',
  everyMs: 6 * HOUR,
  firstRunAfterMs: 5 * 60 * 1000,
  run: async () => {
    await runPartnerContractJob();
  },
});

/** One-time, idempotent: official-form extras (Betriebsnummer, Handelsregister, fax) from Setting rows → Company columns. */
registerJob({
  name: 'company-extras-move',
  everyMs: 24 * HOUR,
  firstRunAfterMs: 2 * 60 * 1000,
  run: async () => {
    await moveCompanyExtrasToColumns();
  },
});
