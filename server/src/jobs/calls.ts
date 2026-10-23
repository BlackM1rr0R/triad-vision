import { registerJob } from '../lib/scheduler.js';
import { runCallbackReminders } from '../lib/calls/callbacks.js';
import { expireWaiting } from '../lib/livechat/core.js';

/**
 * Calls + live chat housekeeping (every 30 s): callback reminders 10 minutes before the window, and live chats
 * nobody accepted within 2 minutes → MISSED (the visitor is offered the contact / callback form).
 */
registerJob({
  name: 'calls',
  everyMs: 30_000,
  firstRunAfterMs: 20_000,
  run: async () => {
    await runCallbackReminders();
    await expireWaiting();
  },
});
