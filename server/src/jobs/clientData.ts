import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { FINAL_STATUSES } from '../lib/caseFlow.js';
import { remindForm } from '../lib/clientData/forms.js';
import { remindConfirmation } from '../lib/clientData/confirmation.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Days after sending (and between reminders), and the number of automatic reminders. */
export const FORM_REMIND_DAYS = 3;
export const CONFIRM_REMIND_DAYS = 2;
export const MAX_REMINDERS = 3;

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
 * Hourly: questionnaires not submitted FORM_REMIND_DAYS after sending (or after the last reminder) and data
 * confirmations still open after CONFIRM_REMIND_DAYS get a reminder to the client — at most MAX_REMINDERS each,
 * never for closed cases. Idempotent via ReminderLog (one key per form / confirmation and reminder number).
 */
export const runClientDataReminders = async (now = new Date()) => {
  const result = { forms: 0, confirmations: 0 };
  const forms = await prisma.caseForm.findMany({
    where: { status: { in: ['SENT', 'DRAFT'] }, reminders: { lt: MAX_REMINDERS }, case: { status: { notIn: FINAL_STATUSES } } },
    take: 500,
  });
  for (const f of forms) {
    const last = f.remindedAt ?? f.sentAt;
    if (now.getTime() - last.getTime() < FORM_REMIND_DAYS * DAY) continue;
    if (!(await claim(`case-form-reminder:${f.id}:${f.reminders + 1}`))) continue;
    await remindForm(f);
    result.forms++;
  }
  const confs = await prisma.dataConfirmation.findMany({
    where: { status: 'PENDING', reminders: { lt: MAX_REMINDERS }, case: { status: { notIn: FINAL_STATUSES } } },
    take: 500,
  });
  for (const c of confs) {
    const last = c.remindedAt ?? c.requestedAt;
    if (now.getTime() - last.getTime() < CONFIRM_REMIND_DAYS * DAY) continue;
    if (!(await claim(`data-confirm-reminder:${c.id}:${c.reminders + 1}`))) continue;
    await remindConfirmation(c);
    result.confirmations++;
  }
  return result;
};

registerJob({
  name: 'client-data-reminders',
  everyMs: HOUR,
  run: async () => {
    const r = await runClientDataReminders();
    if (r.forms || r.confirmations) console.log(`[client-data] reminders: ${r.forms} forms, ${r.confirmations} confirmations`);
  },
});
