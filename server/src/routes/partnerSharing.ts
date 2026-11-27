import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { notFound, parse } from '../lib/http.js';
import { recordConsent } from '../lib/privacy/consents.js';
import { partnerSharingConsent } from '../lib/partners/owned.js';

/**
 * The client's side of partner ownership — /api/partner-sharing. A client who belongs to a referral partner
 * sees the partner's name and decides whether the partner may see more of their application than the
 * minimised view (consent log type PARTNER_SHARING; withdrawable at any time).
 */
export const partnerSharingRouter = Router();
partnerSharingRouter.use(requireAuth);

const view = async (userId: string) => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { ownerPartner: { select: { name: true, isReferrer: true } } } });
  // Only a referrer (the person who brought the client) is shown, with the consent switch; a German partner firm is our
  // internal business information and never named to the client.
  if (!u?.ownerPartner?.isReferrer) return { partner: null, granted: null };
  return { partner: { name: u.ownerPartner.name }, granted: (await partnerSharingConsent([userId])).get(userId) ?? null };
};

partnerSharingRouter.get('/', async (req, res) => {
  res.json(await view(req.user!.id));
});

partnerSharingRouter.post('/', async (req, res) => {
  const { granted } = parse(z.object({ granted: z.boolean() }), req.body);
  const current = await view(req.user!.id);
  if (!current.partner) throw notFound('NO_PARTNER');
  await recordConsent({ userId: req.user!.id, email: req.user!.email, type: 'PARTNER_SHARING', granted, source: 'ACCOUNT', req });
  res.json(await view(req.user!.id));
});
