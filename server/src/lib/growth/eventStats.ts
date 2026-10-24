import { prisma } from '../../db.js';

/**
 * Conversion of info sessions: per event how many registered, checked in, did not show, and how many
 * registrants became a lead (InfoEventRegistration.inquiryId), a client (an account with the same
 * e-mail) and a case (that client opened a case after registering).
 */
export interface EventConversion {
  registered: number;
  checkedIn: number;
  noShow: number;
  inquiries: number;
  clients: number;
  cases: number;
}

export const emptyConversion = (): EventConversion => ({ registered: 0, checkedIn: 0, noShow: 0, inquiries: 0, clients: 0, cases: 0 });

export const eventConversions = async (eventIds: string[]) => {
  const out: Record<string, EventConversion> = {};
  if (!eventIds.length) return out;
  const regs = await prisma.infoEventRegistration.findMany({
    where: { eventId: { in: eventIds } },
    select: { eventId: true, email: true, attendance: true, inquiryId: true, createdAt: true },
  });
  const emails = [...new Set(regs.map((r) => r.email.toLowerCase()))];
  const users = emails.length
    ? await prisma.user.findMany({
        where: { email: { in: emails }, role: 'CLIENT' },
        select: { id: true, email: true, cases: { select: { createdAt: true }, orderBy: { createdAt: 'asc' } } },
      })
    : [];
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  for (const r of regs) {
    const c = (out[r.eventId] ??= emptyConversion());
    c.registered++;
    if (r.attendance === 'CHECKED_IN') c.checkedIn++;
    if (r.attendance === 'NO_SHOW') c.noShow++;
    if (r.inquiryId) c.inquiries++;
    const u = byEmail.get(r.email.toLowerCase());
    if (!u) continue;
    c.clients++;
    if (u.cases.some((k) => k.createdAt.getTime() >= r.createdAt.getTime())) c.cases++;
  }
  return out;
};
