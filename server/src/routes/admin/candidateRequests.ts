import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { progressFor, REQUEST_STATUSES, syncStatuses } from '../../lib/requests/shared.js';
import { ensureVacancy, proposeCandidates, suggestCandidates } from '../../lib/requests/staff.js';
import { votesByApplication } from '../../lib/employerVotes.js';

// Admin: employer bulk candidate requests — mounted at /api/admin/candidate-requests (STAFF+).
export const adminCandidateRequestsRouter = Router();

const PAGE_SIZE = 25;

adminCandidateRequestsRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(REQUEST_STATUSES).optional(),
      companyId: z.string().max(40).optional(),
      search: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }),
    req.query,
  );
  // Bring automatic transitions up to date before filtering by status.
  const live = await prisma.candidateRequest.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, vacancyId: { not: null } }, take: 2000 });
  if (live.length) await syncStatuses(live);

  const where: Prisma.CandidateRequestWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.companyId ? { companyId: q.companyId } : {}),
    ...(q.search ? { OR: [{ title: { contains: q.search } }, { profession: { contains: q.search } }, { company: { name: { contains: q.search } } }] } : {}),
  };
  const [rows, total, counts, companies] = await Promise.all([
    prisma.candidateRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { company: { select: { id: true, name: true, status: true } }, createdBy: { select: { firstName: true, lastName: true } } },
    }),
    prisma.candidateRequest.count({ where }),
    prisma.candidateRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.company.findMany({ where: { candidateRequests: { some: {} } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const progress = await progressFor(rows);
  res.json({
    items: rows.map((r) => ({ ...r, progress: progress.get(r.id) })),
    total,
    page: q.page,
    pageSize: PAGE_SIZE,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    companies,
  });
});

const load = async (id: string) => {
  const r = await prisma.candidateRequest.findUnique({ where: { id } });
  if (!r) throw notFound('REQUEST_NOT_FOUND');
  const [synced] = await syncStatuses([r]);
  return synced;
};

adminCandidateRequestsRouter.get('/:id', async (req, res) => {
  const r = await load(String(req.params.id));
  const [company, createdBy, visaCategory, vacancy, applications, suggestions, progress] = await Promise.all([
    prisma.company.findUnique({ where: { id: r.companyId }, select: { id: true, name: true, status: true, city: true, contactName: true, email: true, phone: true } }),
    r.createdById ? prisma.user.findUnique({ where: { id: r.createdById }, select: { id: true, firstName: true, lastName: true, email: true } }) : null,
    r.visaCategoryId ? prisma.visaCategory.findUnique({ where: { id: r.visaCategoryId }, select: { id: true, title: true, visaLabel: true, germanLevel: true } }) : null,
    r.vacancyId ? prisma.vacancy.findUnique({ where: { id: r.vacancyId }, select: { id: true, slug: true, title: true, status: true, positions: true } }) : null,
    r.vacancyId
      ? prisma.vacancyApplication.findMany({
          where: { vacancyId: r.vacancyId },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, status: true, matchScore: true, companyNote: true, updatedAt: true, user: { select: { id: true, firstName: true, lastName: true, profession: true, germanLevel: true } } },
        })
      : [],
    suggestCandidates(r),
    progressFor([r]),
  ]);
  const votes = await votesByApplication(applications.map((a) => a.id)); // employer team votes (company portal)
  res.json({
    request: { ...r, company, createdBy, visaCategory, vacancy, progress: progress.get(r.id) },
    applications: applications.map((a) => ({ ...a, employerVotes: votes.get(a.id) ?? [] })),
    suggestions,
  });
});

adminCandidateRequestsRouter.post('/:id/vacancy', async (req, res) => {
  const body = parse(z.object({ publish: z.boolean().default(true) }), req.body ?? {});
  const r = await load(String(req.params.id));
  if (r.status === 'CANCELLED') throw conflict('REQUEST_CANCELLED');
  const { vacancy, created } = await ensureVacancy(req, r, body.publish);
  if (created) await audit(req, 'CANDIDATE_REQUEST_VACANCY', `candidateRequest:${r.id}`, { vacancyId: vacancy.id });
  res.status(created ? 201 : 200).json({ vacancy, created });
});

adminCandidateRequestsRouter.post('/:id/propose', async (req, res) => {
  const body = parse(z.object({ userIds: z.array(z.string().min(1).max(40)).min(1).max(100) }), req.body);
  const r = await load(String(req.params.id));
  if (r.status === 'CANCELLED' || r.status === 'FILLED') throw conflict('REQUEST_CLOSED');
  // Proposals go through the request's vacancy; it is created on demand.
  const { vacancy } = await ensureVacancy(req, r, true);
  const result = await proposeCandidates(req, vacancy.id, [...new Set(body.userIds)]);
  if (!result.proposed.length && result.skipped.every((s) => s.reason === 'NOT_A_CANDIDATE')) throw badRequest('NO_CANDIDATES');
  const fresh = await prisma.candidateRequest.findUniqueOrThrow({ where: { id: r.id } });
  const [synced] = await syncStatuses([fresh]);
  await audit(req, 'CANDIDATE_REQUEST_PROPOSED', `candidateRequest:${r.id}`, { vacancyId: vacancy.id, proposed: result.proposed.length, skipped: result.skipped.length });
  res.json({ ...result, status: synced.status, vacancyId: vacancy.id });
});

adminCandidateRequestsRouter.patch('/:id', async (req, res) => {
  const body = parse(z.object({ status: z.enum(REQUEST_STATUSES).optional(), staffNote: z.string().trim().max(5000).nullable().optional() }), req.body);
  const r = await load(String(req.params.id));
  const data: Prisma.CandidateRequestUpdateInput = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.staffNote !== undefined) data.staffNote = body.staffNote || null;
  const updated = await prisma.candidateRequest.update({ where: { id: r.id }, data });
  await audit(req, 'CANDIDATE_REQUEST_UPDATED', `candidateRequest:${r.id}`, { ...(body.status ? { from: r.status, to: body.status } : {}), fields: Object.keys(body) });
  res.json({ request: updated });
});
