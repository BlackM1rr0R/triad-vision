import { Router, type Request } from 'express';
import { z } from 'zod';
import type { CandidateRequest, Company } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { notifyStaff } from '../lib/notifications.js';
import { anonymisedProfile, anonymisedProfileSelect, employerVisibleWhere } from '../lib/vacancies.js';
import { checkVisaCategory, employerRequestView, progressFor, requestInput, requestPatch, syncStatuses } from '../lib/requests/shared.js';

// Employer bulk candidate requests — mounted at /api/company/requests (COMPANY users of an ACTIVE company).
// Mounted before the main company router, so the company guards are applied here.
export const companyRequestsRouter = Router();
companyRequestsRouter.use(requireRole('COMPANY'));
companyRequestsRouter.use(async (req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: true } });
  if (!u?.company) return next(forbidden('NO_COMPANY'));
  if (u.company.status === 'SUSPENDED') return next(forbidden('COMPANY_SUSPENDED'));
  if (u.company.status !== 'ACTIVE') return next(forbidden('COMPANY_NOT_APPROVED'));
  res.locals.company = u.company;
  next();
});

const co = (res: { locals: Record<string, unknown> }) => res.locals.company as Company;

const visaMap = async (ids: (string | null)[]) => {
  const list = [...new Set(ids.filter((v): v is string => !!v))];
  const rows = list.length ? await prisma.visaCategory.findMany({ where: { id: { in: list } }, select: { id: true, title: true, visaLabel: true } }) : [];
  return new Map(rows.map((v) => [v.id, v]));
};

const ownRequest = async (companyId: string, id: string) => {
  const r = await prisma.candidateRequest.findUnique({ where: { id } });
  if (!r || r.companyId !== companyId) throw notFound('REQUEST_NOT_FOUND');
  return r;
};

const view = async (r: CandidateRequest) => {
  const [synced] = await syncStatuses([r]);
  const progress = (await progressFor([synced])).get(synced.id);
  const visa = (await visaMap([synced.visaCategoryId])).get(synced.visaCategoryId ?? '');
  return employerRequestView({ ...synced, visaCategory: visa ?? null }, progress);
};

/** Visa categories for the request form. */
companyRequestsRouter.get('/options', async (_req, res) => {
  const visaCategories = await prisma.visaCategory.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, visaLabel: true } });
  res.json({ visaCategories });
});

companyRequestsRouter.get('/', async (_req, res) => {
  const rows = await prisma.candidateRequest.findMany({ where: { companyId: co(res).id }, orderBy: { createdAt: 'desc' }, take: 500 });
  const progress = await progressFor(rows);
  const synced = await syncStatuses(rows, progress);
  const visas = await visaMap(synced.map((r) => r.visaCategoryId));
  res.json({ items: synced.map((r) => employerRequestView({ ...r, visaCategory: visas.get(r.visaCategoryId ?? '') ?? null }, progress.get(r.id))) });
});

companyRequestsRouter.post('/', async (req, res) => {
  const body = parse(requestInput, req.body);
  if (!(await checkVisaCategory(body.visaCategoryId))) throw badRequest('INVALID_VISA_CATEGORY');
  const company = co(res);
  const r = await prisma.candidateRequest.create({
    data: {
      companyId: company.id,
      createdById: req.user!.id,
      title: body.title,
      profession: body.profession,
      quantity: body.quantity,
      visaCategoryId: body.visaCategoryId ?? null,
      germanLevel: body.germanLevel ?? null,
      drivingLicence: body.drivingLicence ?? null,
      minExperience: body.minExperience ?? null,
      city: body.city ?? null,
      startDate: body.startDate ?? null,
      salaryMin: body.salaryMin ?? null,
      salaryMax: body.salaryMax ?? null,
      notes: body.notes ?? null,
    },
  });
  await notifyStaff(
    `Yeni namizəd sorğusu: ${company.name}`.slice(0, 180),
    `${company.name} ${r.quantity} nəfər "${r.profession}" axtarır: "${r.title}".${r.city ? `\nŞəhər: ${r.city}` : ''}${r.germanLevel ? `\nAlman dili: ${r.germanLevel}` : ''}${r.drivingLicence ? `\nSürücülük vəsiqəsi: ${r.drivingLicence}` : ''}`,
    { link: `/admin/candidate-requests/${r.id}`, type: 'CANDIDATE_REQUEST' },
  );
  await audit(req, 'CANDIDATE_REQUEST_CREATED', `candidateRequest:${r.id}`, { companyId: company.id, quantity: r.quantity });
  res.status(201).json({ request: await view(r) });
});

companyRequestsRouter.get('/:id', async (req, res) => {
  const r = await ownRequest(co(res).id, String(req.params.id));
  const request = await view(r);
  const candidates = r.vacancyId
    ? await prisma.vacancyApplication.findMany({
        where: { vacancyId: r.vacancyId, ...employerVisibleWhere },
        orderBy: [{ matchScore: 'desc' }, { updatedAt: 'desc' }],
        select: { id: true, status: true, matchScore: true, companyNote: true, updatedAt: true, user: { select: anonymisedProfileSelect } },
      })
    : [];
  res.json({ request, candidates: candidates.map(({ user, ...a }) => ({ ...a, candidate: anonymisedProfile(user) })) });
});

companyRequestsRouter.patch('/:id', async (req: Request, res) => {
  const r = await ownRequest(co(res).id, String(req.params.id));
  if (r.status !== 'OPEN') throw conflict('REQUEST_NOT_EDITABLE');
  const body = parse(requestPatch, req.body);
  if (body.visaCategoryId !== undefined && !(await checkVisaCategory(body.visaCategoryId))) throw badRequest('INVALID_VISA_CATEGORY');
  const min = body.salaryMin !== undefined ? body.salaryMin : r.salaryMin;
  const max = body.salaryMax !== undefined ? body.salaryMax : r.salaryMax;
  if (min != null && max != null && min > max) throw badRequest('SALARY_RANGE');
  const { count } = await prisma.candidateRequest.updateMany({ where: { id: r.id, status: 'OPEN' }, data: body });
  if (!count) throw conflict('REQUEST_NOT_EDITABLE');
  await audit(req, 'CANDIDATE_REQUEST_UPDATED', `candidateRequest:${r.id}`, { fields: Object.keys(body) });
  res.json({ request: await view(await prisma.candidateRequest.findUniqueOrThrow({ where: { id: r.id } })) });
});

companyRequestsRouter.post('/:id/cancel', async (req, res) => {
  const body = parse(z.object({ reason: z.string().trim().max(1000).optional() }), req.body ?? {});
  const company = co(res);
  const r = await ownRequest(company.id, String(req.params.id));
  const { count } = await prisma.candidateRequest.updateMany({ where: { id: r.id, status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status: 'CANCELLED' } });
  if (!count) throw conflict('INVALID_TRANSITION');
  await notifyStaff(
    `Namizəd sorğusu ləğv edildi: ${company.name}`.slice(0, 180),
    `${company.name} "${r.title}" sorğusunu ləğv etdi.${body.reason ? `\n\nSəbəb: ${body.reason}` : ''}`,
    { link: `/admin/candidate-requests/${r.id}`, type: 'CANDIDATE_REQUEST' },
  );
  await audit(req, 'CANDIDATE_REQUEST_CANCELLED', `candidateRequest:${r.id}`, body.reason ? { reason: body.reason } : undefined);
  res.json({ request: await view(await prisma.candidateRequest.findUniqueOrThrow({ where: { id: r.id } })) });
});
