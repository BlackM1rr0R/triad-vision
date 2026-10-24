import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { emitWebhook } from '../../lib/ops/webhooks.js';
import { notifyVacancyReviewed } from '../../lib/jobsNotifications.js';
import { matchCandidate } from '../../lib/matching.js';
import { fillL10n, staffVacancyInput, staffVacancyPatch, uniqueSlug, vacancyData } from '../../lib/vacancies.js';

// Admin: vacancies — mounted at /api/admin/vacancies
export const adminVacanciesRouter = Router();

const STATUSES = ['DRAFT', 'PENDING', 'OPEN', 'CLOSED'] as const;

const checkRefs = async (b: { companyId?: string | null; visaCategoryId?: string | null }) => {
  if (b.companyId && !(await prisma.company.count({ where: { id: b.companyId } }))) throw badRequest('INVALID_COMPANY');
  if (b.visaCategoryId && !(await prisma.visaCategory.count({ where: { id: b.visaCategoryId } }))) throw badRequest('INVALID_VISA_CATEGORY');
};

adminVacanciesRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(STATUSES).optional(),
      companyId: z.string().max(40).optional(),
      search: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }),
    req.query,
  );
  const where: Prisma.VacancyWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.companyId ? { companyId: q.companyId === 'none' ? null : q.companyId } : {}),
    ...(q.search
      ? {
          OR: [
            { slug: { contains: q.search } },
            { profession: { contains: q.search } },
            { city: { contains: q.search } },
            { company: { name: { contains: q.search } } },
            ...(['az', 'de', 'en', 'ru'] as const).map((l) => ({ title: { path: `$.${l}`, string_contains: q.search } })),
          ],
        }
      : {}),
  };
  const pageSize = 25;
  const [items, total, byStatus] = await Promise.all([
    prisma.vacancy.findMany({
      where,
      // Pending reviews first, then newest.
      orderBy: [{ updatedAt: 'desc' }],
      skip: (q.page - 1) * pageSize,
      take: pageSize,
      include: { company: { select: { id: true, name: true, status: true } }, visaCategory: { select: { id: true, title: true, visaLabel: true } } },
    }),
    prisma.vacancy.count({ where }),
    prisma.vacancy.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const appCounts = items.length
    ? await prisma.vacancyApplication.groupBy({ by: ['vacancyId', 'status'], where: { vacancyId: { in: items.map((v) => v.id) } }, _count: { _all: true } })
    : [];
  res.json({
    items: items.map((v) => ({
      ...v,
      applications: Object.fromEntries(appCounts.filter((c) => c.vacancyId === v.id).map((c) => [c.status, c._count._all])),
    })),
    total,
    pageSize,
    counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
  });
});

/** Statuses a candidate can be added to (CLOSED is refused by POST /admin/candidates/:id/applications). */
export const ASSIGNABLE_STATUSES = ['OPEN', 'PENDING', 'DRAFT'] as const;
const STATUS_ORDER: Record<string, number> = { OPEN: 0, PENDING: 1, DRAFT: 2 };

