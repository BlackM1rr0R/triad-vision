import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, hasMinRole } from '../middleware/auth.js';
import { forbidden, notFound, parse } from '../lib/http.js';
import { NAME_STYLES } from '../lib/successShare/service.js';
import { CARD_LOCALES, asCardLocale } from '../lib/successShare/texts.js';
import { storyCardPng, type StoryFormat } from '../lib/visaStory/card.js';
import { staffYearReview, storyCardInput, visaStory } from '../lib/visaStory/service.js';

/**
 * "Your visa story" (Triad Wrapped) — mounted at /api/account/visa-story (CLIENT only, own approved main case):
 *   GET /:caseId                                    the story numbers (404 for any other case)
 *   GET /:caseId/card/:format.png?name=&lang=[&download=1]   share card, story 1080×1920 or square 1080×1080;
 *       name = first | initials | anonymous; counts only, never document details. Not cached, not public.
 *
 * Staff "Year in review" — mounted at /api/admin/year-review (STAFF+; per-staff counts only for ADMIN+):
 *   GET /?year=YYYY
 */
export const accountVisaStoryRouter = Router();
accountVisaStoryRouter.use(requireAuth);
accountVisaStoryRouter.use((req, _res, next) => (req.user?.role === 'CLIENT' ? next() : next(forbidden())));

const langQuery = z.object({ lang: z.enum(CARD_LOCALES).optional() });

accountVisaStoryRouter.get('/:caseId', async (req, res) => {
  const q = parse(langQuery, req.query);
  const story = await visaStory(req.user!.id, String(req.params.caseId), q.lang ?? asCardLocale(req.user!.locale));
  if (!story) throw notFound('CASE_NOT_FOUND');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(story);
});

const cardQuery = z.object({
  name: z.enum(NAME_STYLES).default('first'),
  lang: z.enum(CARD_LOCALES).optional(),
  download: z.string().max(5).optional(),
});

accountVisaStoryRouter.get('/:caseId/card/:file', async (req, res) => {
  const format = /^(story|square)\.png$/.exec(String(req.params.file))?.[1] as StoryFormat | undefined;
  if (!format) throw notFound();
  const q = parse(cardQuery, req.query);
  const locale = q.lang ?? asCardLocale(req.user!.locale);
  const story = await visaStory(req.user!.id, String(req.params.caseId), locale);
  if (!story) throw notFound('CASE_NOT_FOUND');
  const png = await storyCardPng(await storyCardInput(req.user!.id, story, format, q.name, locale));
  res.type('image/png');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (q.download) res.setHeader('Content-Disposition', `attachment; filename="triad-vision-visa-story-${format}.png"`);
  res.send(png);
});

export const adminYearReviewRouter = Router();

adminYearReviewRouter.get('/', async (req, res) => {
  const thisYear = new Date().getUTCFullYear();
  const { year } = parse(z.object({ year: z.coerce.number().int().min(2015).max(thisYear + 1).default(thisYear) }), req.query);
  res.json(await staffYearReview(year, hasMinRole(req.user?.role, 'ADMIN')));
});
