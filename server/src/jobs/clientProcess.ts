import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { notifyUser } from '../lib/notifications.js';
import { displayTitle, fmtDay, taskTexts } from '../lib/clientProcess/texts.js';
import { syncRequirementTasks } from '../lib/clientProcess/tasks.js';
import { notifyVisitClient, notifyVisitStaff, visitInclude } from '../lib/clientProcess/office.js';
import { bakuParts, claimReminder } from './reminders.js';

/**
 * Client tasks and office visits. Every send is claimed in ReminderLog first (unique key containing the
 * deadline / start), so moving a deadline re-arms its reminders and repeated runs never send twice.
 *
 * Client tasks (to the client, in their language, in-app + push + e-mail per their preferences):
 * - 2 days before: while the deadline is ≤ 2 days away but not on its own Baku day (skipped for tasks
 *   given less than 2 days ahead — the "new task" notice already said it);
 * - on the due date: from 09:00 Baku on the deadline's day;
 * - overdue: from the day after the deadline, once, then every 3 days, at most 3 times.
 * Office visits: 24 h and 2 h before the start to the client; "today" to the staff member at 08:00+ Baku.
 */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
export const OVERDUE_EVERY_DAYS = 3;
export const OVERDUE_MAX = 3;
const MORNING_HOUR = 9;

/** 00:00 Baku of the day after `d`. */
const nextBakuMidnight = (d: Date) => {
  const local = d.getTime() + 4 * HOUR;
  return new Date(Math.floor(local / DAY) * DAY + DAY - 4 * HOUR);
};

export const runClientTaskReminders = async (now = new Date()) => {
  const tasks = await prisma.clientTask.findMany({
    where: { status: 'OPEN', dueAt: { not: null, lte: new Date(now.getTime() + 2 * DAY), gte: new Date(now.getTime() - (OVERDUE_EVERY_DAYS * OVERDUE_MAX + 2) * DAY) }, case: { status: { notIn: ['APPROVED', 'REJECTED', 'CANCELLED'] } } },
    include: { case: { select: { id: true, number: true, clientId: true, client: { select: { locale: true } } } } },
  });
  const today = bakuParts(now);
  let sent = 0;
  for (const t of tasks) {
    const due = t.dueAt!;
    const dueDay = bakuParts(due).day;
    const iso = due.toISOString();
    let kind: 'dueSoon' | 'dueToday' | 'overdue' | null = null;
    let key = '';
    let n = 0;
    if (today.day === dueDay) {
      if (today.hour >= MORNING_HOUR || due <= now) {
        kind = 'dueToday';
        key = `ctask-today:${t.id}:${iso}`;
      }
    } else if (due > now) {
      if (due.getTime() - t.createdAt.getTime() > 2 * DAY) {
        kind = 'dueSoon';
        key = `ctask-2d:${t.id}:${iso}`;
      }
    } else {
      const first = nextBakuMidnight(due);
      const since = now.getTime() - first.getTime();
      n = Math.floor(since / (OVERDUE_EVERY_DAYS * DAY)) + 1;
      if (since >= 0 && n <= OVERDUE_MAX && today.hour >= MORNING_HOUR) {
        kind = 'overdue';
        key = `ctask-overdue${n}:${t.id}:${iso}`;
      }
    }
    if (!kind || !(await claimReminder(key, now))) continue;
    const locale = t.case.client.locale;
    const tx = taskTexts[locale];
    const ctx = { title: displayTitle(t, locale), due: fmtDay(due, locale), number: t.case.number };
    const msg = kind === 'overdue' ? tx.overdue({ ...ctx, n }) : tx[kind](ctx);
    await notifyUser(t.case.clientId, { type: `CLIENT_TASK_${kind === 'dueSoon' ? 'DUE_SOON' : kind === 'dueToday' ? 'DUE_TODAY' : 'OVERDUE'}`, ...msg, link: `/account/cases/${t.caseId}#client-tasks`, caseId: t.caseId, ctaLabel: tx.cta });
    sent++;
  }
  return sent;
};

export const runOfficeVisitReminders = async (now = new Date()) => {
  const visits = await prisma.booking.findMany({
    where: { status: 'BOOKED', slot: { kind: 'OFFICE', startsAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) } } },
    include: visitInclude,
  });
  let sent = 0;
  for (const v of visits) {
    const left = v.slot.startsAt.getTime() - now.getTime();
    const kind = left <= 2 * HOUR ? '2h' : '24h';
    // Booked less than a day ahead: the confirmation already went out, no 24 h reminder.
    if (kind === '24h' && v.slot.startsAt.getTime() - v.createdAt.getTime() < 24 * HOUR) continue;
    if (kind === '2h' && v.slot.startsAt.getTime() - v.createdAt.getTime() < 2 * HOUR) continue;
    if (!(await claimReminder(`office-${kind}:${v.id}:${v.slot.startsAt.toISOString()}`, now))) continue;
    await notifyVisitClient(v, kind === '2h' ? 'reminder2h' : 'reminder24h');
    sent++;
  }
  // The staff member's "today" notice (once per visit, from 08:00 Baku).
  if (bakuParts(now).hour >= 8) {
    const endOfDay = nextBakuMidnight(now);
    const today = await prisma.booking.findMany({ where: { status: 'BOOKED', slot: { kind: 'OFFICE', startsAt: { gt: now, lt: endOfDay } } }, include: visitInclude });
    for (const v of today) {
      if (!(await claimReminder(`office-today:${v.id}:${v.slot.startsAt.toISOString()}`, now))) continue;
      await notifyVisitStaff(v, 'staffToday');
    }
  }
  return sent;
};

registerJob({
  name: 'client-process',
  everyMs: 10 * 60 * 1000,
  run: async () => {
    await syncRequirementTasks();
    await runClientTaskReminders();
    await runOfficeVisitReminders();
  },
});
