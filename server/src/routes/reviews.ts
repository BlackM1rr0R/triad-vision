import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, limiter, notFound, parse } from '../lib/http.js';
import { config } from '../config.js';
import { notifyStaff } from '../lib/notifications.js';
import { hashReviewToken, inviteExpired } from '../lib/reviewInvites.js';

// Review invitations and submissions — mounted at /api/reviews
export const reviewsRouter = Router();

const tokenSchema = z.string().trim().min(20).max(200).optional();

const inviteLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 60, skip: () => config.isTest });
const submitLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 20 });

/**
 * The review is found either by the emailed token or, without a token, for the logged-in
 * candidate (in-app notifications link to /review without the token).
 */
const findReview = async (req: Request, token: string | undefined) => {
  if (token) {
    const review = await prisma.review.findUnique({ where: { tokenHash: hashReviewToken(token) }, include: { user: true } });
    if (!review) throw notFound('INVITE_NOT_FOUND');
    return review;
  }
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED');
  const review =
    (await prisma.review.findFirst({ where: { userId: req.user.id, status: 'REQUESTED' }, orderBy: { createdAt: 'desc' }, include: { user: true } })) ??
    (await prisma.review.findFirst({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, include: { user: true } }));
  if (!review) throw notFound('INVITE_NOT_FOUND');
  return review;
};

reviewsRouter.get('/invite', inviteLimiter, async (req, res) => {
  const token = parse(tokenSchema, typeof req.query.token === 'string' && req.query.token ? req.query.token : undefined);
  const review = await findReview(req, token);
  if (review.status === 'REQUESTED' && inviteExpired(review.createdAt)) throw new HttpError(410, 'INVITE_EXPIRED');
  const c = await prisma.case.findUnique({ where: { id: review.caseId }, select: { profession: true } });
  res.json({
    status: review.status,
    firstName: review.user.firstName,
    lastInitial: review.user.lastName.slice(0, 1),
    profession: c?.profession ?? review.user.profession ?? null,
    locale: review.locale,
  });
});

const submitSchema = z.object({
  token: tokenSchema,
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(20).max(1500),
  displayName: z.string().trim().min(2).max(80),
  consentPublish: z.boolean(),
  locale: z.enum(['az', 'de', 'en', 'ru']).optional(),
});

reviewsRouter.post('/submit', submitLimiter, async (req, res) => {
  const body = parse(submitSchema, req.body ?? {});
  const review = await findReview(req, body.token);
  if (review.status !== 'REQUESTED') throw new HttpError(409, 'ALREADY_SUBMITTED');
  if (inviteExpired(review.createdAt)) throw new HttpError(410, 'INVITE_EXPIRED');
  // Conditional update: two parallel submits cannot both succeed.
  const updated = await prisma.review.updateMany({
    where: { id: review.id, status: 'REQUESTED' },
    data: {
      status: 'PENDING',
      rating: body.rating,
      text: body.text,
      displayName: body.displayName,
      consentPublish: body.consentPublish,
      locale: body.locale ?? review.locale,
      submittedAt: new Date(),
    },
  });
  if (updated.count === 0) throw new HttpError(409, 'ALREADY_SUBMITTED');
  const c = await prisma.case.findUnique({ where: { id: review.caseId }, select: { number: true } });
  await notifyStaff(
    `Yeni rəy: ${'★'.repeat(body.rating)}${'☆'.repeat(5 - body.rating)}`,
    `${body.displayName}${c ? ` (${c.number})` : ''} rəy göndərdi və moderasiya gözləyir.\n\n"${body.text.slice(0, 300)}${body.text.length > 300 ? '…' : ''}"\n\nDərc etməyə razılıq: ${body.consentPublish ? 'bəli' : 'xeyr'}`,
    { link: '/admin/reviews', type: 'REVIEW_SUBMITTED' },
  );
  res.status(201).json({ ok: true, status: 'PENDING' });
});

const publicWhere = { status: 'APPROVED' as const, consentPublish: true };

reviewsRouter.get('/public', async (req, res) => {
  const q = parse(
    z.object({ page: z.coerce.number().int().min(1).max(1000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(6) }),
    req.query,
  );
  const [items, agg] = await Promise.all([
    prisma.review.findMany({
      where: publicWhere,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { id: true, rating: true, text: true, displayName: true, locale: true, submittedAt: true },
    }),
    prisma.review.aggregate({ where: publicWhere, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const count = agg._count._all;
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    items,
    page: q.page,
    pageSize: q.pageSize,
    total: count,
    count,
    average: agg._avg.rating === null ? null : Math.round(agg._avg.rating * 10) / 10,
  });
});
