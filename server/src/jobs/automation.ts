import { registerJob } from '../lib/scheduler.js';
import { setAutomationKick } from '../lib/automation/events.js';
import { runAutomationQueue, runTimeTriggers } from '../lib/automation/engine.js';
import { runHandovers } from '../lib/assignment/handover.js';

/**
 * Automation rules + automatic assignment:
 *  - queue: every minute (and right after an event is emitted) dispatch queued domain events and run due delayed steps;
 *  - every 15 minutes: time-based triggers (client inactive N days, in status X for N days) and absence handovers.
 * Tests drive the functions directly, so the immediate kick is only wired outside tests.
 */
if (process.env.NODE_ENV !== 'test') {
  let pending = false;
  setAutomationKick(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      void runAutomationQueue().catch((e) => console.error('[automation] drain failed', e));
    }, 250).unref();
  });
}

registerJob({
  name: 'automation-queue',
  everyMs: 60 * 1000,
  firstRunAfterMs: 30 * 1000,
  run: async () => void (await runAutomationQueue()),
});

registerJob({
  name: 'automation-time',
  everyMs: 15 * 60 * 1000,
  firstRunAfterMs: 3 * 60 * 1000,
  run: async () => {
    await runTimeTriggers();
    await runHandovers();
  },
});
