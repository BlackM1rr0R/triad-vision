import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireVerifiedEmail } from '../middleware/verified.js';
import { conflict, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { emitWebhook } from '../lib/ops/webhooks.js';
import { GERMAN_LEVELS, germanRank } from '../lib/matching.js';
import {
  EMPLOYMENT_TYPES,
  SECTORS,
  isOpen,
  matchFor,
  openVacancyWhere,
  publicVacancy,
  visaForMatch,
} from '../lib/vacancies.js';

// Public vacancy board + candidate applications — mounted at /api/vacancies
export const vacanciesRouter = Router();

const publicLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });
const applyLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30 });

const publicInclude = {
  company: { select: { name: true } },
  visaCategory: { select: { slug: true, title: true, visaLabel: true, germanLevel: true } },
} as const;

/** Only candidates use the board's personal features; employers and staff have their own tools. */
export const requireCandidate: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'CLIENT') return next(forbidden('CANDIDATES_ONLY'));
  next();
};

// ─── Candidate: my applications (declared before /:slug) ───────────────

vacanciesRouter.get('/my/applications', requireAuth, requireCandidate, async (req, res) => {
  const items = await prisma.vacancyApplication.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      matchScore: true,
      message: true,
      createdAt: true,
      updatedAt: true,
      vacancy: { select: { id: true, slug: true, title: true, city: true, status: true, closesAt: true, employmentType: true, salaryMin: true, salaryMax: true } },
    },
  });
  res.json({
    items: items.map((a) => ({
      ...a,
      vacancy: { ...a.vacancy, isOpen: isOpen(a.vacancy), status: undefined, closesAt: undefined },
    })),
  });
});

vacanciesRouter.post('/my/applications/:id/withdraw', requireAuth, requireCandidate, async (req, res) => {
  const app = await prisma.vacancyApplication.findUnique({
    where: { id: String(req.params.id) },
    include: { vacancy: { select: { title: true, companyId: true } } },
  });
  if (!app || app.userId !== req.user!.id) throw notFound('APPLICATION_NOT_FOUND');
  const { count } = await prisma.vacancyApplication.updateMany({
    where: { id: app.id, status: { in: ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW'] } },
    data: { status: 'WITHDRAWN' },
  });
  if (!count) throw conflict('CANNOT_WITHDRAW');
  await emitWebhook('application.status_changed', { id: app.id, vacancyId: app.vacancyId, from: app.status, to: 'WITHDRAWN', by: 'candidate' }, app.vacancy.companyId);
  const title = (app.vacancy.title as Record<string, string>).az ?? '';
  await notifyStaff(
    `Namizəd müraciəti geri götürdü`,
    `${req.user!.firstName} ${req.user!.lastName} "${title}" vakansiyasına müraciətini geri götürdü.`,
    { link: `/admin/vacancies?id=${app.vacancyId}`, type: 'APPLICATION_WITHDRAWN' },
  );
  res.json({ ok: true });
});

// ─── Public board ──────────────────────────────────────────────────────

const SORTS = ['newest', 'salary', 'closing'] as const;

vacanciesRouter.get('/', publicLimiter, async (req, res) => {
  const q = parse(
    z.object({
      search: z.string().trim().max(100).optional(),
      sector: z.enum(SECTORS).optional(),
      city: z.string().trim().max(80).optional(),
      // "I speak B1": vacancies whose minimum is at most B1.
      germanLevel: z.enum(GERMAN_LEVELS).optional(),
      employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
      salaryMin: z.coerce.number().int().min(0).max(100_000).optional(),
      sort: z.enum(SORTS).default('newest'),
      page: z.coerce.number().int().min(1).max(500).default(1),
      pageSize: z.coerce.number().int().min(1).max(48).default(12),
    }),
    req.query,
  );
  const and: Prisma.VacancyWhereInput[] = [openVacancyWhere()];
  if (q.sector) and.push({ sector: q.sector });
  if (q.city) and.push({ city: { contains: q.city } });
  if (q.employmentType) and.push({ employmentType: q.employmentType });
  if (q.salaryMin !== undefined) and.push({ OR: [{ salaryMax: { gte: q.salaryMin } }, { salaryMax: null, salaryMin: { gte: q.salaryMin } }] });
  if (q.germanLevel) {
    const allowed = GERMAN_LEVELS.filter((l) => germanRank(l) <= germanRank(q.germanLevel));
    and.push({ OR: [{ germanLevel: null }, { germanLevel: { in: [...allowed] } }] });
  }
  if (q.search) {
    // JSON title/description are searched as text (MySQL compares the serialised JSON).
    and.push({
      OR: [
        { profession: { contains: q.search } },
        { city: { contains: q.search } },
        ...(['az', 'de', 'en', 'ru'] as const).map((l) => ({ title: { path: `$.${l}`, string_contains: q.search } })),
        { showCompany: true, company: { name: { contains: q.search } } },
      ],
    });
  }
  const where: Prisma.VacancyWhereInput = { AND: and };
  const orderBy: Prisma.VacancyOrderByWithRelationInput[] =
    q.sort === 'salary'
      ? [{ salaryMax: { sort: 'desc', nulls: 'last' } }, { salaryMin: { sort: 'desc', nulls: 'last' } }, { publishedAt: 'desc' }]
      : q.sort === 'closing'
        ? [{ closesAt: { sort: 'asc', nulls: 'last' } }, { publishedAt: 'desc' }]
        : [{ publishedAt: 'desc' }, { createdAt: 'desc' }];

  const [items, total, sectors, cities] = await Promise.all([
    prisma.vacancy.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: publicInclude }),
    prisma.vacancy.count({ where }),
    prisma.vacancy.groupBy({ by: ['sector'], where: openVacancyWhere(), _count: { _all: true } }),
    prisma.vacancy.groupBy({ by: ['city'], where: openVacancyWhere(), _count: { _all: true }, orderBy: { _count: { city: 'desc' } }, take: 30 }),
  ]);
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({
    items: items.map(publicVacancy),
    total,
    page: q.page,
    pageSize: q.pageSize,
    facets: {
      sectors: sectors.filter((s) => s.sector).map((s) => ({ value: s.sector, count: s._count._all })),
      cities: cities.filter((c) => c.city).map((c) => ({ value: c.city, count: c._count._all })),
    },
  });
});

