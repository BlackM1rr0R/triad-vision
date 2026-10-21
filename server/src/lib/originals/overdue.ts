import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { overdueInfo, overdueOriginals } from './service.js';

/**
 * Daily check: originals that stay too long outside the office (given out > 7 days, at the apostille
 * > 21 days, with a courier > 10 days) are flagged to the case's assigned staff member (or, without one,
 * to the admins) as an in-app notification — once per original and status period. No carrier API calls.
 */

const TYPE = 'ORIGINAL_OVERDUE';

const TEXT: Record<string, { title: (t: string) => string; body: (n: string, s: string, d: number) => string }> = {
  az: { title: (t) => `Orijinal gecikir: ${t}`, body: (n, s, d) => `${n} — "${s}" statusunda ${d} gündür.` },
  de: { title: (t) => `Original überfällig: ${t}`, body: (n, s, d) => `${n} — seit ${d} Tagen im Status „${s}“.` },
  en: { title: (t) => `Original overdue: ${t}`, body: (n, s, d) => `${n} — ${d} days in status "${s}".` },
  ru: { title: (t) => `Оригинал просрочен: ${t}`, body: (n, s, d) => `${n} — ${d} дн. в статусе «${s}».` },
};

const STATUS: Record<string, Record<string, string>> = {
  az: { GIVEN_OUT: 'Təhvil verilib', AT_APOSTILLE: 'Apostildə', IN_TRANSIT: 'Yoldadır' },
  de: { GIVEN_OUT: 'Ausgehändigt', AT_APOSTILLE: 'Bei der Apostille', IN_TRANSIT: 'Unterwegs' },
  en: { GIVEN_OUT: 'Given out', AT_APOSTILLE: 'At apostille', IN_TRANSIT: 'In transit' },
  ru: { GIVEN_OUT: 'Выдан', AT_APOSTILLE: 'На апостиле', IN_TRANSIT: 'В пути' },
};

export const runOriginalsOverdue = async (now = new Date()) => {
  const rows = await overdueOriginals(now);
  let notified = 0;
  let admins: { id: string; locale: string }[] | null = null;
  for (const o of rows) {
    const { since, days } = overdueInfo(o, now);
    const link = `/admin/originals?open=${o.id}`;
    const seen = await prisma.notification.findFirst({ where: { type: TYPE, link, createdAt: { gte: since } }, select: { id: true } });
    if (seen) continue;
    let recipients: { id: string; locale: string }[];
    if (o.case.assignedStaffId) {
      const u = await prisma.user.findUnique({ where: { id: o.case.assignedStaffId }, select: { id: true, locale: true, isActive: true } });
      recipients = u?.isActive ? [u] : [];
    } else recipients = [];
    if (!recipients.length) {
      admins ??= await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, locale: true } });
      recipients = admins;
    }
    const who = `${o.case.client.firstName} ${o.case.client.lastName}`.trim() + ` · ${o.case.number}`;
    for (const r of recipients) {
      const tx = TEXT[r.locale] ?? TEXT.az;
      const st = (STATUS[r.locale] ?? STATUS.az)[o.status] ?? o.status;
      await notifyUser(r.id, { type: TYPE, title: tx.title(o.title), body: tx.body(who, st, days) + (o.holder ? `\n${o.holder}` : ''), link, caseId: o.caseId, email: false });
    }
    notified++;
  }
  return { overdue: rows.length, notified };
};
