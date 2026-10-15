import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { notifyStaff } from '../lib/notifications.js';
import { formatEur, formatInvoiceDate, staffInvoiceTexts } from '../lib/invoiceTexts.js';
import { notifyCompanyAboutInvoice } from '../routes/admin/invoices.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Follow-up reminders after the overdue notice: every 7 days, at most this many. */
export const MAX_INVOICE_REMINDERS = 3;

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
 * Hourly: SENT invoices past their due day become OVERDUE (admins and the company are told once);
 * afterwards the company gets a reminder every 7 days, at most 3 times. Idempotent via ReminderLog.
 */
export const runInvoiceOverdue = async (now = new Date()) => {
  // Due dates are calendar days stored at 12:00 UTC: an invoice is overdue once its due day is over.
  const cutoff = new Date(now.getTime() - 12 * HOUR);
  const result = { markedOverdue: 0, reminders: 0 };

  const due = await prisma.invoice.findMany({ where: { status: 'SENT', dueDate: { lt: cutoff } }, select: { id: true } });
  for (const { id } of due) {
    const r = await prisma.invoice.updateMany({ where: { id, status: 'SENT' }, data: { status: 'OVERDUE' } });
    if (r.count) result.markedOverdue++;
  }

  const overdue = await prisma.invoice.findMany({ where: { status: 'OVERDUE' }, include: { company: true } });
  for (const inv of overdue) {
    const daysLate = Math.max(0, Math.floor((now.getTime() - inv.dueDate.getTime() - 12 * HOUR) / DAY));
    const ctx = { number: inv.number, company: inv.company.name, amount: formatEur(inv.grossCents), due: formatInvoiceDate(inv.dueDate), days: daysLate };
    const notice = await prisma.reminderLog.findUnique({ where: { key: `invoice-overdue:${inv.id}` } });
    if (!notice) {
      if (!(await claim(`invoice-overdue:${inv.id}`))) continue;
      const s = staffInvoiceTexts.overdue(ctx);
      await notifyStaff(s.title, s.body, { link: '/admin/invoices', type: 'INVOICE_OVERDUE' });
      await notifyCompanyAboutInvoice(inv, 'overdue');
      continue;
    }
    // Reminders count from the overdue notice, so a late first run never fires several at once.
    const step = Math.min(MAX_INVOICE_REMINDERS, Math.floor((now.getTime() - notice.sentAt.getTime()) / (7 * DAY)));
    if (step >= 1 && (await claim(`invoice-reminder-${step}:${inv.id}`))) {
      const s = staffInvoiceTexts.reminder(ctx);
      await notifyStaff(s.title, s.body, { link: '/admin/invoices', type: 'INVOICE_REMINDER' });
      await notifyCompanyAboutInvoice(inv, 'reminder', { days: daysLate });
      result.reminders++;
    }
  }
  return result;
};

registerJob({
  name: 'invoice-overdue',
  everyMs: 60 * 60 * 1000,
  run: async () => {
    await runInvoiceOverdue();
  },
});
