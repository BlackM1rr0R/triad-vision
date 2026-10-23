import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { getQuoteSettings } from '../lib/quotes/settings.js';
import { OPEN_STATUSES, expireIfDue, remindQuote } from '../lib/quotes/service.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const claim = async (key: string) => {
  try {
    await prisma.reminderLog.create({ data: { key } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

/**
 * Hourly: open quotes (SENT / VIEWED) whose validity day is over become EXPIRED (the creator is told);
 * a few days before that (setting reminderDays, default 3) the employer gets one reminder per validity
 * date — not for quotes sent less than a day ago. Idempotent via ReminderLog.
 */
export const runQuoteExpiry = async (now = new Date()) => {
  const result = { expired: 0, reminders: 0 };
  const { reminderDays } = await getQuoteSettings();

  const due = await prisma.quote.findMany({ where: { status: { in: OPEN_STATUSES }, validUntil: { lt: new Date(now.getTime() - 12 * HOUR) } }, include: { company: true } });
  for (const q of due) if (await expireIfDue(q, now)) result.expired++;

  const soon = await prisma.quote.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      validUntil: { gte: new Date(now.getTime() - 12 * HOUR), lte: new Date(now.getTime() + reminderDays * DAY) },
      sentAt: { lt: new Date(now.getTime() - DAY) },
    },
    include: { company: true },
  });
  for (const q of soon) {
    if (!(await claim(`quote-reminder:${q.id}:${q.validUntil.toISOString().slice(0, 10)}`))) continue;
    await remindQuote(q);
    result.reminders++;
  }
  return result;
};

registerJob({
  name: 'quote-expiry',
  everyMs: HOUR,
  run: async () => {
    await runQuoteExpiry();
  },
});