adminVacanciesRouter.get('/options', async (req, res) => {
  // Small list for selects (add a candidate to a vacancy, rank candidates, link a case): every vacancy that is not
  // closed, open ones first. `userId` marks the vacancies that candidate already has an application for.
  const q = parse(z.object({ search: z.string().trim().max(120).optional(), userId: z.string().max(40).optional() }), req.query);
  const rows = await prisma.vacancy.findMany({
    where: {
      status: { in: [...ASSIGNABLE_STATUSES] },
      ...(q.search
        ? {
            OR: [
              { slug: { contains: q.search } },
              { profession: { contains: q.search } },
              { city: { contains: q.search } },
              { company: { name: { contains: q.search } } },
              ...(['az', 'de', 'en', 'ru'] as const).map((l) => ({ title: { path: `$.${l}`, string_contains: q.search } })),
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true, title: true, city: true, status: true, companyId: true, company: { select: { name: true } },
      ...(q.userId ? { applications: { where: { userId: q.userId }, select: { status: true }, take: 1 } } : {}),
    },
  });
  const items = rows
    .map(({ applications, ...v }: (typeof rows)[number] & { applications?: { status: string }[] }) => ({ ...v, ...(q.userId ? { applicationStatus: applications?.[0]?.status ?? null } : {}) }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  res.json({ items, total: items.length });
});

adminVacanciesRouter.get('/:id', async (req, res) => {
  const vacancy = await prisma.vacancy.findUnique({
    where: { id: req.params.id },
    include: {
      company: { select: { id: true, name: true, status: true } },
      visaCategory: { select: { id: true, slug: true, title: true, visaLabel: true, germanLevel: true } },
      applications: {
        orderBy: [{ matchScore: 'desc' }, { createdAt: 'asc' }],
        include: {
          user: {
            select: {
              id: true, firstName: true, lastName: true, email: true, phone: true, profession: true, experienceYears: true,
              germanLevel: true, education: true, drivingLicence: true, recognitionStatus: true, city: true, emailVerifiedAt: true,
            },
          },
        },
      },
    },
  });
  if (!vacancy) throw notFound('VACANCY_NOT_FOUND');
  res.json({
    vacancy: {
      ...vacancy,
      applications: vacancy.applications.map((a) => ({ ...a, match: matchCandidate(a.user, vacancy) })),
    },
  });
});

adminVacanciesRouter.post('/', async (req, res) => {
  const body = parse(staffVacancyInput, req.body);
  await checkRefs(body);
  if (body.slug && (await prisma.vacancy.count({ where: { slug: body.slug } }))) throw conflict('SLUG_TAKEN');
  const title = fillL10n(body.title);
  const vacancy = await prisma.vacancy.create({
    data: {
      ...(vacancyData(body) as object),
      title,
      description: fillL10n(body.description),
      slug: body.slug ?? (await uniqueSlug(title, body.city)),
      companyId: body.companyId ?? null,
      visaCategoryId: body.visaCategoryId ?? null,
      status: body.publish ? 'OPEN' : 'DRAFT',
      publishedAt: body.publish ? new Date() : null,
    } as never,
  });
  await audit(req, 'VACANCY_CREATED', `vacancy:${vacancy.id}`, { companyId: vacancy.companyId, status: vacancy.status });
  if (vacancy.status === 'OPEN') await emitWebhook('vacancy.published', { id: vacancy.id, slug: vacancy.slug, publishedAt: vacancy.publishedAt?.toISOString() ?? null }, vacancy.companyId);
  res.status(201).json({ vacancy });
});

adminVacanciesRouter.patch('/:id', async (req, res) => {
  const body = parse(staffVacancyPatch, req.body);
  const before = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
  if (!before) throw notFound('VACANCY_NOT_FOUND');
  await checkRefs(body);
  if (body.slug && body.slug !== before.slug && (await prisma.vacancy.count({ where: { slug: body.slug } }))) throw conflict('SLUG_TAKEN');
  const min = body.salaryMin !== undefined ? body.salaryMin : before.salaryMin;
  const max = body.salaryMax !== undefined ? body.salaryMax : before.salaryMax;
  if (min != null && max != null && min > max) throw badRequest('SALARY_RANGE');
  const vacancy = await prisma.vacancy.update({
    where: { id: before.id },
    data: {
      ...vacancyData(body),
      ...(body.slug ? { slug: body.slug } : {}),
      ...(body.companyId !== undefined ? { companyId: body.companyId } : {}),
      ...(body.visaCategoryId !== undefined ? { visaCategoryId: body.visaCategoryId } : {}),
    },
  });
  await audit(req, 'VACANCY_UPDATED', `vacancy:${vacancy.id}`, { fields: Object.keys(body) });
  res.json({ vacancy });
});

/** Publish: DRAFT / PENDING / CLOSED → OPEN. Keeps the first publication date. */
adminVacanciesRouter.post('/:id/approve', async (req, res) => {
  const v = await prisma.vacancy.findUnique({ where: { id: req.params.id }, include: { company: { select: { status: true } } } });
  if (!v) throw notFound('VACANCY_NOT_FOUND');
  if (v.status === 'OPEN') throw conflict('INVALID_TRANSITION');
  if (v.company && v.company.status !== 'ACTIVE') throw conflict('COMPANY_NOT_ACTIVE');
  if (v.closesAt && v.closesAt <= new Date()) throw conflict('CLOSING_DATE_PASSED');
  const wasPending = v.status === 'PENDING';
  const vacancy = await prisma.vacancy.update({ where: { id: v.id }, data: { status: 'OPEN', publishedAt: v.publishedAt ?? new Date() } });
  if (wasPending) await notifyVacancyReviewed(vacancy, true);
  await emitWebhook('vacancy.published', { id: vacancy.id, slug: vacancy.slug, publishedAt: vacancy.publishedAt?.toISOString() ?? null }, vacancy.companyId);
  await audit(req, 'VACANCY_APPROVED', `vacancy:${v.id}`, { from: v.status });
  res.json({ vacancy });
});

/** Send a submitted vacancy back to the employer (DRAFT) with a reason. */
adminVacanciesRouter.post('/:id/reject', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(1000) }), req.body);
  const v = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
  if (!v) throw notFound('VACANCY_NOT_FOUND');
  if (v.status !== 'PENDING') throw conflict('INVALID_TRANSITION');
  const vacancy = await prisma.vacancy.update({ where: { id: v.id }, data: { status: 'DRAFT' } });
  await notifyVacancyReviewed(vacancy, false, reason);
  await audit(req, 'VACANCY_REJECTED', `vacancy:${v.id}`, { reason });
  res.json({ vacancy });
});

adminVacanciesRouter.post('/:id/close', async (req, res) => {
  const v = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
  if (!v) throw notFound('VACANCY_NOT_FOUND');
  if (v.status === 'CLOSED') throw conflict('INVALID_TRANSITION');
  const vacancy = await prisma.vacancy.update({ where: { id: v.id }, data: { status: 'CLOSED' } });
  await audit(req, 'VACANCY_CLOSED', `vacancy:${v.id}`, { from: v.status });
  res.json({ vacancy });
});

adminVacanciesRouter.delete('/:id', async (req, res) => {
  const v = await prisma.vacancy.findUnique({ where: { id: req.params.id }, include: { _count: { select: { applications: true, cases: true } } } });
  if (!v) throw notFound('VACANCY_NOT_FOUND');
  if (v._count.applications || v._count.cases) throw conflict('VACANCY_IN_USE');
  await prisma.vacancy.delete({ where: { id: v.id } });
  await audit(req, 'VACANCY_DELETED', `vacancy:${v.id}`, { slug: v.slug });
  res.json({ ok: true });
});

/** Best-matching candidates who have not applied yet (top 30). */
adminVacanciesRouter.get('/:id/suggestions', async (req, res) => {
  const v = await prisma.vacancy.findUnique({
    where: { id: req.params.id },
    include: { visaCategory: { select: { visaLabel: true, germanLevel: true } }, applications: { select: { userId: true } } },
  });
  if (!v) throw notFound('VACANCY_NOT_FOUND');
  const applied = new Set(v.applications.map((a) => a.userId));
  const candidates = await prisma.user.findMany({
    where: { role: 'CLIENT', isActive: true },
    select: { id: true, firstName: true, lastName: true, profession: true, experienceYears: true, germanLevel: true, education: true, drivingLicence: true, recognitionStatus: true, city: true },
    take: 5000,
  });
  const ranked = candidates
    .filter((c) => !applied.has(c.id))
    .map((c) => ({ ...c, match: matchCandidate(c, v) }))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 30);
  res.json({ items: ranked });
});
