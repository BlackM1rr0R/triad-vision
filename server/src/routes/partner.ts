import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ApplicationStatus, Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, limiter, notFound, parse } from '../lib/http.js';
import { apiKeyAuth, requireScope } from '../lib/ops/apiKeys.js';
import { buildOpenApi } from '../lib/ops/openapi.js';
import { emitWebhook } from '../lib/ops/webhooks.js';
import { anonymisedName, anonymisedProfile, anonymisedProfileSelect, employerVisibleWhere } from '../lib/vacancies.js';
import { notifyApplicationStatus } from '../lib/jobsNotifications.js';
import { notifyStaff } from '../lib/notifications.js';

/**
 * Partner API — mounted at /api/v1. API-key auth only (`Authorization: Bearer tv_…`), every key is
 * rate-limited on its own (600/min) and sees at most its company's data.
 */
export const partnerRouter = Router();

let openapiCache: { at: number; doc: object } | null = null;
partnerRouter.get('/openapi.json', (_req, res) => {
  if (!openapiCache || Date.now() - openapiCache.at > 60_000) openapiCache = { at: Date.now(), doc: buildOpenApi() };
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(openapiCache.doc);
});

partnerRouter.use(apiKeyAuth);
partnerRouter.use(limiter({ windowMs: 60 * 1000, limit: 600, keyGenerator: (req) => `key:${req.apiKey?.id ?? 'anon'}`, skip: () => config.isTest }));

/** Company filter for a key: bound keys see one company, platform keys see everything. */
const companyWhere = (req: Request) => (req.apiKey!.companyId ? { companyId: req.apiKey!.companyId } : {});
const vacancyCompanyWhere = (req: Request): Prisma.VacancyWhereInput => (req.apiKey!.companyId ? { companyId: req.apiKey!.companyId } : {});

const applicationSelect = {
  id: true,
  vacancyId: true,
  status: true,
  matchScore: true,
  companyNote: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, ...anonymisedProfileSelect } },
  vacancy: { select: { companyId: true } },
} satisfies Prisma.VacancyApplicationSelect;

type AppRow = Prisma.VacancyApplicationGetPayload<{ select: typeof applicationSelect }>;

const applicationView = (a: AppRow) => ({
  id: a.id,
  vacancyId: a.vacancyId,
  status: a.status,
  matchScore: a.matchScore,
  companyNote: a.companyNote,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  candidate: { id: a.user.id, ...anonymisedProfile(a.user) },
});

// ─── Vacancies ──────────────────────────────────────────────────────────

partnerRouter.get('/vacancies', requireScope('vacancies:read'), async (req, res) => {
  const q = parse(z.object({ status: z.enum(['DRAFT', 'PENDING', 'OPEN', 'CLOSED']).optional() }), req.query);
  const items = await prisma.vacancy.findMany({
    where: { ...vacancyCompanyWhere(req), ...(q.status ? { status: q.status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true, slug: true, title: true, status: true, city: true, profession: true, sector: true, positions: true, employmentType: true,
      salaryMin: true, salaryMax: true, publishedAt: true, closesAt: true, createdAt: true, updatedAt: true, companyId: true,
    },
  });
  const counts = items.length
    ? await prisma.vacancyApplication.groupBy({ by: ['vacancyId', 'status'], where: { vacancyId: { in: items.map((v) => v.id) }, ...employerVisibleWhere }, _count: { _all: true } })
    : [];
  res.json({
    items: items.map((v) => ({ ...v, applications: Object.fromEntries(counts.filter((c) => c.vacancyId === v.id).map((c) => [c.status, c._count._all])) })),
  });
});

partnerRouter.get('/vacancies/:id/applications', requireScope('applications:read'), async (req, res) => {
  const v = await prisma.vacancy.findFirst({ where: { id: String(req.params.id), ...vacancyCompanyWhere(req) }, select: { id: true } });
  if (!v) throw notFound('VACANCY_NOT_FOUND');
  const items = await prisma.vacancyApplication.findMany({
    where: { vacancyId: v.id, ...employerVisibleWhere },
    orderBy: { updatedAt: 'desc' },
    select: applicationSelect,
    take: 1000,
  });
  res.json({ items: items.map(applicationView) });
});

// ─── Applications ───────────────────────────────────────────────────────

const loadApplication = async (req: Request) => {
  const a = await prisma.vacancyApplication.findFirst({
    where: { id: String(req.params.id), vacancy: vacancyCompanyWhere(req), ...employerVisibleWhere },
    select: applicationSelect,
  });
  if (!a) throw notFound('APPLICATION_NOT_FOUND');
  return a;
};

partnerRouter.get('/applications/:id', requireScope('applications:read'), async (req, res) => {
  res.json({ application: applicationView(await loadApplication(req)) });
});

const TRANSITIONS: Record<'INTERVIEW' | 'ACCEPTED' | 'REJECTED', ApplicationStatus[]> = {
  INTERVIEW: ['PROPOSED'],
  ACCEPTED: ['PROPOSED', 'INTERVIEW'],
  REJECTED: ['PROPOSED', 'INTERVIEW'],
};

partnerRouter.patch('/applications/:id', requireScope('applications:write'), async (req, res) => {
  const body = parse(z.object({ status: z.enum(['INTERVIEW', 'ACCEPTED', 'REJECTED']), note: z.string().trim().max(2000).optional() }), req.body);
  const a = await loadApplication(req);
  const from = TRANSITIONS[body.status];
  const { count } = await prisma.vacancyApplication.updateMany({
    where: { id: a.id, status: { in: from } },
    data: { status: body.status, companyNote: body.note ?? a.companyNote ?? '' },
  });
  if (!count) throw new HttpError(409, 'INVALID_TRANSITION');
  const updated = await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: a.id }, select: applicationSelect });
  const vacancy = await prisma.vacancy.findUniqueOrThrow({ where: { id: a.vacancyId }, select: { id: true, title: true, companyId: true, company: { select: { name: true } } } });
  await notifyApplicationStatus(a.user.id, vacancy, body.status).catch((e) => console.error('[partner] notify failed', e));
  await notifyStaff(
    `API qərarı: ${vacancy.company?.name ?? req.apiKey!.name}`.slice(0, 180),
    `${vacancy.company?.name ?? req.apiKey!.name} API vasitəsilə "${(vacancy.title as Record<string, string>).az}" vakansiyası üzrə müraciətin statusunu ${body.status} etdi.${body.note ? `\n\nQeyd: ${body.note}` : ''}`,
    { link: `/admin/candidates?id=${a.user.id}`, type: 'EMPLOYER_DECISION' },
  ).catch(() => undefined);
  await emitWebhook('application.status_changed', { id: a.id, vacancyId: a.vacancyId, from: a.status, to: body.status, by: 'api' }, vacancy.companyId);
  res.json({ application: applicationView(updated) });
});

