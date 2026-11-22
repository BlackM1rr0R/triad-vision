import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireVerifiedEmail } from '../middleware/verified.js';
import { badRequest, conflict, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { notifyClient, notifyStaff } from '../lib/notifications.js';
import { emitWebhook } from '../lib/ops/webhooks.js';
import { verifyUploadedFile } from '../middleware/upload.js';
import { applicationUpload, discardUploads, linkPickedVaultDocs, MAX_APPLICATION_FILES, ownPickableVaultDocs, parseKinds, parseVaultIds, storeApplicationFiles } from '../lib/applicationUploads.js';
import { GERMAN_LEVELS, germanRank } from '../lib/matching.js';
import {
  EMPLOYMENT_TYPES,
  SECTORS,
  isOpen,
  matchFor,
  openVacancyWhere,
  publicVacancy,
} from '../lib/vacancies.js';
import { caseParentFor, syncApplicationFolder, vacancyProfession, visaCategoryIdForVacancy } from '../lib/drive/vacancyFolders.js';
import { createCase, FINAL_STATUSES } from '../lib/caseFlow.js'; // applying = starting the client's one visa application (case)
import { visaTypeOfVacancy } from '../lib/vacancyPlaces/places.js';
import { recordApiAttribution } from '../lib/publicApi/keys.js'; // partner API apply links (tv_src cookie)
import { getSeoData, jobRegion, liveJobs, parseLocale } from '../lib/seo.js';
import { SEO_LOCALES } from '../lib/seoCatalogue.js';
import { jobLandingTexts, jobLandings, landingOfJob, relatedLandings, type JobLanding } from '../lib/jobLandings.js';
import { assertApplicable, placesFor, withApplicableVacancy } from '../lib/vacancyPlaces/service.js'; // free places + race-safe apply
import { computePlaces, fullLast, type Places } from '../lib/vacancyPlaces/places.js';
import { getApplicationPolicy } from '../lib/vacancyPlaces/policy.js';
import { DEACTIVATED_LIST_CAP, deactivatedVacancyWhere, isPubliclyVisible } from '../lib/vacancyActive.js'; // deactivated: listed after the open ones, no apply

// Public vacancy board + candidate applications — mounted at /api/vacancies
export const vacanciesRouter = Router();

const publicLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });
const applyLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30 });

const publicInclude = {
  company: { select: { name: true, logo: true } },
  visaCategory: { select: { slug: true, title: true, visaLabel: true, germanLevel: true } },
} as const;

/**
 * Public shape plus the free places (positions / filled / free, lib/vacancyPlaces) and `active` (false: deactivated
 * by staff or expired — shown with a "Deaktiv" badge, applications closed; lib/vacancyActive.ts).
 */
const publicWithPlaces = (v: Parameters<typeof publicVacancy>[0], places: Places | undefined) => ({
  ...publicVacancy(v),
  ...(places ?? computePlaces(v, 0)),
  active: isOpen(v),
});

/** `?closed=1`: deactivated vacancies are appended after the open ones. */
const closedFlag = z.enum(['0', '1', 'true', 'false']).optional().transform((v) => v === '1' || v === 'true');

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
      closed: closedFlag,
    }),
    req.query,
  );
  const and: Prisma.VacancyWhereInput[] = [];
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
      ],
    });
  }
  const where: Prisma.VacancyWhereInput = { AND: [openVacancyWhere(), ...and] };
  const orderBy: Prisma.VacancyOrderByWithRelationInput[] =
    q.sort === 'salary'
      ? [{ salaryMax: { sort: 'desc', nulls: 'last' } }, { salaryMin: { sort: 'desc', nulls: 'last' } }, { publishedAt: 'desc' }]
      : q.sort === 'closing'
        ? [{ closesAt: { sort: 'asc', nulls: 'last' } }, { publishedAt: 'desc' }]
        : [{ publishedAt: 'desc' }, { createdAt: 'desc' }];

  // Full vacancies stay on the board but come after the ones with free places (same order inside each group).
  const ORDERED_CAP = 2000;
  const ordered = await prisma.vacancy.findMany({ where, orderBy, take: ORDERED_CAP, select: { id: true, positions: true, filledAdjustment: true } });
  const places = await placesFor(ordered);
  // Deactivated / expired ones (same filters) after all open ones, most recently changed first (lib/vacancyActive.ts).
  const closed = q.closed
    ? await prisma.vacancy.findMany({ where: { AND: [deactivatedVacancyWhere(), ...and] }, orderBy: [{ updatedAt: 'desc' }], take: DEACTIVATED_LIST_CAP, select: { id: true, positions: true, filledAdjustment: true } })
    : [];
  const pageList = [...fullLast(ordered, (v) => (places.get(v.id)?.free ?? 0) <= 0), ...closed].slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  const pageIds = pageList.map((v) => v.id);
  const closedOnPage = pageList.filter((v) => !places.has(v.id));
  if (closedOnPage.length) for (const [id, p] of await placesFor(closedOnPage)) places.set(id, p);
  const [rows, openTotal, sectors, cities] = await Promise.all([
    prisma.vacancy.findMany({ where: { id: { in: pageIds } }, include: publicInclude }),
    // Below the cap the list above already holds every match: no second run of the same filter.
    ordered.length < ORDERED_CAP ? Promise.resolve(ordered.length) : prisma.vacancy.count({ where }),
    prisma.vacancy.groupBy({ by: ['sector'], where: openVacancyWhere(), _count: { _all: true } }),
    prisma.vacancy.groupBy({ by: ['city'], where: openVacancyWhere(), _count: { _all: true }, orderBy: { _count: { city: 'desc' } }, take: 30 }),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = pageIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({
    items: items.map((v) => publicWithPlaces(v, places.get(v.id))),
    total: openTotal + closed.length,
    openTotal,
    page: q.page,
    pageSize: q.pageSize,
    facets: {
      sectors: sectors.filter((s) => s.sector).map((s) => ({ value: s.sector, count: s._count._all })),
      cities: cities.filter((c) => c.city).map((c) => ({ value: c.city, count: c._count._all })),
    },
  });
});

