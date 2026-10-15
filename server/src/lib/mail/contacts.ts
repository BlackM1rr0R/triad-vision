import { prisma } from '../../db.js';
import { splitName, type Address } from './address.js';

/**
 * Address-book integration: correspondents of sent and opened messages are added to the shared
 * contacts (source MAIL) when no contact with that address exists yet. The contacts module owns
 * the UI and API; this helper only writes rows and never throws.
 */
const NOREPLY = /^(no-?reply|do-?not-?reply|noreply|mailer-daemon|postmaster|bounce|notifications?)[@+.-]/i;

export const rememberCorrespondents = async (userId: string, addresses: Address[], exclude: string[] = []) => {
  const skip = new Set(exclude.map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  for (const a of addresses) {
    const email = a.address.toLowerCase();
    if (!email.includes('@') || skip.has(email) || seen.has(email) || NOREPLY.test(email)) continue;
    seen.add(email);
    try {
      const existing = await prisma.contact.findFirst({ where: { email }, select: { id: true } });
      if (existing) {
        await prisma.contact.update({ where: { id: existing.id }, data: { lastContactAt: new Date() } });
        continue;
      }
      // Internal team members are not contacts.
      const staff = await prisma.user.findFirst({ where: { email, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } });
      if (staff) continue;
      const { firstName, lastName } = splitName({ name: a.name, address: email });
      await prisma.contact.create({
        data: { createdById: userId, shared: true, firstName: firstName.slice(0, 80), lastName: lastName?.slice(0, 80) ?? null, email, source: 'MAIL', lastContactAt: new Date() },
      });
    } catch (err) {
      console.error('[mail] contact upsert failed', email, (err as Error)?.message ?? err);
    }
  }
};
