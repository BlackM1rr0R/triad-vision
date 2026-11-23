import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * DSGVO for the vacancy requests (lib/vacancyRequests): Art. 15 export (own data export, admin export by e-mail) and
 * Art. 17 erase by e-mail / account (notices cascade with the request).
 */

const personWhere = (email: string, userId?: string | null): Prisma.VacancyRequestWhereInput => ({
  OR: [{ email: email.trim().toLowerCase() }, ...(userId ? [{ userId }] : [])],
});

export const exportVacancyRequests = async (email: string, userId?: string | null) => {
  const rows = await prisma.vacancyRequest.findMany({ where: personWhere(email, userId), orderBy: { createdAt: 'asc' }, include: { notices: { orderBy: { sentAt: 'asc' } } } });
  const ids = [...new Set(rows.flatMap((r) => r.notices.map((n) => n.vacancyId)))];
  const vacancies = ids.length ? await prisma.vacancy.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, title: true, city: true } }) : [];
  const byId = new Map(vacancies.map((v) => [v.id, v]));
  return rows.map((r) => ({
    type: r.type,
    sector: r.sector,
    profession: r.profession,
    city: r.city,
    germanLevel: r.germanLevel,
    note: r.note,
    status: r.status,
    name: r.contactName,
    email: r.email,
    phone: r.phone,
    locale: r.locale,
    createdAt: r.createdAt,
    cancelledAt: r.cancelledAt,
    offers: r.notices.map((n) => ({ sentAt: n.sentAt, vacancy: byId.get(n.vacancyId) ? { slug: byId.get(n.vacancyId)!.slug, title: byId.get(n.vacancyId)!.title, city: byId.get(n.vacancyId)!.city } : { id: n.vacancyId } })),
  }));
};

export const eraseVacancyRequests = async (email: string, userId?: string | null, tx: Prisma.TransactionClient = prisma) =>
  (await tx.vacancyRequest.deleteMany({ where: personWhere(email, userId) })).count;