/**
 * Open vacancies for pickers (the client's "start application": the target job is one of our vacancies), with their
 * free places; full ones are listed last (shown, but not selectable).
 */
vacanciesRouter.get('/options', publicLimiter, async (req, res) => {
  const q = parse(z.object({ closed: closedFlag }), req.query);
  const select = { id: true, slug: true, title: true, city: true, profession: true, visaCategoryId: true, employmentType: true, positions: true, filledAdjustment: true } as const;
  const [rows, closedRows] = await Promise.all([
    prisma.vacancy.findMany({ where: openVacancyWhere(), orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], take: 300, select }),
    // `?closed=1`: deactivated ones last, flagged `active: false` (shown, never selectable; lib/vacancyActive.ts).
    q.closed ? prisma.vacancy.findMany({ where: deactivatedVacancyWhere(), orderBy: [{ updatedAt: 'desc' }], take: 100, select }) : Promise.resolve([]),
  ]);
  const places = await placesFor([...rows, ...closedRows]);
  const shape = (active: boolean) => ({ filledAdjustment: _adj, ...v }: (typeof rows)[number]) => ({ ...v, ...(places.get(v.id) ?? computePlaces(v, 0)), active });
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({ items: [...fullLast(rows.map(shape(true)), (v) => v.free <= 0), ...closedRows.map(shape(false))] });
});

/**
 * What a client may start by themselves (lib/vacancyPlaces/policy.ts): only our open vacancies with a free place
 * (`clientsOnlyActiveVacancies`), and whether "apply via Triad Vision" works for other job sites' listings.
 */
vacanciesRouter.get('/policy', publicLimiter, async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({ policy: await getApplicationPolicy() });
});

// ─── Profession × city landing pages (lib/jobLandings.ts) ──────────────

/**
 * GET /api/vacancies/landing/:city/:profession?lng=de — the page /jobs/in/:city/:profession: its texts (H1,
 * title, intro, labels) in that language, the open vacancies (public shape, newest first) and the related
 * landing pages. 404 when the combination has no live vacancy. Same source as the sitemap and /__seo/status.
 */
vacanciesRouter.get('/landing/:city/:profession', publicLimiter, async (req, res) => {
  const lng = parseLocale(req.query.lng) ?? 'az';
  const all = jobLandings(liveJobs(await getSeoData()));
  const landing = all.find((l) => l.citySlug === req.params.city && l.professionSlug === req.params.profession);
  if (!landing) throw notFound('JOB_LANDING_NOT_FOUND');
  const rows = await prisma.vacancy.findMany({ where: { AND: [openVacancyWhere(), { slug: { in: landing.jobs.map((j) => j.slug) } }] }, include: publicInclude });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const places = await placesFor(rows);
  const items = fullLast(
    landing.jobs.flatMap((j) => {
      const row = bySlug.get(j.slug);
      return row ? [publicWithPlaces(row, places.get(row.id))] : [];
    }),
    (v) => v.free <= 0,
  );
  if (!items.length) throw notFound('JOB_LANDING_NOT_FOUND');
  const rel = relatedLandings(all, landing);
  const linkOf = (x: JobLanding) => ({ path: x.path, label: jobLandingTexts(x, lng, null).linkLabel });
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    landing: { path: landing.path, city: landing.city, citySlug: landing.citySlug, profession: landing.profession, professionSlug: landing.professionSlug, ...jobLandingTexts(landing, lng, jobRegion(landing.city)) },
    items,
    related: { sameCity: rel.sameCity.map(linkOf), sameProfession: rel.sameProfession.map(linkOf) },
  });
});

