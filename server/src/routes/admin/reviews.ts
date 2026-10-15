import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { conflict, notFound, parse } from '../../lib/http.js';
import { inviteExpired, inviteForCase, resendInvite } from '../../lib/reviewInvites.js';

// Admin: reviews — mounted at /api/admin/reviews (staff may read; admins moderate)
export const adminReviewsRouter = Router();

const STATUSES = ['REQUESTED', 'PENDING', 'APPROVED', 'REJECTED'] as const;

adminReviewsRouter.get('/', async (req, res) => {
  const q = parse(z.object({ status: z.enum(STATUSES).optional(), q: z.string().trim().max(100).optional() }), req.query);
  const where: Prisma.ReviewWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.q
      ? {
          OR: [
            { displayName: { contains: q.q } },
            { text: { contains: q.q } },
            { user: { OR: [{ firstName: { contains: q.q } }, { lastName: { contains: q.q } }, { email: { contains: q.q } }] } },
          ],
        }
      : {}),
  };
  const [rows, byStatus, approvedAgg] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 300,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    }),
    prisma.review.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.review.aggregate({ where: { status: 'APPROVED' }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const cases = await prisma.case.findMany({
    where: { id: { in: rows.map((r) => r.caseId) } },
    select: { id: true, number: true, profession: true, decisionAt: true },
  });
  const byCase = new Map(cases.map((c) => [c.id, c]));
  const now = new Date();
  res.json({
    items: rows.map(({ tokenHash: _t, ...r }) => ({
      ...r,
      case: byCase.get(r.caseId) ?? null,
      inviteExpired: r.status === 'REQUESTED' && inviteExpired(r.createdAt, now),
    })),
    summary: {
      byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      approvedAverage: approvedAgg._avg.rating === null ? null : Math.round(approvedAgg._avg.rating * 10) / 10,
      approvedCount: approvedAgg._count._all,
    },
  });
});

/** Approved cases without a review row (to invite manually before the daily job does). */
adminReviewsRouter.get('/candidates', async (_req, res) => {
  const reviewed = (await prisma.review.findMany({ select: { caseId: true } })).map((r) => r.caseId);
  const items = await prisma.case.findMany({
    where: { status: 'APPROVED', id: { notIn: reviewed } },
    orderBy: { decisionAt: 'desc' },
    take: 50,
    select: { id: true, number: true, profession: true, decisionAt: true, client: { select: { firstName: true, lastName: true } } },
  });
  res.json({ items });
});

adminReviewsRouter.patch('/:id', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(
    z
      .object({
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
        displayName: z.string().trim().min(2).max(80).optional(),
        text: z.string().trim().min(20).max(1500).optional(),
      })
      .refine((b) => Object.keys(b).length > 0, 'EMPTY'),
    req.body ?? {},
  );
  const review = await prisma.review.findUnique({ where: { id: String(req.params.id) } });
  if (!review) throw notFound('REVIEW_NOT_FOUND');
  if (review.status === 'REQUESTED') throw conflict('NOT_SUBMITTED');
  const item = await prisma.review.update({ where: { id: review.id }, data: body, omit: { tokenHash: true } });
  res.json({ item });
});

adminReviewsRouter.post('/:id/resend', requireMinRole('ADMIN'), async (req, res) => {
  const review = await prisma.review.findUnique({ where: { id: String(req.params.id) } });
  if (!review) throw notFound('REVIEW_NOT_FOUND');
  if (review.status !== 'REQUESTED') throw conflict('ALREADY_SUBMITTED');
  await resendInvite(review.id);
  res.json({ ok: true });
});

adminReviewsRouter.post('/invite', requireMinRole('ADMIN'), async (req, res) => {
  const { caseId } = parse(z.object({ caseId: z.string().min(1).max(40) }), req.body ?? {});
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (c.status !== 'APPROVED') throw conflict('CASE_NOT_APPROVED');
  const review = await inviteForCase(caseId);
  if (!review) throw conflict('ALREADY_INVITED');
  res.status(201).json({ ok: true, id: review.id });
});
