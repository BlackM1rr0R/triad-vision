import { Router } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { limiter, notFound } from '../lib/http.js';
import { getGoogleReviewSettings, isOptedOut, optOut, recordClick, userOfToken } from '../lib/googleReview/service.js';
import { grLocale } from '../lib/googleReview/texts.js';

/**
 * Google review request links — mounted at /api/r/review (the site route /r/review/:token forwards here):
 *   GET  /:token          counts the click and redirects to the Google "write a review" page
 *   GET  /:token/info     language + opt-out state for the opt-out page
 *   POST /:token/optout   the client never gets a review request again
 */
export const googleReviewPublicRouter = Router();
const lim = limiter({ windowMs: 15 * 60 * 1000, limit: 60, skip: () => config.isTest });

googleReviewPublicRouter.get('/:token', lim, async (req, res) => {
  const userId = userOfToken(String(req.params.token));
  const s = await getGoogleReviewSettings();
  if (!userId || !s.url) {
    res.redirect(302, config.clientUrl);
    return;
  }
  await recordClick(userId);
  res.redirect(302, s.url);
});

googleReviewPublicRouter.get('/:token/info', lim, async (req, res) => {
  const userId = userOfToken(String(req.params.token));
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } }) : null;
  if (!userId || !user) throw notFound('LINK_NOT_FOUND');
  res.json({ locale: grLocale(user.locale), optedOut: await isOptedOut(userId) });
});

googleReviewPublicRouter.post('/:token/optout', lim, async (req, res) => {
  const userId = userOfToken(String(req.params.token));
  if (!userId || !(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw notFound('LINK_NOT_FOUND');
  await optOut(userId);
  res.json({ ok: true });
});