const loadOpen = async (slug: string) => {
  const v = await prisma.vacancy.findUnique({ where: { slug }, include: publicInclude });
  if (!v || !isOpen(v)) throw notFound('VACANCY_NOT_FOUND');
  return v;
};

vacanciesRouter.get('/:slug', publicLimiter, async (req, res) => {
  const v = await loadOpen(String(req.params.slug));
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({ vacancy: publicVacancy(v) });
});

/** The signed-in candidate's view of a vacancy: match score, gaps and their application (if any). */
vacanciesRouter.get('/:slug/me', requireAuth, requireCandidate, async (req, res) => {
  const v = await loadOpen(String(req.params.slug));
  const [user, application] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } }),
    prisma.vacancyApplication.findUnique({
      where: { vacancyId_userId: { vacancyId: v.id, userId: req.user!.id } },
      select: { id: true, status: true, createdAt: true },
    }),
  ]);
  res.json({ match: matchFor(user, v), application, emailVerified: !!user.emailVerifiedAt });
});

vacanciesRouter.post('/:slug/apply', applyLimiter, requireAuth, requireCandidate, requireVerifiedEmail, async (req, res) => {
  const body = parse(z.object({ message: z.string().trim().max(2000).optional() }), req.body ?? {});
  const v = await prisma.vacancy.findUnique({
    where: { slug: String(req.params.slug) },
    include: { visaCategory: visaForMatch },
  });
  if (!v || !isOpen(v)) throw notFound('VACANCY_NOT_FOUND');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const { score } = matchFor(user, v);
  const message = body.message || null;

  const existing = await prisma.vacancyApplication.findUnique({ where: { vacancyId_userId: { vacancyId: v.id, userId: user.id } } });
  let application;
  if (existing) {
    // A withdrawn application may be re-submitted; anything else is a duplicate.
    if (existing.status !== 'WITHDRAWN') throw conflict('ALREADY_APPLIED');
    application = await prisma.vacancyApplication.update({
      where: { id: existing.id },
      data: { status: 'NEW', matchScore: score, message, companyNote: null },
    });
  } else {
    try {
      application = await prisma.vacancyApplication.create({ data: { vacancyId: v.id, userId: user.id, matchScore: score, message } });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw conflict('ALREADY_APPLIED');
      throw err;
    }
  }
  await emitWebhook('application.created', { id: application.id, vacancyId: v.id, status: application.status, matchScore: application.matchScore, candidateId: user.id }, v.companyId);
  const title = (v.title as Record<string, string>).az ?? '';
  await notifyStaff(
    `Yeni vakansiya müraciəti: ${title}`.slice(0, 180),
    `${user.firstName} ${user.lastName} "${title}" vakansiyasına müraciət etdi.\n\nUyğunluq: ${score}%${message ? `\n\nMesaj: ${message}` : ''}`,
    { link: `/admin/vacancies?id=${v.id}`, type: 'VACANCY_APPLICATION' },
  );
  res.status(201).json({
    application: { id: application.id, status: application.status, matchScore: application.matchScore, createdAt: application.createdAt },
  });
});
