import { registerJob } from '../lib/scheduler.js';
import { runStaffDigest } from '../lib/staffDigest/index.js';

/**
 * Staff morning digest e-mail (lib/staffDigest): every 15 minutes; from 08:00 to 12:00 Asia/Baku each active
 * staff member gets one "what to do today" e-mail built from their own my-work queue (skipped when empty,
 * per-user opt-out, once per Baku day via ReminderLog).
 */
registerJob({
  name: 'staff-digest',
  everyMs: 15 * 60 * 1000,
  firstRunAfterMs: 3 * 60 * 1000,
  run: async () => {
    await runStaffDigest();
  },
});
