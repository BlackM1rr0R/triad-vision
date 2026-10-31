import { Router } from 'express';
import { z } from 'zod';
import type { ApplicationStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { createCase, FINAL_STATUSES } from '../../lib/caseFlow.js';
import { GERMAN_LEVELS, germanRank, licenceCovers, matchCandidate } from '../../lib/matching.js';
import { notifyApplicationStatus, notifyCandidateProposed } from '../../lib/jobsNotifications.js';
import { emitWebhook } from '../../lib/ops/webhooks.js';
import { sendStaffCv } from '../../lib/cv/access.js';
import { votesByApplication } from '../../lib/employerVotes.js';
import path from 'node:path';
import { applicationUploadsOf, isApplicationDocument } from '../../lib/applicationUploads.js';
import { vaultDir } from '../../lib/docCheck/index.js';

// Admin: candidates — mounted at /api/admin/candidates
export const adminCandidatesRouter = Router();

const EDUCATION = ['school', 'vocational', 'university'] as const;
const STAFF_STATUSES = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'] as const;

export const candidateSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  city: true,
  profession: true,
  experienceYears: true,
  germanLevel: true,
  education: true,
  drivingLicence: true,
  recognitionStatus: true,
  emailVerifiedAt: true,
  isActive: true,
  createdAt: true,
  cases: {
    where: { status: { notIn: FINAL_STATUSES } },
    select: { id: true, number: true, status: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
  _count: { select: { applications: true } },
} satisfies Prisma.UserSelect;

/** Upper bound of rows scored in memory when ranking by match. */
export const RANK_LIMIT = 3000;

/** The vacancy candidates are ranked against (match score), with what matchCandidate needs. */
export const loadRankVacancy = (vacancyId: string) =>
  prisma.vacancy.findUnique({
    where: { id: vacancyId },
    include: { visaCategory: { select: { visaLabel: true, germanLevel: true } }, applications: { select: { userId: true, status: true, id: true } } },
  });

/** Filters of the candidates list; shared with the bulk actions ("all matching", routes/admin/bulk.ts). */
export const candidateListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  profession: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  // minimum German level the candidate must have
  germanLevel: z.enum(GERMAN_LEVELS).optional(),
  education: z.enum(EDUCATION).optional(),
  licence: z.string().trim().max(20).optional(),
  minExperience: z.coerce.number().int().min(0).max(50).optional(),
  verified: z.enum(['true', 'false']).optional(),
  hasCase: z.enum(['true', 'false']).optional(),
  vacancyId: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

/** SQL part of the candidate filters (the licence coverage is checked in memory with licenceCovers). */
export const candidateListWhere = (q: z.infer<typeof candidateListQuery>): Prisma.UserWhereInput => {
  const and: Prisma.UserWhereInput[] = [{ role: 'CLIENT' }];
  if (q.search) {
    and.push({
      OR: [
        { firstName: { contains: q.search } },
        { lastName: { contains: q.search } },
        { email: { contains: q.search } },
        { phone: { contains: q.search } },
        { profession: { contains: q.search } },
      ],
    });
  }
  if (q.profession) and.push({ profession: { contains: q.profession } });
  if (q.city) and.push({ city: { contains: q.city } });
  if (q.education) and.push({ education: q.education });
  if (q.minExperience !== undefined) and.push({ experienceYears: { gte: q.minExperience } });
  if (q.germanLevel) and.push({ germanLevel: { in: GERMAN_LEVELS.filter((l) => germanRank(l) >= germanRank(q.germanLevel)) } });
  if (q.verified) and.push({ emailVerifiedAt: q.verified === 'true' ? { not: null } : null });
  if (q.hasCase) {
    const active = { some: { status: { notIn: FINAL_STATUSES } } };
    and.push(q.hasCase === 'true' ? { cases: active } : { NOT: { cases: active } });
  }
  if (q.licence) and.push({ drivingLicence: { not: null } });
  return { AND: and };
};

adminCandidatesRouter.get('/', async (req, res) => {
  const q = parse(candidateListQuery, req.query);
  const and: Prisma.UserWhereInput[] = [{ role: 'CLIENT' }];
  if (q.search) {
    and.push({
      OR: [
        { firstName: { contains: q.search } },
        { lastName: { contains: q.search } },
        { email: { contains: q.search } },
        { phone: { contains: q.search } },
        { profession: { contains: q.search } },
      ],
    });
  }
  if (q.profession) and.push({ profession: { contains: q.profession } });
  if (q.city) and.push({ city: { contains: q.city } });
  if (q.education) and.push({ education: q.education });
  if (q.minExperience !== undefined) and.push({ experienceYears: { gte: q.minExperience } });
  if (q.germanLevel) and.push({ germanLevel: { in: GERMAN_LEVELS.filter((l) => germanRank(l) >= germanRank(q.germanLevel)) } });
  if (q.verified) and.push({ emailVerifiedAt: q.verified === 'true' ? { not: null } : null });
  if (q.hasCase) {
    const active = { some: { status: { notIn: FINAL_STATUSES } } };
    and.push(q.hasCase === 'true' ? { cases: active } : { NOT: { cases: active } });
  }
  // Licence coverage (CE covers C and B) can't be expressed in SQL; pre-filter on "has any licence".
  if (q.licence) and.push({ drivingLicence: { not: null } });
  const where: Prisma.UserWhereInput = { AND: and };
  const pageSize = 25;

  const vacancy = q.vacancyId ? await loadRankVacancy(q.vacancyId) : null;
  if (q.vacancyId && !vacancy) throw badRequest('INVALID_VACANCY');

  const needsMemory = !!vacancy || !!q.licence;
  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: candidateSelect,
    skip: needsMemory ? 0 : (q.page - 1) * pageSize,
    take: needsMemory ? RANK_LIMIT : pageSize,
  });
  const filtered = q.licence ? rows.filter((r) => licenceCovers(r.drivingLicence, q.licence)) : rows;
  const appBy = new Map(vacancy?.applications.map((a) => [a.userId, { id: a.id, status: a.status }]) ?? []);
  let items = filtered.map(({ cases, _count, ...u }) => ({
    ...u,
    activeCase: cases[0] ?? null,
    applicationsCount: _count.applications,
    ...(vacancy ? { match: matchCandidate(u, vacancy), application: appBy.get(u.id) ?? null } : {}),
  }));
  let total: number;
  if (needsMemory) {
    if (vacancy) items.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
    total = items.length;
    items = items.slice((q.page - 1) * pageSize, q.page * pageSize);
  } else {
    total = await prisma.user.count({ where });
  }
  res.json({ items, total, pageSize });
});

