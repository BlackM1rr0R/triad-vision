import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { DEADLINE_WARN_DAYS, anmeldungDeadline, caseSelect, dateToDay, daysLeft, dueReminder, notifyHousingClient, notifyHousingStaff } from '../lib/housing/core.js';
import { claimReminder } from './reminders.js';

/**
 * Housing + Anmeldung reminders (every 10 minutes). Each send is claimed in ReminderLog first; the key
 * carries the appointment time / deadline day, so a moved appointment or move-in date re-arms them.
 *  - Bürgeramt appointment → the client: 3 days before, 1 day before and 07:00 German time on the day
 *    (only the latest due one is sent; reminders already past when the appointment was saved are skipped);
 *  - Anmeldung deadline (move-in + 14 days) without a Meldebescheinigung → the case manager (else admins)
 *    from 3 days before, and once more when it passed; the client too, while no appointment is saved.
 * Both take `now` so tests can drive time.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const safe = (p: Promise<unknown>) => p.catch((e) => console.error('[job:housing] notification failed', e));

export const runAnmeldungAppointmentReminders = async (now = new Date()) => {
  const rows = await prisma.caseHousing.findMany({
    where: { anmeldungDoneAt: null, appointmentAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY + HOUR) }, case: { status: 'APPROVED' } },
    include: { case: { select: caseSelect } },
  });
  let sent = 0;
  for (const h of rows) {
    const kind = dueReminder(h.appointmentAt!, h.appointmentSetAt ?? h.updatedAt, now);
    if (!kind) continue;
    if (!(await claimReminder(`anm-appt-${kind}:${h.id}:${h.appointmentAt!.toISOString()}`, now))) continue;
    await safe(notifyHousingClient(h.case, h, kind === '3d' ? 'APPT_3D' : kind === '1d' ? 'APPT_1D' : 'APPT_MORNING'));
    sent++;
  }
  return sent;
};

export const runAnmeldungDeadlineWarnings = async (now = new Date()) => {
  const rows = await prisma.caseHousing.findMany({
    where: {
      anmeldungDoneAt: null,
      // deadline within the warning window, or passed up to 30 days ago
      moveInDate: { not: null, gte: new Date(now.getTime() - 45 * DAY), lte: new Date(now.getTime() + (DEADLINE_WARN_DAYS - 14 + 1) * DAY) },
      case: { status: 'APPROVED' },
    },
    include: { case: { select: caseSelect } },
  });
  let sent = 0;
  for (const h of rows) {
    const deadline = anmeldungDeadline(h.moveInDate)!;
    const left = daysLeft(deadline, now);
    if (left > DEADLINE_WARN_DAYS) continue;
    const day = dateToDay(deadline);
    if (left >= 0) {
      if (await claimReminder(`anm-deadline-soon:${h.id}:${day}`, now)) {
        await safe(notifyHousingStaff(h.case, h, 'STAFF_DEADLINE_SOON', { days: left }));
        sent++;
      }
      if (!h.appointmentAt && (await claimReminder(`anm-deadline-client:${h.id}:${day}`, now))) {
        await safe(notifyHousingClient(h.case, h, 'DEADLINE_SOON', { days: left }));
      }
    } else if (await claimReminder(`anm-deadline-over:${h.id}:${day}`, now)) {
      await safe(notifyHousingStaff(h.case, h, 'STAFF_DEADLINE_OVERDUE'));
      sent++;
    }
  }
  return sent;
};

registerJob({
  name: 'housing-anmeldung',
  everyMs: 10 * 60 * 1000,
  run: async () => {
    await runAnmeldungAppointmentReminders();
    await runAnmeldungDeadlineWarnings();
  },
});
