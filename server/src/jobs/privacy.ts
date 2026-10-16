import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { notifyStaff } from '../lib/notifications.js';
import { ADMIN_TYPE_NAME } from '../lib/privacy/texts.js';
import { claimReminder } from './reminders.js';

/**
 * Privacy request deadlines (Art. 12(3) GDPR: one month). Every open / in-progress request that is
 * due within 7 days or already overdue is reported to ADMIN+ (in-app + admin inbox) once per request
 * per calendar day (UTC), deduplicated through ReminderLog. Returns the number of requests reported.
 */

const DAY = 24 * 60 * 60 * 1000;
export const PRIVACY_DUE_SOON_DAYS = 7;

export const runPrivacyDeadlines = async (now = new Date()) => {
  const items = await prisma.privacyRequest.findMany({
    where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: new Date(now.getTime() + PRIVACY_DUE_SOON_DAYS * DAY) } },
    orderBy: { dueAt: 'asc' },
    take: 500,
  });
  const day = now.toISOString().slice(0, 10);
  let sent = 0;
  for (const r of items) {
    if (!(await claimReminder(`privacy-due:${r.id}:${day}`, now))) continue;
    const overdue = r.dueAt.getTime() < now.getTime();
    const days = Math.ceil(Math.abs(r.dueAt.getTime() - now.getTime()) / DAY);
    const subject = overdue
      ? `Məxfilik sorğusunun vaxtı keçib (${days} gün): ${ADMIN_TYPE_NAME[r.type]}`
      : `Məxfilik sorğusunun son tarixi yaxınlaşır (${days} gün): ${ADMIN_TYPE_NAME[r.type]}`;
    const body = [`E-poçt: ${r.email}`, `Status: ${r.status}`, `Son tarix: ${r.dueAt.toISOString().slice(0, 10)}`].join('\n');
    try {
      await notifyStaff(subject, body, { link: `/admin/privacy-requests/${r.id}`, type: 'PRIVACY_REQUEST_DUE' });
      sent++;
    } catch (err) {
      console.error('[job:privacy-deadlines] failed', r.id, err);
    }
  }
  return sent;
};

registerJob({ name: 'privacy-deadlines', everyMs: 60 * 60 * 1000, run: async () => void (await runPrivacyDeadlines()) });
