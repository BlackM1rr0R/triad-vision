import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { notifyUser } from '../lib/notifications.js';
import { ADMIN_UNPAID_TEXT, formatMoney } from '../lib/agents/texts.js';
import { claimReminder } from './reminders.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Daily: reminds admins of agent commissions approved more than 14 days ago and still unpaid.
 * One reminder per day (ReminderLog key carries the date). Returns the number of overdue commissions.
 */
export const runUnpaidCommissionReminders = async (now = new Date()) => {
  const overdue = await prisma.agentCommission.findMany({
    where: { status: 'APPROVED', paidAt: null, approvedAt: { lt: new Date(now.getTime() - 14 * DAY) } },
    select: { amountCents: true, currency: true },
  });
  if (!overdue.length) return 0;
  if (!(await claimReminder(`agent-commissions-unpaid:${now.toISOString().slice(0, 10)}`, now))) return 0;
  const totals = new Map<string, number>();
  for (const c of overdue) totals.set(c.currency, (totals.get(c.currency) ?? 0) + c.amountCents);
  const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, locale: true } });
  for (const a of admins) {
    const t = ADMIN_UNPAID_TEXT[a.locale];
    const total = [...totals].map(([cur, cents]) => formatMoney(cents, cur, a.locale)).join(' + ');
    await notifyUser(a.id, {
      type: 'STAFF',
      title: t.title(overdue.length),
      body: t.body(overdue.length, total),
      link: '/admin/agents/commissions?status=APPROVED',
      push: false,
    }).catch((e) => console.error('[job:agent-commissions] notify failed', e));
  }
  return overdue.length;
};

registerJob({
  name: 'agent-commissions-unpaid',
  everyMs: 6 * 60 * 60 * 1000,
  firstRunAfterMs: 10 * 60 * 1000,
  run: async () => void (await runUnpaidCommissionReminders()),
});
