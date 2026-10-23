import type { Request } from 'express';
import { prisma } from '../../db.js';
import { recordConsent } from '../privacy/consents.js';

/**
 * Marketing consent (UWG § 7 Abs. 2 Nr. 2 / DSGVO Art. 6 Abs. 1 lit. a, Art. 7). The current state lives
 * on the user (marketingOptIn + when + where it was set) so segments and the sender can filter on it;
 * every change is also appended to the consent log (ConsentRecord, type MARKETING_EMAIL) as the proof.
 * Sources: REGISTER, PROFILE, PRIVACY_CENTER, UNSUBSCRIBE.
 *
 * Returns true when the value changed. Never throws on logging problems (recordConsent swallows them).
 */
export const setMarketingOptIn = async (userId: string, granted: boolean, source: string, req?: Pick<Request, 'ip' | 'get'>) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, marketingOptIn: true } });
  if (!user || user.marketingOptIn === granted) return false;
  await prisma.user.update({
    where: { id: userId },
    data: { marketingOptIn: granted, marketingOptInAt: new Date(), marketingOptInSource: source.slice(0, 40) },
  });
  await recordConsent({ userId, email: user.email, type: 'MARKETING_EMAIL', granted, source, req });
  return true;
};