adminCandidatesRouter.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, role: true, firstName: true, lastName: true, email: true, phone: true, locale: true, birthDate: true, nationality: true,
      city: true, address: true, profession: true, experienceYears: true, germanLevel: true, education: true, drivingLicence: true,
      recognitionStatus: true, recognitionNote: true, introVideoKey: true, about: true, emailVerifiedAt: true, isActive: true, createdAt: true,
      cases: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, status: true, profession: true, createdAt: true, companyId: true, vacancyId: true, company: { select: { name: true } } },
      },
      applications: {
        orderBy: { createdAt: 'desc' },
        include: {
          vacancy: {
            select: {
              id: true, slug: true, title: true, status: true, city: true, profession: true, germanLevel: true, minExperience: true, drivingLicence: true,
              companyId: true, company: { select: { name: true } }, visaCategory: { select: { visaLabel: true, germanLevel: true } },
            },
          },
        },
      },
    },
  });
  if (!user || user.role !== 'CLIENT') throw notFound('CANDIDATE_NOT_FOUND');
  const { introVideoKey, ...rest } = user;
  const votes = await votesByApplication(user.applications.map((a) => a.id)); // employer team votes (company portal)
  res.json({
    candidate: {
      ...rest,
      hasIntroVideo: !!introVideoKey, // the stored file name never leaves the server
      applications: user.applications.map((a) => ({ ...a, match: matchCandidate(user, a.vacancy), employerVotes: votes.get(a.id) ?? [] })),
      // Documents uploaded with an application (before / besides a case); attachedCaseId once they joined a case.
      applicationDocuments: await applicationUploadsOf(user.id),
    },
  });
});

