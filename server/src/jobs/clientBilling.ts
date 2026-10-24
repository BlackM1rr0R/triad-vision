import { registerJob } from '../lib/scheduler.js';
import { runClientInvoiceReminders } from '../lib/billing/service.js';
import { runDateInstallments } from '../lib/billing/plans.js';
import { runPackageOrderJobs } from '../lib/billing/packages.js';

/**
 * Client billing, hourly: DATE instalments of payment plans are invoiced on their day; open client invoices past
 * their due day become OVERDUE, get the 1st / 2nd reminder (default 3 / 10 days) and then a staff task; signed
 * package orders that were not activated yet (hook failed, restart) are activated, abandoned ones cancelled.
 * Every step is idempotent (claims in ReminderLog, conditional updates).
 */
export const runClientBillingJobs = async (now = new Date()) => {
  const invoiced = await runDateInstallments(now);
  const reminders = await runClientInvoiceReminders(now);
  const orders = await runPackageOrderJobs();
  return { invoiced, ...reminders, ...orders };
};

registerJob({
  name: 'client-billing',
  everyMs: 60 * 60 * 1000,
  firstRunAfterMs: 3 * 60 * 1000,
  run: async () => {
    await runClientBillingJobs();
  },
});
