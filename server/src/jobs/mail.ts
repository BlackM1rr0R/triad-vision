import { registerJob } from '../lib/scheduler.js';
import { mailSettings } from '../lib/mail/settings.js';
import { isIdleWatching, refreshMailIdle } from '../lib/mail/idle.js';
import { runMailSync, wakeSnoozed } from '../lib/mail/sync.js';

/**
 * Workspace mail: every account with sync enabled is pulled from its IMAP server on an interval
 * (default 60 s, MAIL_SYNC_INTERVAL_SEC), and snoozed messages whose time has come are woken up.
 * Accounts whose INBOX is pushed by IMAP IDLE (lib/mail/idle.ts) only get this full sync as a
 * safety net every MAIL_IDLE_POLL_INTERVAL_SEC (default 5 min). Each step catches its own errors;
 * a mailbox that is down never blocks the others.
 */
export const pollDue = (a: { id: string; lastSyncAt: Date | null }, now: Date, watched: (id: string) => boolean = isIdleWatching) => {
  if (!watched(a.id) || !a.lastSyncAt) return true;
  // A little slack so a 300 s interval polled by a 60 s job does not drift to 360 s.
  return now.getTime() - a.lastSyncAt.getTime() >= mailSettings.idlePollIntervalSec * 1000 - 5000;
};

export const runMailJobs = async (now = new Date()) => {
  try {
    await wakeSnoozed(now);
  } catch (err) {
    console.error('[mail] snooze wake-up failed', err);
  }
  // Accounts changed outside the mail routes (user deletion, admin tools) are picked up here.
  refreshMailIdle();
  await runMailSync({ due: (a) => pollDue(a, now) });
};

registerJob({ name: 'mail-sync', everyMs: Math.max(15, mailSettings.syncIntervalSec) * 1000, firstRunAfterMs: 20_000, run: () => runMailJobs() });
