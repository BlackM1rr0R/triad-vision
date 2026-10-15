import type { Locale } from '@prisma/client';
import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { notifyUser } from '../lib/notifications.js';
import { OPEN_STATUSES, STAFF_ROLES, taskKey } from '../lib/tasks/core.js';
import { taskLink } from '../lib/tasks/notify.js';
import { formatTaskDue, taskTexts, type DigestRow } from '../lib/tasks/texts.js';
import { bakuParts, claimReminder } from './reminders.js';

/**
 * Task deadline reminders and the morning digest. Every send is guarded by a unique ReminderLog key
 * that contains the deadline itself, so moving a deadline re-arms its reminders while repeated runs
 * (restarts, overlapping deploys) never send twice. Each function takes `now` so tests can drive time.
 *
 * - 24 h before: sent while the deadline is 1–24 h away (closer deadlines only get "due now").
 * - due now: within two hours after the deadline (a long outage does not send stale ones).
 * - overdue: once, from the first 09:00 Baku after the deadline (up to three days late).
 * - digest: once per Baku day from 08:00 to 12:00, listing open assigned tasks due today or overdue.
 * Recipients: the assignees, or the creator when nobody is assigned. Finished tasks are skipped.
 */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Asia/Baku has no daylight saving time (UTC+4 all year). */
const BAKU_OFFSET = 4 * HOUR;
export const OVERDUE_HOUR = 9;
export const TASK_DIGEST_HOUR = 8;
const DIGEST_UNTIL_HOUR = 12;

/** The first 09:00 Baku strictly after `due`. */
export const nextMorningAfter = (due: Date, hour = OVERDUE_HOUR) => {
  const local = due.getTime() + BAKU_OFFSET;
  let at = Math.floor(local / DAY) * DAY + hour * HOUR;
  if (at <= local) at += DAY;
  return new Date(at - BAKU_OFFSET);
};

type Recipient = { id: string; locale: Locale };

const reminderTasks = (dueAt: { gt?: Date; gte?: Date; lte?: Date; lt?: Date }) =>
  prisma.task.findMany({
    where: { status: { in: OPEN_STATUSES }, dueAt },
    select: {
      id: true,
      number: true,
      title: true,
      dueAt: true,
      createdBy: { select: { id: true, locale: true, isActive: true, role: true } },
      assignees: { select: { user: { select: { id: true, locale: true, isActive: true, role: true } } } },
    },
  });

type ReminderTask = Awaited<ReturnType<typeof reminderTasks>>[number];

const isTeam = (u: { isActive: boolean; role: string }) => u.isActive && (STAFF_ROLES as string[]).includes(u.role);

const recipientsOf = (t: ReminderTask): Recipient[] => {
  const assigned = t.assignees.map((a) => a.user).filter(isTeam);
  if (assigned.length) return assigned.map((u) => ({ id: u.id, locale: u.locale }));
  return t.createdBy && isTeam(t.createdBy) ? [{ id: t.createdBy.id, locale: t.createdBy.locale }] : [];
};

const send = async (kind: 'dueSoon' | 'dueNow' | 'overdue', t: ReminderTask, now: Date) => {
  const type = { dueSoon: 'TASK_DUE_SOON', dueNow: 'TASK_DUE_NOW', overdue: 'TASK_OVERDUE' }[kind];
  const prefix = { dueSoon: 'task-due24', dueNow: 'task-duenow', overdue: 'task-overdue' }[kind];
  for (const r of recipientsOf(t)) {
    if (!(await claimReminder(`${prefix}:${t.id}:${t.dueAt!.toISOString()}:${r.id}`, now))) continue;
    const tx = taskTexts(r.locale);
    const msg = tx[kind]({ key: taskKey(t.number), title: t.title, due: formatTaskDue(t.dueAt!, r.locale) });
    await notifyUser(r.id, { type, ...msg, link: taskLink(t.number), ctaLabel: tx.cta.task });
  }
};

export const runTaskDeadlineReminders = async (now = new Date()) => {
  for (const t of await reminderTasks({ gt: new Date(now.getTime() + HOUR), lte: new Date(now.getTime() + DAY) })) await send('dueSoon', t, now);
  for (const t of await reminderTasks({ gt: new Date(now.getTime() - 2 * HOUR), lte: now })) await send('dueNow', t, now);
  for (const t of await reminderTasks({ gt: new Date(now.getTime() - 4 * DAY), lt: now })) {
    const at = nextMorningAfter(t.dueAt!);
    if (now >= at && now.getTime() - at.getTime() < 3 * DAY) await send('overdue', t, now);
  }
};

export const runTaskDigest = async (now = new Date()) => {
  const { day, hour } = bakuParts(now);
  if (hour < TASK_DIGEST_HOUR || hour >= DIGEST_UNTIL_HOUR) return;
  const endOfDay = new Date(Math.floor((now.getTime() + BAKU_OFFSET) / DAY) * DAY + DAY - BAKU_OFFSET);
  const tasks = await prisma.task.findMany({
    where: { status: { in: OPEN_STATUSES }, dueAt: { lt: endOfDay }, assignees: { some: {} } },
    orderBy: { dueAt: 'asc' },
    select: {
      number: true,
      title: true,
      dueAt: true,
      assignees: { select: { user: { select: { id: true, locale: true, isActive: true, role: true } } } },
    },
  });
  const byUser = new Map<string, { locale: Locale; tasks: typeof tasks }>();
  for (const t of tasks) {
    for (const { user } of t.assignees) {
      if (!isTeam(user)) continue;
      const entry = byUser.get(user.id) ?? { locale: user.locale, tasks: [] };
      entry.tasks.push(t);
      byUser.set(user.id, entry);
    }
  }
  for (const [userId, { locale, tasks: mine }] of byUser) {
    if (!(await claimReminder(`task-digest:${userId}:${day}`, now))) continue;
    const tx = taskTexts(locale);
    const rows: DigestRow[] = mine.slice(0, 30).map((t) => ({
      key: taskKey(t.number),
      title: t.title,
      due: formatTaskDue(t.dueAt!, locale),
      overdue: t.dueAt!.getTime() < now.getTime(),
    }));
    const msg = tx.digest({ rows });
    await notifyUser(userId, { type: 'TASK_DIGEST', ...msg, link: '/workspace/tasks?view=list&sort=dueAt', ctaLabel: tx.cta.tasks });
  }
};

export const runTaskJobs = async (now = new Date()) => {
  await runTaskDeadlineReminders(now);
  await runTaskDigest(now);
};

registerJob({ name: 'task-reminders', everyMs: 15 * MIN, run: () => runTaskJobs() });
