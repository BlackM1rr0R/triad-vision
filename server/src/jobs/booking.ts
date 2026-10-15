import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { bookingInclude, mailBooker, notifySlotStaff } from '../routes/booking.js';

const HOUR = 60 * 60 * 1000;

/** Claims a reminder key; false when it was already sent (unique key in ReminderLog). */
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
 * Consultation reminders, 24 h and 1 h before the start, to the booker (email) and the staff member
 * (in-app, push, email). Idempotent: each reminder is claimed in ReminderLog before it is sent, and
 * the key contains the start time so a moved slot gets fresh reminders. Returns the number sent.
 */
export const runBookingReminders = async (now = new Date()) => {
  const bookings = await prisma.booking.findMany({
    where: { status: 'BOOKED', slot: { startsAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) } } },
    include: bookingInclude,
  });
  let sent = 0;
  for (const b of bookings) {
    const left = b.slot.startsAt.getTime() - now.getTime();
    // Within the last hour only the 1 h reminder goes out (a late 24 h one would be noise).
    const kind = left <= HOUR ? '1h' : '24h';
    // A booking made less than 24 h ahead already got the confirmation; no 24 h reminder then.
    if (kind === '24h' && b.slot.startsAt.getTime() - b.createdAt.getTime() < 24 * HOUR) continue;
    if (!(await claim(`booking-${kind}:${b.id}:${b.slot.startsAt.toISOString()}`))) continue;
    await mailBooker(b, kind === '1h' ? 'reminder1h' : 'reminder24h');
    await notifySlotStaff(b, kind === '1h' ? 'staffReminder1h' : 'staffReminder24h').catch((e) =>
      console.error('[job:booking-reminders] staff notify failed', e),
    );
    sent++;
  }
  return sent;
};

registerJob({
  name: 'booking-reminders',
  everyMs: 10 * 60 * 1000,
  run: async () => {
    await runBookingReminders();
  },
});
