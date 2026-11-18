import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * DSGVO for our own vacancy alerts (JobAlert: the daily digest and the vacancy waitlist, lib/jobAlerts) and the
 * waitlist notices sent from them (JobAlertNotice). Art. 15 export (GET /privacy/export, /account/export, admin export by
 * e-mail) and Art. 17 erase by e-mail (admin); account deletion removes them in lib/userDeletion.ts.
 */

const stringList = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);

const personWhere = (email: string, userId?: string | null): Prisma.JobAlertWhereInput => ({
  OR: [{ email: email.trim().toLowerCase() }, ...(userId ? [{ userId }] : [])],
});

/** Notice recipients of a person: the user id for portal entries, the lower-case e-mail for visitors. */
const recipients = (email: string, userId?: string | null) => [email.trim().toLowerCase(), ...(userId ? [userId] : [])];

/** Art. 15: the person's vacancy alerts and waitlist entries with the vacancies they were told about (no token hash). */
export const exportJobAlerts = async (email: string, userId?: string | null) => {
  const rows = await prisma.jobAlert.findMany({
    where: personWhere(email, userId),
    orderBy: { createdAt: 'asc' },
    include: { notices: { orderBy: { sentAt: 'asc' }, select: { vacancyId: true, sentAt: true } } },
  });
  const vacancyIds = Array.from(new Set(rows.flatMap((r) => r.notices.map((n) => n.vacancyId))));
  const vacancies = vacancyIds.length ? await prisma.vacancy.findMany({ where: { id: { in: vacancyIds } }, select: { id: true, slug: true, title: true, city: true } }) : [];
  const byId = new Map(vacancies.map((v) => [v.id, v]));
  return rows.map((a) => ({
    kind: a.waitlist ? ('VACANCY_WAITLIST' as const) : ('VACANCY_ALERT' as const),
    email: a.email,
    locale: a.locale,
    professions: stringList(a.professions),
    germanLevel: a.germanLevel,
    visaTypes: a.visaTypes ?? null,
    city: a.city,
    createdAt: a.createdAt,
    confirmedAt: a.confirmedAt,
    unsubscribedAt: a.unsubscribedAt,
    lastSentAt: a.lastSentAt,
    sentCount: a.sentCount,
    notices: a.notices.map((n) => {
      const v = byId.get(n.vacancyId);
      return { sentAt: n.sentAt, vacancy: v ? { slug: v.slug, title: v.title, city: v.city } : { id: n.vacancyId } };
    }),
  }));
};

/** Art. 17: deletes the person's vacancy alerts / waitlist entries and every waitlist notice addressed to them. */
export const eraseJobAlerts = async (email: string, userId?: string | null, tx: Prisma.TransactionClient = prisma) => {
  // Notices of the alerts cascade; notices kept under the person's recipient key go too.
  await tx.jobAlertNotice.deleteMany({ where: { recipient: { in: recipients(email, userId) } } });
  return (await tx.jobAlert.deleteMany({ where: personWhere(email, userId) })).count;
};
