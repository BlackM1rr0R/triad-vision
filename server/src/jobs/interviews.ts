import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { interviewInclude, notifyCandidate, notifyCompany, notifyInterviewStaff } from '../lib/ops/interviews.js';
import { inviteInclude, notifyInvite } from '../lib/ops/interviewBooking.js';
import { claimReminder } from './reminders.js';

/**
 * Interview reminders 24 h and 1 h before a confirmed interview, to the candidate, the employer's
 * users and the responsible staff member. Idempotent through ReminderLog (the key carries the start
 * time, so a rescheduled interview gets fresh reminders). Returns the number of interviews reminded.
 */

const HOUR = 60 * 60 * 1000;

export const runInterviewReminders = async (now = new Date()) => {
  const items = await prisma.interview.findMany({
    where: { status: 'CONFIRMED', startsAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) } },
    include: interviewInclude,
  });
  let sent = 0;
  for (const i of items) {
    const left = i.startsAt.getTime() - now.getTime();
    // Inside the last hour only the 1 h reminder goes out (a late 24 h one would be noise).
    const kind = left <= HOUR ? '1h' : '24h';
    // Confirmed less than 24 h ahead: the confirmation itself was the 24 h notice.
    if (kind === '24h' && i.startsAt.getTime() - i.updatedAt.getTime() < 24 * HOUR) continue;
    if (!(await claimReminder(`interview-${kind}:${i.id}:${i.startsAt.toISOString()}`, now))) continue;
    const mail = kind === '1h' ? 'reminder1h' : 'reminder24h';
    await Promise.all([notifyCandidate(i, mail), notifyCompany(i, mail), notifyInterviewStaff(i, mail)].map((p) => p.catch((e) => console.error('[job:interview-reminders] failed', e))));
    sent++;
  }
  return sent;
};

/** One nudge to candidates who have not picked a time 48 h after a "pick a time" invite. Returns the number nudged. */
export const runInviteNudges = async (now = new Date()) => {
  const items = await prisma.interviewInvite.findMany({ where: { status: 'OPEN', createdAt: { lte: new Date(now.getTime() - 48 * HOUR) } }, include: inviteInclude, take: 200 });
  let sent = 0;
  for (const i of items) {
    if (!(await claimReminder(`interview-invite-nudge:${i.id}`, now))) continue;
    await notifyInvite(i, 'nudge').catch((e) => console.error('[job:interview-reminders] nudge failed', e));
    sent++;
  }
  return sent;
};

registerJob({ name: 'interview-reminders', everyMs: 10 * 60 * 1000, run: async () => void (await runInterviewReminders(), await runInviteNudges()) });
