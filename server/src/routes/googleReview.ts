import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { limiter, notFound, parse } from '../lib/http.js';
import {
  getGoogleReviewSettings,
  googleUrlOf,
  inviteGoogleClick,
  inviteInfo,
  isOptedOut,
  optOut,
  rateInvite,
  recordClick,
  submitInviteFeedback,
  userOfToken,
} from '../lib/googleReview/service.js';
import { grLocale } from '../lib/googleReview/texts.js';

/**
 * Google review request links — mounted at /api/r/review (site routes /r/review/:token and /r/rate/:token forward here):
 *   GET  /i/:token            rating page data (first visit = "opened")
 *   POST /i/:token/rate       { rating: 1–5 } (1–3 → staff follow-up task)
 *   POST /i/:token/feedback   { feedback } private feedback to the team
 *   GET  /i/:token/google     counts the click, redirects to the Google "write a review" page (for every rating)
 *   GET  /:token              legacy one-time request: counts the click and redirects to Google
 *   GET  /:token/info         language + opt-out state for the opt-out page
 *   POST /:token/optout       the client never gets a review request again
 */
export const googleReviewPublicRouter = Router();
const lim = limiter({ windowMs: 15 * 60 * 1000, limit: 60, skip: () => config.isTest });

googleReviewPublicRouter.get('/i/:token', lim, async (req, res) => {
  const info = await inviteInfo(String(req.params.token));
  if (!info) throw notFound('LINK_NOT_FOUND');
  res.json(info);
});

googleReviewPublicRouter.post('/i/:token/rate', lim, async (req, res) => {
  const { rating } = parse(z.object({ rating: z.number().int().min(1).max(5) }), req.body ?? {});
  const r = await rateInvite(String(req.params.token), rating);
  if (!r) throw notFound('LINK_NOT_FOUND');
  res.json(r);
});

googleReviewPublicRouter.post('/i/:token/feedback', lim, async (req, res) => {
  const { feedback } = parse(z.object({ feedback: z.string().trim().min(3).max(3000) }), req.body ?? {});
  const r = await submitInviteFeedback(String(req.params.token), feedback);
  if (!r) throw notFound('LINK_NOT_FOUND');
  res.json(r);
});

googleReviewPublicRouter.get('/i/:token/google', lim, async (req, res) => {
  const { url } = await inviteGoogleClick(String(req.params.token));
  res.redirect(302, url || config.clientUrl);
});

googleReviewPublicRouter.get('/:token', lim, async (req, res) => {
  const userId = userOfToken(String(req.params.token));
  const url = googleUrlOf(await getGoogleReviewSettings());
  if (!userId || !url) {
    res.redirect(302, config.clientUrl);
    return;
  }
  await recordClick(userId);
  res.redirect(302, url);
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
