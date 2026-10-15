import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { eventInclude, notifyReminder } from '../lib/calendar/core.js';
import { expandOccurrences } from '../lib/calendar/rrule.js';
import { claimReminder } from './reminders.js';

/**
 * Event reminders: `reminderMinutes` before an occurrence starts, the owner and the attendees who
 * accepted get an in-app / push notification. Idempotent through ReminderLog (key carries the
 * occurrence start, so recurring events are reminded once per occurrence and a moved event gets a
 * fresh reminder). Runs every minute; returns the number of occurrences reminded.
 */

const MIN = 60 * 1000;
const MAX_LEAD_MS = 7 * 24 * 60 * MIN;

export const runEventReminders = async (now = new Date()) => {
  const events = await prisma.calendarEvent.findMany({
    where: {
      reminderMinutes: { not: null },
      startsAt: { lte: new Date(now.getTime() + MAX_LEAD_MS) },
      OR: [{ rrule: null, startsAt: { gt: now } }, { rrule: { not: null } }],
    },
    include: eventInclude,
    take: 2000,
  });
  let sent = 0;
  for (const e of events) {
    // 0 = "at the start": we still need a window, so remind within the minute before.
    const lead = Math.max(e.reminderMinutes ?? 0, 1) * MIN;
    const occurrences = expandOccurrences(e.startsAt, e.endsAt, e.rrule, now, new Date(now.getTime() + lead + 1));
    for (const o of occurrences) {
      if (o.start.getTime() <= now.getTime()) continue;
      if (!(await claimReminder(`event-reminder:${e.id}:${o.start.toISOString()}`, now))) continue;
      const recipients = [...new Set([e.ownerId, ...e.attendees.filter((a) => a.status === 'ACCEPTED').map((a) => a.userId)])];
      await notifyReminder(e, o.start, o.end, recipients);
      sent++;
    }
  }
  return sent;
};

registerJob({ name: 'event-reminders', everyMs: MIN, run: async () => void (await runEventReminders()) });
