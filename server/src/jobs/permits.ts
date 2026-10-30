import { registerJob } from '../lib/scheduler.js';
import { runPermitReminders } from '../lib/permits/service.js';

/**
 * Permit expiry reminders (residence permit / EU Blue Card, passport, health insurance of the worker in
 * Germany; lib/permits): every 6 hours, idempotent through ReminderLog — a window is only ever sent once.
 */
registerJob({ name: 'permit-expiry', everyMs: 6 * 60 * 60 * 1000, firstRunAfterMs: 4 * 60 * 1000, run: async () => void (await runPermitReminders()) });
