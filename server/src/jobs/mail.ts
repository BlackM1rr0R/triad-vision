import { registerJob } from '../lib/scheduler.js';
import { mailSettings } from '../lib/mail/settings.js';
import { runMailSync, wakeSnoozed } from '../lib/mail/sync.js';

/**
 * Workspace mail: every account with sync enabled is pulled from its IMAP server on an interval
 * (default 60 s, MAIL_SYNC_INTERVAL_SEC), and snoozed messages whose time has come are woken up.
 * Both steps catch their own errors; a mailbox that is down never blocks the others.
 */
export const runMailJobs = async (now = new Date()) => {
  try {
    await wakeSnoozed(now);
  } catch (err) {
    console.error('[mail] snooze wake-up failed', err);
  }
  await runMailSync();
};

registerJob({ name: 'mail-sync', everyMs: Math.max(15, mailSettings.syncIntervalSec) * 1000, firstRunAfterMs: 20_000, run: () => runMailJobs() });
