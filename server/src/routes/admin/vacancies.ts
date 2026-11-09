import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma, Vacancy } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { emitWebhook } from '../../lib/ops/webhooks.js';
import { onVacancyPublished } from '../../lib/jobAlerts/service.js';
import { notifyVacancyReviewed } from '../../lib/jobsNotifications.js';
import { matchCandidate } from '../../lib/matching.js';
import { fillL10n, staffVacancyInput, staffVacancyPatch, uniqueSlug, vacancyData } from '../../lib/vacancies.js';
import { hasMinRole } from '../../middleware/auth.js';
import { singleVacancyImage, storeVacancyImage, vacancyImagesOf } from '../../lib/vacancyImages.js';
import { cleanupRemovedImages } from '../../lib/publicImageRefs.js';
import { checkTargetFolder, createFolder, folderInfo, folderInfos, syncApplicationFolder, syncVacancyApplications, vacancyFolderName } from '../../lib/drive/vacancyFolders.js';

// Admin: vacancies — mounted at /api/admin/vacancies
export const adminVacanciesRouter = Router();

const STATUSES = ['DRAFT', 'PENDING', 'OPEN', 'CLOSED'] as const;

const isSuper = (req: Request) => hasMinRole(req.user?.role, 'SUPER_ADMIN');

/** STAFF / ADMIN may not set a closing date in the past; sending back the stored (possibly past) one is fine. */
const checkClosesAt = (req: Request, next: Date | null | undefined, stored: Date | null = null) => {
  if (!next || isSuper(req) || next.getTime() > Date.now()) return;
  if (stored && stored.toISOString().slice(0, 10) === next.toISOString().slice(0, 10)) return;
  throw badRequest('DATE_NOT_IN_FUTURE');
};

/** Before → after of every changed column, for the audit log (long texts only flagged as changed). */
const SCALAR_FIELDS = ['slug', 'companyId', 'visaCategoryId', 'sector', 'city', 'profession', 'germanLevel', 'minExperience', 'drivingLicence', 'salaryMin', 'salaryMax', 'positions', 'employmentType', 'showCompany', 'status', 'publishedAt', 'closesAt'] as const;
const JSON_FIELDS = ['title', 'description', 'requirements', 'benefits', 'images'] as const;
const diffVacancy = (a: Vacancy, b: Vacancy) => {
  const norm = (v: string | number | boolean | Date | null): string | number | boolean | null => (v instanceof Date ? v.toISOString() : v);
  const changes: Record<string, Prisma.InputJsonValue> = {};
  for (const k of SCALAR_FIELDS) if (norm(a[k]) !== norm(b[k])) changes[k] = { from: norm(a[k]), to: norm(b[k]) };
  for (const k of JSON_FIELDS) if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) changes[k] = 'changed';
  return changes;
};

/**
 * Drive folder of a vacancy (lib/drive/vacancyFolders.ts): an existing folder the admin picked (`driveFolderId`), or a
 * new one (`newFolder`: in `parentId`, default "Stellenangebote"; name default "<title> – <city>"). null unlinks.
 */
const folderBody = z.object({
  driveFolderId: z.string().max(40).nullable().optional(),
  newFolder: z.object({ parentId: z.string().max(40).nullable().optional(), name: z.string().trim().max(200).optional() }).optional(),
});
const resolveFolder = async (req: Request, b: z.infer<typeof folderBody>, v: { title: unknown; city?: string | null }): Promise<string | null | undefined> => {
  if (b.newFolder) return (await createFolder(req.user!, { parentId: b.newFolder.parentId, name: b.newFolder.name || vacancyFolderName(v) })).id;
  if (b.driveFolderId) return checkTargetFolder(req.user!, b.driveFolderId);
  return b.driveFolderId;
};

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

/** Cover / gallery photo: re-encoded to WebP + width variants (lib/vacancyImages.ts); saved with the vacancy. */
adminVacanciesRouter.post('/images', singleVacancyImage, async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED');
  res.status(201).json(await storeVacancyImage(req.file.buffer));
});

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
  // Drive folders: the vacancy's and each applicant's (with their paths; missing / trashed ones are null).
  const folders = await folderInfos([vacancy.driveFolderId, ...vacancy.applications.flatMap((a) => [a.driveFolderId, a.targetFolderId])]);
  const info = (id: string | null) => (id ? (folders.get(id) ?? null) : null);
  res.json({
    vacancy: {
      ...vacancy,
      folder: info(vacancy.driveFolderId),
      applications: vacancy.applications.map((a) => ({ ...a, match: matchCandidate(a.user, vacancy), folder: info(a.driveFolderId), targetFolder: info(a.targetFolderId) })),
    },
  });
});

adminVacanciesRouter.post('/', async (req, res) => {
  const body = parse(staffVacancyInput, req.body);
  const folder = parse(folderBody, req.body ?? {});
  await checkRefs(body);
  checkClosesAt(req, body.closesAt);
  if (body.slug && (await prisma.vacancy.count({ where: { slug: body.slug } }))) throw conflict('SLUG_TAKEN');
  const title = fillL10n(body.title);
  const driveFolderId = await resolveFolder(req, folder, { title, city: body.city });
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
      driveFolderId: driveFolderId ?? null,
    } as never,
  });
  await audit(req, 'VACANCY_CREATED', `vacancy:${vacancy.id}`, { companyId: vacancy.companyId, status: vacancy.status, driveFolderId: vacancy.driveFolderId });
  if (vacancy.status === 'OPEN') {
    await emitWebhook('vacancy.published', { id: vacancy.id, slug: vacancy.slug, publishedAt: vacancy.publishedAt?.toISOString() ?? null }, vacancy.companyId);
    onVacancyPublished(); // job alert digests (background)
  }
  res.status(201).json({ vacancy });
});

