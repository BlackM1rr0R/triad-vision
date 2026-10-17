import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { conflict, forbidden, notFound, parse } from '../../lib/http.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { monthlyTrend, parseRatings, summarize } from '../../lib/surveys/nps.js';
import { SURVEY_TTL_DAYS, deliverSurvey, surveyExpired } from '../../lib/surveys/service.js';

/**
 * Satisfaction survey results, mounted at /api/admin/surveys (STAFF+). The per-employee breakdown is
 * for ADMIN+; a staff member only sees their own row (and their own name on comments).
 */
export const adminSurveysRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => new Date(`${s}T00:00:00Z`));

const rangeOf = (q: { from?: Date; to?: Date }) => {
  const to = q.to ? new Date(q.to.getTime() + DAY - 1) : new Date();
  const from = q.from ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
  return { from, to };
};

adminSurveysRouter.get('/summary', async (req, res) => {
  const q = parse(z.object({ from: dateParam.optional(), to: dateParam.optional() }), req.query);
  const { from, to } = rangeOf(q);
  const seeAll = hasMinRole(req.user!.role, 'ADMIN');
  const rows = await prisma.satisfactionSurvey.findMany({
    where: { sentAt: { gte: from, lte: to } },
    select: { sentAt: true, answeredAt: true, score: true, ratings: true, staffId: true },
  });
  const overall = summarize(rows);

  const byStaff = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.staffId || (!seeAll && r.staffId !== req.user!.id)) continue;
    byStaff.set(r.staffId, [...(byStaff.get(r.staffId) ?? []), r]);
  }
  if (!seeAll && !byStaff.has(req.user!.id)) byStaff.set(req.user!.id, []);
  const people = await prisma.user.findMany({ where: { id: { in: [...byStaff.keys()] } }, select: { id: true, firstName: true, lastName: true } });
  const staff = people
    .map((p) => {
      const s = summarize(byStaff.get(p.id) ?? []);
      return { staffId: p.id, firstName: p.firstName, lastName: p.lastName, ...s };
    })
    .sort((a, b) => b.answered - a.answered || (b.nps.score ?? -999) - (a.nps.score ?? -999));

  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    ...overall,
    trend: monthlyTrend(rows, from, to),
    staff,
    canSeeAll: seeAll,
  });
});

const boolParam = z.enum(['true', 'false']).transform((v) => v === 'true');

adminSurveysRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      staffId: z.string().trim().min(1).max(40).optional(),
      trigger: z.enum(['VISA_APPROVED', 'CASE_CLOSED']).optional(),
      minScore: z.coerce.number().int().min(0).max(10).optional(),
      maxScore: z.coerce.number().int().min(0).max(10).optional(),
      answered: boolParam.optional(),
      hasComment: boolParam.optional(),
      from: dateParam.optional(),
      to: dateParam.optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
    req.query,
  );
  const seeAll = hasMinRole(req.user!.role, 'ADMIN');
  if (q.staffId && !seeAll && q.staffId !== req.user!.id) throw forbidden();
  const scoreFilter = q.minScore !== undefined || q.maxScore !== undefined ? { gte: q.minScore, lte: q.maxScore } : undefined;
  const where: Prisma.SatisfactionSurveyWhereInput = {
    ...(q.staffId ? { staffId: q.staffId } : {}),
    ...(q.trigger ? { trigger: q.trigger } : {}),
    ...(scoreFilter ? { score: scoreFilter } : {}),
    ...(q.answered === true ? { answeredAt: { not: null } } : q.answered === false ? { answeredAt: null } : {}),
    ...(q.hasComment ? { AND: [{ comment: { not: null } }, { comment: { not: '' } }] } : {}),
    ...(q.from || q.to ? { sentAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: new Date(q.to.getTime() + DAY - 1) } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.satisfactionSurvey.findMany({
      where,
      orderBy: [{ answeredAt: 'desc' }, { sentAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        case: { select: { id: true, number: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.satisfactionSurvey.count({ where }),
  ]);
  res.json({
    items: rows.map((s) => ({
      id: s.id,
      case: s.case,
      client: s.client,
      staff: s.staff && (seeAll || s.staff.id === req.user!.id) ? s.staff : null,
      trigger: s.trigger,
      score: s.score,
      ratings: parseRatings(s.ratings),
      comment: s.comment,
      sentAt: s.sentAt,
      remindedAt: s.remindedAt,
      answeredAt: s.answeredAt,
      expired: !s.answeredAt && surveyExpired(s.sentAt),
      expiresAt: new Date(s.sentAt.getTime() + SURVEY_TTL_DAYS * DAY),
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
});

/** Mails the link again (same link: the token is derived from the survey id). Only open, unexpired surveys. */
adminSurveysRouter.post('/:id/resend', requireMinRole('ADMIN'), async (req, res) => {
  const s = await prisma.satisfactionSurvey.findUnique({ where: { id: String(req.params.id) } });
  if (!s) throw notFound('SURVEY_NOT_FOUND');
  if (s.answeredAt) throw conflict('ALREADY_ANSWERED');
  if (surveyExpired(s.sentAt)) throw conflict('SURVEY_EXPIRED');
  await deliverSurvey(s.id, 'reminder');
  void audit(req, 'survey.resend', s.id, { caseId: s.caseId });
  res.json({ ok: true });
});
