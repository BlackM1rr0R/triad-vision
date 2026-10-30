import type { Locale } from '@prisma/client';
import { prisma } from '../../db.js';
import { emitAutomationEvent } from '../automation/events.js';
import { createAutomationTask } from '../automation/tasks.js';
import { pickAssignee, readAssignmentConfig } from './index.js';

const TITLE: Record<Locale, (name: string) => string> = {
  az: (n) => `Sorğu: ${n} ilə əlaqə saxlayın`,
  de: (n) => `Anfrage: ${n} kontaktieren`,
  en: (n) => `Inquiry: contact ${n}`,
  ru: (n) => `Запрос: связаться с ${n}`,
};

/**
 * Hook for every new inquiry / lead (contact form, AI advisor, unknown WhatsApp number): queues the automation
 * event and — when "assign inquiries" is on — gives a follow-up task to an eligible staff member (language of the
 * inquiry, least loaded), who also becomes the lead's owner (Inquiry.assignedStaffId). Never throws.
 */
export const onInquiryCreated = async (inquiryId: string) => {
  try {
    void emitAutomationEvent({ type: 'INQUIRY_CREATED', entityType: 'inquiry', entityId: inquiryId });
    const cfg = await readAssignmentConfig();
    if (cfg.mode === 'off' || !cfg.inquiries) return null;
    const q = await prisma.inquiry.findUnique({ where: { id: inquiryId } });
    if (!q) return null;
    const locale = (['az', 'de', 'en', 'ru'].includes(q.locale) ? q.locale : 'az') as Locale;
    const staffId = await pickAssignee(prisma, { clientLocale: locale });
    if (!staffId) return null;
    // The lead's owner (only if nobody took it in the meantime); the follow-up task stays as before.
    await prisma.inquiry.updateMany({ where: { id: q.id, assignedStaffId: null }, data: { assignedStaffId: staffId, assignedAt: new Date() } });
    const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { locale: true } });
    const name = q.companyName ? `${q.contactName} (${q.companyName})` : q.contactName;
    return await createAutomationTask({
      title: TITLE[staff?.locale ?? 'az'](name),
      description: [q.email, q.phone, '', q.message].filter((l) => l !== null).join('\n').slice(0, 4000),
      assigneeIds: [staffId],
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      priority: 'HIGH',
    });
  } catch (err) {
    console.error('[assignment] inquiry hook failed', err);
    return null;
  }
};
