import { registerJob } from '../lib/scheduler.js';
import { runPhoneReminders } from '../lib/messaging/appointmentReminders.js';

/** WhatsApp / SMS reminders before embassy appointments, German exams, bookings and interviews (lib/messaging/appointmentReminders.ts). */
registerJob({ name: 'phone-reminders', everyMs: 10 * 60 * 1000, firstRunAfterMs: 3 * 60 * 1000, run: async () => void (await runPhoneReminders()) });