adminVacanciesRouter.patch('/:id', async (req, res) => {
  const body = parse(staffVacancyPatch, req.body);
  const before = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
  if (!before) throw notFound('VACANCY_NOT_FOUND');
  // Status and publication date bypass the review workflow (approve / reject / close): SUPER_ADMIN only.
  if ((body.status !== undefined || body.publishedAt !== undefined) && !isSuper(req)) throw forbidden('SUPER_ADMIN_ONLY');
  await checkRefs(body);
  checkClosesAt(req, body.closesAt, before.closesAt);
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
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.publishedAt !== undefined ? { publishedAt: body.publishedAt } : {}),
      // Opened directly by the super admin: it gets a first publication date like an approval would.
      ...(body.status === 'OPEN' && before.status !== 'OPEN' && body.publishedAt === undefined && !before.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });
  // Photos taken out of the vacancy: their files go unless something else still uses them.
  if (body.images !== undefined) {
    const kept = new Set(vacancyImagesOf(vacancy.images).map((i) => i.url));
    cleanupRemovedImages(vacancyImagesOf(before.images).map((i) => i.url).filter((u) => !kept.has(u)));
  }
  await audit(req, 'VACANCY_UPDATED', `vacancy:${vacancy.id}`, { fields: Object.keys(body), changes: diffVacancy(before, vacancy), ...(isSuper(req) ? { by: 'SUPER_ADMIN' } : {}) });
  if (vacancy.status === 'OPEN' && before.status !== 'OPEN') {
    if (before.status === 'PENDING') await notifyVacancyReviewed(vacancy, true);
    await emitWebhook('vacancy.published', { id: vacancy.id, slug: vacancy.slug, publishedAt: vacancy.publishedAt?.toISOString() ?? null }, vacancy.companyId);
    onVacancyPublished(); // job alert digests (background)
  }
  res.json({ vacancy });
});

/** Publish: DRAFT / PENDING / CLOSED → OPEN. Keeps the first publication date. */
adminVacanciesRouter.post('/:id/approve', async (req, res) => {
  const v = await prisma.vacancy.findUnique({ where: { id: req.params.id }, include: { company: { select: { status: true } } } });
  if (!v) throw notFound('VACANCY_NOT_FOUND');
  if (v.status === 'OPEN') throw conflict('INVALID_TRANSITION');
  // The super admin may publish for an employer that is not (yet) active.
  if (v.company && v.company.status !== 'ACTIVE' && !isSuper(req)) throw conflict('COMPANY_NOT_ACTIVE');
  if (v.closesAt && v.closesAt <= new Date()) throw conflict('CLOSING_DATE_PASSED');
  const wasPending = v.status === 'PENDING';
  const vacancy = await prisma.vacancy.update({ where: { id: v.id }, data: { status: 'OPEN', publishedAt: v.publishedAt ?? new Date() } });
  if (wasPending) await notifyVacancyReviewed(vacancy, true);
  await emitWebhook('vacancy.published', { id: vacancy.id, slug: vacancy.slug, publishedAt: vacancy.publishedAt?.toISOString() ?? null }, vacancy.companyId);
  await audit(req, 'VACANCY_APPROVED', `vacancy:${v.id}`, { from: v.status });
  onVacancyPublished(); // job alert digests (background)
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

/** Link the vacancy to a drive folder (existing or new) or unlink it (driveFolderId: null). Its applicants follow. */
adminVacanciesRouter.put('/:id/folder', async (req, res) => {
  const body = parse(folderBody, req.body ?? {});
  if (body.driveFolderId === undefined && !body.newFolder) throw badRequest('FOLDER_REQUIRED');
  const v = await prisma.vacancy.findUnique({ where: { id: req.params.id }, select: { id: true, title: true, city: true, driveFolderId: true } });
  if (!v) throw notFound('VACANCY_NOT_FOUND');
  const driveFolderId = (await resolveFolder(req, body, v)) ?? null;
  await prisma.vacancy.update({ where: { id: v.id }, data: { driveFolderId } });
  await audit(req, 'VACANCY_FOLDER_LINKED', `vacancy:${v.id}`, { from: v.driveFolderId, to: driveFolderId });
  // Applications collected so far are placed there too (an explicit staff action; nothing happens without a folder).
  if (driveFolderId && driveFolderId !== v.driveFolderId) void syncVacancyApplications(v.id);
  res.json({ driveFolderId, folder: await folderInfo(driveFolderId) });
});

/** Staff override: collect this application in another folder (null = back to the vacancy's folder). */
adminVacanciesRouter.put('/applications/:appId/folder', async (req, res) => {
  const body = parse(z.object({ folderId: z.string().max(40).nullable() }), req.body ?? {});
  const app = await prisma.vacancyApplication.findUnique({ where: { id: req.params.appId }, select: { id: true, targetFolderId: true } });
  if (!app) throw notFound('APPLICATION_NOT_FOUND');
  const targetFolderId = body.folderId ? await checkTargetFolder(req.user!, body.folderId) : null;
  await prisma.vacancyApplication.update({ where: { id: app.id }, data: { targetFolderId } });
  await audit(req, 'APPLICATION_FOLDER_SET', `application:${app.id}`, { from: app.targetFolderId, to: targetFolderId });
  const folderId = await syncApplicationFolder(app.id);
  res.json({ targetFolder: await folderInfo(targetFolderId), folder: await folderInfo(folderId) });
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
  cleanupRemovedImages(vacancyImagesOf(v.images).map((i) => i.url));
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