/** The landing page of a vacancy (link on the vacancy page), with its link text in every language. */
const landingLinkOf = async (v: { city: string | null; profession: string | null; title: unknown }) => {
  const own = landingOfJob(liveJobs(await getSeoData()), v);
  return own ? { path: own.path, label: Object.fromEntries(SEO_LOCALES.map((l) => [l, jobLandingTexts(own, l, null).linkLabel])) } : null;
};

/** Open or deactivated (drafts, pending and never-published ones: 404; lib/vacancyActive.ts). */
const loadVisible = async (slug: string) => {
  const v = await prisma.vacancy.findUnique({ where: { slug }, include: publicInclude });
  if (!v || !isPubliclyVisible(v)) throw notFound('VACANCY_NOT_FOUND');
  return v;
};

vacanciesRouter.get('/:slug', publicLimiter, async (req, res) => {
  const v = await loadVisible(String(req.params.slug));
  res.setHeader('Cache-Control', 'public, max-age=30');
  const places = await placesFor([v]);
  res.json({ vacancy: { ...publicWithPlaces(v, places.get(v.id)), landing: await landingLinkOf(v) } });
});

/** The signed-in candidate's view of a vacancy: match score, gaps and their application (if any). */
vacanciesRouter.get('/:slug/me', requireAuth, requireCandidate, async (req, res) => {
  const v = await loadVisible(String(req.params.slug));
  const [user, application] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } }),
    prisma.vacancyApplication.findUnique({
      where: { vacancyId_userId: { vacancyId: v.id, userId: req.user!.id } },
      select: { id: true, status: true, createdAt: true },
    }),
  ]);
  // One active application per client: while it runs, applying elsewhere is refused (the box links to it).
  const activeCase = await activeMainCase(req.user!.id);
  res.json({ match: matchFor(user, v), application, emailVerified: !!user.emailVerifiedAt, activeCase });
});

/** The client's running main application (case), if any: one active application per client (lib/caseFlow createCase). */
const activeMainCase = (userId: string) =>
  prisma.case.findFirst({
    where: { clientId: userId, status: { notIn: FINAL_STATUSES }, parentCaseId: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, vacancyId: true },
  });

/**
 * Applying to a vacancy starts the client's visa application (case) for it — no separate second application:
 * while the client has an active case the server refuses (409 ACTIVE_CASE_EXISTS + caseId; after it ended — approved,
 * refused or cancelled — they can apply again). The vacancy application row stays for the employer / staff pipeline.
 *
 * Apply: JSON { message? } or multipart with optional documents — "files" (≤ 6, case-document rules) and one
 * "kinds" entry per file (PASSPORT | CV | DIPLOMA …). The files are kept as application uploads and attached to
 * the client's case (requirement + "<client folder>/<type folder>") now or once a case exists
 * (lib/applicationUploads.ts).
 */
