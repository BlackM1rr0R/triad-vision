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
    // Only what the timing needs: owner / attendees / case are loaded for the (few) events actually due this minute.
    select: { id: true, startsAt: true, endsAt: true, rrule: true, reminderMinutes: true },
    take: 2000,
  });
  let sent = 0;
  for (const lite of events) {
    // 0 = "at the start": we still need a window, so remind within the minute before.
    const lead = Math.max(lite.reminderMinutes ?? 0, 1) * MIN;
    const due = expandOccurrences(lite.startsAt, lite.endsAt, lite.rrule, now, new Date(now.getTime() + lead + 1)).filter((o) => o.start.getTime() > now.getTime());
    if (!due.length) continue;
    const e = await prisma.calendarEvent.findUnique({ where: { id: lite.id }, include: eventInclude });
    if (!e) continue; // deleted meanwhile
    for (const o of due) {
      if (!(await claimReminder(`event-reminder:${e.id}:${o.start.toISOString()}`, now))) continue;
      const recipients = [...new Set([e.ownerId, ...e.attendees.filter((a) => a.status === 'ACCEPTED').map((a) => a.userId)])];
      await notifyReminder(e, o.start, o.end, recipients);
      sent++;
    }
  }
  return sent;
};

registerJob({ name: 'event-reminders', everyMs: MIN, run: async () => void (await runEventReminders()) });