// ─── Candidates ─────────────────────────────────────────────────────────

partnerRouter.get('/candidates/:id', requireScope('candidates:read'), async (req, res) => {
  // Only someone who applied to this company's vacancies and was presented to it.
  const u = await prisma.user.findFirst({
    where: { id: String(req.params.id), role: 'CLIENT', applications: { some: { vacancy: vacancyCompanyWhere(req), ...employerVisibleWhere } } },
    select: { id: true, ...anonymisedProfileSelect, applications: { where: { vacancy: vacancyCompanyWhere(req), ...employerVisibleWhere }, select: { id: true, vacancyId: true, status: true, updatedAt: true } } },
  });
  if (!u) throw notFound('CANDIDATE_NOT_FOUND');
  const { applications, id, ...profile } = u;
  res.json({ candidate: { id, ...anonymisedProfile(profile), applications } });
});

// ─── Cases ──────────────────────────────────────────────────────────────

partnerRouter.get('/cases', requireScope('cases:read'), async (req, res) => {
  const items = await prisma.case.findMany({
    where: { ...(req.apiKey!.companyId ? { companyId: req.apiKey!.companyId } : { companyId: { not: null } }) },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true, number: true, status: true, profession: true, vacancyId: true, companyId: true, createdAt: true, updatedAt: true,
      appointmentAt: true, decisionAt: true, visaValidFrom: true, visaValidTo: true, closedAt: true,
      client: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  res.json({
    items: items.map(({ client, ...c }) => ({ ...c, candidate: { id: client.id, name: anonymisedName(client) } })),
  });
});

// ─── Events (polling alternative to webhooks) ──────────────────────────

partnerRouter.get('/events', requireScope('events:read'), async (req, res) => {
  const q = parse(z.object({ since: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
  const since = q.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const cw = companyWhere(req);
  const [apps, interviews, vacancies, cases] = await Promise.all([
    prisma.vacancyApplication.findMany({
      where: { vacancy: vacancyCompanyWhere(req), ...employerVisibleWhere, updatedAt: { gt: since } },
      orderBy: { updatedAt: 'desc' },
      take: q.limit,
      select: { id: true, vacancyId: true, status: true, createdAt: true, updatedAt: true },
    }),
    prisma.interview.findMany({
      where: { ...(req.apiKey!.companyId ? { companyId: req.apiKey!.companyId } : { companyId: { not: null } }), updatedAt: { gt: since } },
      orderBy: { updatedAt: 'desc' },
      take: q.limit,
      select: { id: true, status: true, startsAt: true, endsAt: true, applicationId: true, createdAt: true, updatedAt: true, companyId: true },
    }),
    prisma.vacancy.findMany({
      where: { ...vacancyCompanyWhere(req), publishedAt: { gt: since } },
      orderBy: { publishedAt: 'desc' },
      take: q.limit,
      select: { id: true, slug: true, status: true, publishedAt: true },
    }),
    prisma.case.findMany({
      where: { ...(cw.companyId ? cw : { companyId: { not: null } }), updatedAt: { gt: since } },
      orderBy: { updatedAt: 'desc' },
      take: q.limit,
      select: { id: true, number: true, status: true, decisionAt: true, createdAt: true, updatedAt: true },
    }),
  ]);
  const items = [
    ...apps.map((a) => ({ id: `application-${a.id}-${a.updatedAt.getTime()}`, event: a.createdAt.getTime() === a.updatedAt.getTime() ? 'application.created' : 'application.status_changed', at: a.updatedAt, data: a })),
    ...interviews.map((i) => ({ id: `interview-${i.id}-${i.updatedAt.getTime()}`, event: i.createdAt.getTime() === i.updatedAt.getTime() ? 'interview.scheduled' : 'interview.updated', at: i.updatedAt, data: i })),
    ...vacancies.map((v) => ({ id: `vacancy-${v.id}-${v.publishedAt!.getTime()}`, event: 'vacancy.published', at: v.publishedAt!, data: v })),
    ...cases.map((c) => ({
      id: `case-${c.id}-${c.updatedAt.getTime()}`,
      event: c.createdAt.getTime() === c.updatedAt.getTime() ? 'case.created' : c.decisionAt && ['APPROVED', 'REJECTED'].includes(c.status) ? 'case.decided' : 'case.status_changed',
      at: c.updatedAt,
      data: c,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, q.limit);
  res.json({ items, since });
});