vacanciesRouter.post('/:slug/apply', applyLimiter, requireAuth, requireCandidate, requireVerifiedEmail, applicationUpload.array('files', MAX_APPLICATION_FILES), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  let stored = false;
  try {
    const body = parse(z.object({ message: z.string().trim().max(2000).optional() }).passthrough(), req.body ?? {});
    // Only our vacancies that are open and have a free place: 404 VACANCY_NOT_FOUND, 409 VACANCY_CLOSED / VACANCY_FULL
    // (checked again under the vacancy's row lock when the application is written; lib/vacancyPlaces).
    const slug = String(req.params.slug);
    const { vacancy: v } = await assertApplicable({ slug });
    const running = await activeMainCase(req.user!.id);
    if (running) throw conflict('ACTIVE_CASE_EXISTS', undefined, { caseId: running.id, caseNumber: running.number });
    for (const f of files) await verifyUploadedFile(f); // invalid content: nothing is created
    // Documents picked from the vault instead of re-uploading: own + not expired, checked before anything is created.
    const vaultIds = parseVaultIds(req.body?.vaultIds ?? req.body?.['vaultIds[]']);
    if (files.length + vaultIds.length > MAX_APPLICATION_FILES) throw badRequest('TOO_MANY_FILES');
    const picked = await ownPickableVaultDocs(req.user!.id, vaultIds);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const { score } = matchFor(user, v);
    const message = body.message || null;

    const application = await withApplicableVacancy({ slug }, async (tx) => {
      const existing = await tx.vacancyApplication.findUnique({ where: { vacancyId_userId: { vacancyId: v.id, userId: user.id } } });
      if (existing) {
        // A withdrawn application may be re-submitted; anything else is a duplicate.
        if (existing.status !== 'WITHDRAWN') throw conflict('ALREADY_APPLIED');
        return tx.vacancyApplication.update({
          where: { id: existing.id },
          data: { status: 'NEW', matchScore: score, message, companyNote: null },
        });
      }
      try {
        return await tx.vacancyApplication.create({ data: { vacancyId: v.id, userId: user.id, matchScore: score, message } });
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') throw conflict('ALREADY_APPLIED');
        throw err;
      }
    });
    const uploads = files.length ? await storeApplicationFiles(user.id, files, parseKinds(req.body?.kinds, files.length), { vacancyId: v.id, applicationId: application.id }) : null;
    stored = true;
    const linked = picked.length ? await linkPickedVaultDocs(user.id, picked, { vacancyId: v.id, applicationId: application.id }) : null;
    if (linked) await audit(req, 'APPLICATION_VAULT_DOCS_LINKED', `application:${application.id}`, { vaultIds: picked.map((d) => d.id) });
    const sentDocs = [...(uploads?.documents ?? []), ...picked];
    // The visa application (case) for this vacancy: the uploads above join it (lib/applicationUploads on case creation).
    let caseId: string | null = null;
    let caseNumber: string | null = null;
    try {
      const created = await createCase(user.id, {
        profession: vacancyProfession(v),
        visaType: visaTypeOfVacancy(v),
        visaCategoryId: await visaCategoryIdForVacancy(v.id), // vacancy's category, else its sector's (logistics → §19c)
        vacancyId: v.id,
        driveParentId: await caseParentFor({ vacancyId: v.id, userId: user.id }),
        // One staff notice per application (the vacancy one below, with the match score and the case number).
        quiet: true,
      });
      caseId = created.id;
      caseNumber = created.number;
      await notifyClient(created.id, 'CASE_CREATED');
      // Vault documents picked for the application join the new case (linking is idempotent per application / case).
      if (picked.length) await linkPickedVaultDocs(user.id, picked, { vacancyId: v.id, applicationId: application.id });
    } catch (err) {
      // A parallel request created the case first: the application belongs to that one.
      if ((err as { code?: string }).code !== 'ACTIVE_CASE_EXISTS') throw err;
      caseId = (await activeMainCase(user.id))?.id ?? null;
    }
    // The applicant's folder in the vacancy's drive folder: summary, CV, the files sent (lib/drive/vacancyFolders.ts).
    await syncApplicationFolder(application.id, { summary: true }); // inside the case's client folder in Anträge
    // Came through a partner's public-API apply link (cookie tv_src): attribution for the partner's usage stats.
    void recordApiAttribution(req, application.id, v.id);
    await emitWebhook('application.created', { id: application.id, vacancyId: v.id, status: application.status, matchScore: application.matchScore, candidateId: user.id }, v.companyId);
    const title = (v.title as Record<string, string>).az ?? '';
    const docsLine = sentDocs.length ? `\n\nSənədlər: ${sentDocs.map((d) => d.title).join(', ')}` : '';
    await notifyStaff(
      `Yeni vakansiya müraciəti: ${title}`.slice(0, 180),
      `${user.firstName} ${user.lastName} "${title}" vakansiyasına müraciət etdi.\n\nUyğunluq: ${score}%${message ? `\n\nMesaj: ${message}` : ''}${docsLine}${caseNumber ? `\n\nMüraciət açıldı: ${caseNumber}` : ''}`,
      { link: `/admin/vacancies?id=${v.id}`, type: 'VACANCY_APPLICATION', ...(caseId ? { caseId } : {}) },
    );
    res.status(201).json({
      application: { id: application.id, status: application.status, matchScore: application.matchScore, createdAt: application.createdAt },
      documents: sentDocs.map((d) => ({ id: d.id, kind: d.kind, title: d.title, filename: d.filename })),
      attachedCaseId: uploads?.caseId ?? linked?.caseId ?? caseId,
      caseId,
    });
  } catch (err) {
    if (!stored) await discardUploads(files);
    throw err;
  }
});