/** Full CV PDF of a candidate (staff). */
adminCandidatesRouter.get('/:userId/cv.pdf', sendStaffCv);

/** A document the candidate uploaded with an application (staff download; only application uploads). */
adminCandidatesRouter.get('/:userId/application-documents/:docId', async (req, res) => {
  const d = await prisma.vaultDocument.findUnique({ where: { id: String(req.params.docId) } });
  if (!d || d.userId !== req.params.userId || !isApplicationDocument(d)) throw notFound('DOCUMENT_NOT_FOUND'); // uploaded with or picked for an application
  await audit(req, 'APPLICATION_DOCUMENT_VIEWED', `user:${d.userId}`, { documentId: d.id, kind: d.kind });
  res.setHeader('Content-Type', d.mimeType);
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(d.filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(path.join(vaultDir(), path.basename(d.storageKey)), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'FILE_NOT_FOUND' });
  });
});

/** Staff add a candidate to a vacancy (SHORTLISTED). A withdrawn / new application is re-used. */
adminCandidatesRouter.post('/:id/applications', async (req, res) => {
  const body = parse(z.object({ vacancyId: z.string().max(40), note: z.string().trim().max(2000).optional() }), req.body);
  const [user, vacancy] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.params.id } }),
    prisma.vacancy.findUnique({ where: { id: body.vacancyId }, include: { visaCategory: { select: { visaLabel: true, germanLevel: true } } } }),
  ]);
  if (!user || user.role !== 'CLIENT') throw notFound('CANDIDATE_NOT_FOUND');
  if (!vacancy) throw badRequest('INVALID_VACANCY');
  if (vacancy.status === 'CLOSED') throw conflict('VACANCY_CLOSED');
  const { score } = matchCandidate(user, vacancy);
  const existing = await prisma.vacancyApplication.findUnique({ where: { vacancyId_userId: { vacancyId: vacancy.id, userId: user.id } } });
  if (existing && !['NEW', 'WITHDRAWN'].includes(existing.status)) throw conflict('ALREADY_APPLIED');
  const application = existing
    ? await prisma.vacancyApplication.update({
        where: { id: existing.id },
        data: { status: 'SHORTLISTED', matchScore: score, ...(body.note ? { staffNote: body.note } : {}) },
      })
    : await prisma.vacancyApplication.create({
        data: { vacancyId: vacancy.id, userId: user.id, status: 'SHORTLISTED', matchScore: score, staffNote: body.note ?? null },
      });
  await notifyApplicationStatus(user.id, vacancy, 'SHORTLISTED');
  await audit(req, 'APPLICATION_ADDED', `application:${application.id}`, { vacancyId: vacancy.id, userId: user.id });
  res.status(201).json({ application });
});

