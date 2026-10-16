import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { WORKING_STATUSES, notifyOrderStaff } from '../lib/translations/core.js';
import { claimReminder } from './reminders.js';

/**
 * Overdue translation orders: accepted / in-progress orders past their due date remind the assignee
 * (or every admin when nobody is assigned) once per order per Baku calendar day, deduplicated through
 * ReminderLog. Returns the number of orders reminded.
 */

const bakuDay = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);

export const runTranslationOverdueReminders = async (now = new Date()) => {
  const orders = await prisma.translationOrder.findMany({
    where: { status: { in: WORKING_STATUSES }, dueAt: { lt: now } },
    select: { id: true, number: true, clientId: true, dueAt: true, assignedStaffId: true },
    take: 500,
  });
  let sent = 0;
  for (const o of orders) {
    if (!(await claimReminder(`translation-overdue:${o.id}:${bakuDay(now)}`, now))) continue;
    await notifyOrderStaff(o, 'OVERDUE', { assigneeOnly: true }).catch((e) => console.error('[job:translation-overdue] failed', e));
    sent++;
  }
  return sent;
};

registerJob({ name: 'translation-overdue', everyMs: 60 * 60 * 1000, run: async () => void (await runTranslationOverdueReminders()) });
