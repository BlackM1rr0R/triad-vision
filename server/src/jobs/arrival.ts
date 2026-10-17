import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { notifyPlanClient, notifyPlanStaff, planInclude, responsibleStaff } from '../lib/arrival/core.js';
import { claimReminder } from './reminders.js';

/**
 * Arrival reminders, run hourly:
 *  - 48 h and 6 h before the arrival time → the client and the responsible staff member (once each;
 *    the ReminderLog key carries the arrival time, so a changed flight gets fresh reminders);
 *  - a SUBMITTED plan nobody touched for 2 days → every ADMIN+, at most once a day.
 * Each function takes `now` so tests can drive time.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const STALE_DAYS = 2;

const safe = (p: Promise<unknown>) => p.catch((e) => console.error('[job:arrival] notification failed', e));

export const runArrivalReminders = async (now = new Date()) => {
  const plans = await prisma.arrivalPlan.findMany({
    where: { status: { in: ['SUBMITTED', 'CONFIRMED'] }, arrivalTime: { gt: now, lte: new Date(now.getTime() + 48 * HOUR) } },
    include: planInclude,
  });
  let sent = 0;
  for (const p of plans) {
    const left = p.arrivalTime!.getTime() - now.getTime();
    // Inside the last 6 hours only the 6 h reminder goes out (a late 48 h one would be noise).
    const kind = left <= 6 * HOUR ? '6h' : '48h';
    if (!(await claimReminder(`arrival-${kind}:${p.id}:${p.arrivalTime!.toISOString()}`, now))) continue;
    const staff = await responsibleStaff(p);
    await Promise.all([
      safe(notifyPlanClient(p, kind === '6h' ? 'REMINDER_6H' : 'REMINDER_48H')),
      staff ? safe(notifyPlanStaff(p, kind === '6h' ? 'STAFF_REMINDER_6H' : 'STAFF_REMINDER_48H', [staff.id])) : Promise.resolve(),
    ]);
    sent++;
  }
  return sent;
};

export const runStaleArrivalReminders = async (now = new Date()) => {
  const plans = await prisma.arrivalPlan.findMany({
    where: { status: 'SUBMITTED', updatedAt: { lte: new Date(now.getTime() - STALE_DAYS * DAY) } },
    include: planInclude,
  });
  const day = now.toISOString().slice(0, 10);
  let sent = 0;
  for (const p of plans) {
    if (!(await claimReminder(`arrival-stale:${p.id}:${day}`, now))) continue;
    await safe(notifyPlanStaff(p, 'STALE', 'admins'));
    sent++;
  }
  return sent;
};

registerJob({
  name: 'arrival-reminders',
  everyMs: HOUR,
  run: async () => {
    await runArrivalReminders();
    await runStaleArrivalReminders();
  },
});
