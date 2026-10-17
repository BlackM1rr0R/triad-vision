import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, conflict, limiter, notFound, parse } from '../lib/http.js';
import { RATING_KEYS } from '../lib/surveys/nps.js';
import { SURVEY_TOKEN_RE, hashSurveyToken, surveyExpired } from '../lib/surveys/service.js';

/**
 * Public satisfaction survey (no login), mounted at /api/surveys. The e-mailed link carries the token;
 * the in-app notification links with the survey id, which only works for the logged-in client it belongs to.
 * Nothing personal beyond the case number and the staff member's first name is returned.
 */
export const surveysRouter = Router();

const readLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 60, skip: () => config.isTest });
const answerLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 30 });

const SURVEY_ID_RE = /^[a-f0-9]{24}$/;

const findSurvey = async (req: Request, key: string) => {
  if (SURVEY_TOKEN_RE.test(key)) {
    const s = await prisma.satisfactionSurvey.findUnique({ where: { tokenHash: hashSurveyToken(key) } });
    if (s) return s;
  } else if (SURVEY_ID_RE.test(key) && req.user) {
    const s = await prisma.satisfactionSurvey.findUnique({ where: { id: key } });
    if (s && s.clientId === req.user.id) return s;
  }
  throw notFound('SURVEY_NOT_FOUND');
};

surveysRouter.get('/:token', readLimiter, async (req, res) => {
  const s = await findSurvey(req, String(req.params.token));
  const [c, staff] = await Promise.all([
    prisma.case.findUnique({ where: { id: s.caseId }, select: { number: true } }),
    s.staffId ? prisma.user.findUnique({ where: { id: s.staffId }, select: { firstName: true } }) : null,
  ]);
  res.json({
    caseNumber: c?.number ?? null,
    staffFirstName: staff?.firstName ?? null,
    trigger: s.trigger,
    answered: !!s.answeredAt,
    expired: !s.answeredAt && surveyExpired(s.sentAt),
  });
});

const rating = z.number().int().min(1).max(5).nullish();
const answerSchema = z.object({
  score: z.number().int().min(0).max(10),
  ratings: z.object(Object.fromEntries(RATING_KEYS.map((k) => [k, rating])) as Record<(typeof RATING_KEYS)[number], typeof rating>).strict().nullish(),
  comment: z.string().trim().max(2000).nullish(),
});

surveysRouter.post('/:token', answerLimiter, async (req, res) => {
  const s = await findSurvey(req, String(req.params.token));
  const body = parse(answerSchema, req.body ?? {});
  if (s.answeredAt) throw conflict('ALREADY_ANSWERED');
  if (surveyExpired(s.sentAt)) throw new HttpError(410, 'SURVEY_EXPIRED');

  const ratings = Object.fromEntries(RATING_KEYS.flatMap((k) => (body.ratings?.[k] ? [[k, body.ratings[k]]] : [])));
  // Conditional update: a double submit (two tabs) can only be stored once.
  const { count } = await prisma.satisfactionSurvey.updateMany({
    where: { id: s.id, answeredAt: null },
    data: {
      score: body.score,
      ratings: Object.keys(ratings).length ? (ratings as Prisma.InputJsonValue) : undefined,
      comment: body.comment || null,
      answeredAt: new Date(),
    },
  });
  if (!count) throw conflict('ALREADY_ANSWERED');

  // Happy clients without a public review yet are invited to write one (the existing /review page).
  const suggestReview = body.score >= 9 && !(await prisma.review.count({ where: { userId: s.clientId, status: { in: ['PENDING', 'APPROVED'] } } }));
  res.json({ ok: true, suggestReview });
});