/** Move an application through NEW → SHORTLISTED → PROPOSED → INTERVIEW → ACCEPTED / REJECTED, with notes. */
adminCandidatesRouter.patch('/applications/:appId', async (req, res) => {
  const body = parse(
    z.object({
      status: z.enum(STAFF_STATUSES).optional(),
      staffNote: z.string().trim().max(5000).nullable().optional(),
      // Shown to the candidate in the notification (e.g. interview details).
      message: z.string().trim().max(2000).optional(),
    }),
    req.body,
  );
  const app = await prisma.vacancyApplication.findUnique({
    where: { id: req.params.appId },
    include: {
      user: true,
      vacancy: { include: { visaCategory: { select: { visaLabel: true, germanLevel: true } }, company: { select: { status: true } } } },
    },
  });
  if (!app) throw notFound('APPLICATION_NOT_FOUND');
  if (body.status && app.status === 'WITHDRAWN') throw conflict('APPLICATION_WITHDRAWN');
  if (body.status === 'PROPOSED' && app.vacancy.companyId && app.vacancy.company?.status !== 'ACTIVE') throw conflict('COMPANY_NOT_ACTIVE');
  const changed = !!body.status && body.status !== app.status;
  const data: Prisma.VacancyApplicationUpdateInput = {};
  if (body.staffNote !== undefined) data.staffNote = body.staffNote || null;
  if (changed) {
    data.status = body.status;
    data.matchScore = matchCandidate(app.user, app.vacancy).score;
    // Re-proposing starts a fresh employer decision.
    if (body.status === 'PROPOSED') data.companyNote = null;
  }
  const updated = await prisma.vacancyApplication.update({ where: { id: app.id }, data });
  if (changed) {
    const status = body.status as ApplicationStatus;
    if (status === 'PROPOSED') await notifyCandidateProposed(app.vacancy);
    await notifyApplicationStatus(app.userId, app.vacancy, status, body.message);
    await audit(req, 'APPLICATION_STATUS_CHANGED', `application:${app.id}`, { from: app.status, to: status });
    await emitWebhook('application.status_changed', { id: app.id, vacancyId: app.vacancy.id, from: app.status, to: status, by: 'staff' }, app.vacancy.companyId);
  }
  res.json({ application: updated });
});

/**
 * For an ACCEPTED application: link the candidate's visa case to the employer and vacancy — an
 * existing case (given, or the active one) or a new case created with the normal case flow.
 */
adminCandidatesRouter.post('/applications/:appId/case', async (req, res) => {
  const body = parse(z.object({ caseId: z.string().max(40).optional(), visaCategoryId: z.string().max(40).nullable().optional() }), req.body ?? {});
  const app = await prisma.vacancyApplication.findUnique({ where: { id: req.params.appId }, include: { vacancy: true, user: true } });
  if (!app) throw notFound('APPLICATION_NOT_FOUND');
  if (app.status !== 'ACCEPTED') throw conflict('APPLICATION_NOT_ACCEPTED');
  const link = { companyId: app.vacancy.companyId, vacancyId: app.vacancyId };

  let target = body.caseId
    ? await prisma.case.findUnique({ where: { id: body.caseId } })
    : await prisma.case.findFirst({ where: { clientId: app.userId, status: { notIn: FINAL_STATUSES } }, orderBy: { createdAt: 'desc' } });
  if (body.caseId && (!target || target.clientId !== app.userId)) throw badRequest('INVALID_CASE');

  let created = false;
  if (target) {
    target = await prisma.case.update({ where: { id: target.id }, data: link });
  } else {
    const visaCategoryId = body.visaCategoryId !== undefined ? body.visaCategoryId : app.vacancy.visaCategoryId;
    if (visaCategoryId && !(await prisma.visaCategory.count({ where: { id: visaCategoryId } }))) throw badRequest('INVALID_VISA_CATEGORY');
    const title = app.vacancy.title as Record<string, string>;
    const profession = (app.vacancy.profession || app.user.profession || title.de || title.az || 'Worker').slice(0, 120);
    const c = await createCase(app.userId, { profession: profession.length >= 2 ? profession : `${profession} worker`, visaCategoryId });
    target = await prisma.case.update({ where: { id: c.id }, data: link });
    created = true;
  }
  await prisma.caseEvent.create({
    data: { caseId: target.id, type: 'CASE_LINKED_TO_VACANCY', actorId: req.user!.id, visibleToClient: false, note: app.vacancyId },
  });
  await audit(req, 'APPLICATION_CASE_LINKED', `application:${app.id}`, { caseId: target.id, created });
  res.status(created ? 201 : 200).json({ case: { id: target.id, number: target.number, status: target.status }, created });
});
