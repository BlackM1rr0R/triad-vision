import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { clearForecastCache, FORECAST_UNITS, parseOverride, parseUnits, rangesFor, STEP_KEYS, type ForecastUnit } from '../../lib/journey/forecast.js';
import { onboardingForCase } from '../../lib/journey/onboarding.js';
import { addFamilyMember, familyGroup, RELATIONS, removeFamilyMember } from '../../lib/journey/family.js';
import { GERMAN_TEST_LEVELS } from '../../lib/journey/german.js';

/**
 * admin/journey — mounted at /api/admin/journey. STAFF+ may read; every write needs ADMIN+
 * (except family members, which the assigned staff manage like any other case action).
 */
export const adminJourneyRouter = Router();
adminJourneyRouter.use(requireMinRole('STAFF'));

const adminOnly = requireMinRole('ADMIN');
const l10n = z.object({ az: z.string(), de: z.string(), en: z.string(), ru: z.string() });
const safeUrl = z.string().max(2000).refine((v) => /^(https?:\/\/[^\s]+|\/[^\s]*)$/i.test(v), 'INVALID_URL');

// ─── Forecast overrides (visa × step) ──────────────────────────────────

const range = z.tuple([z.number().int().min(0).max(730), z.number().int().min(0).max(730)]).refine(([a, b]) => b >= a, 'MAX_BELOW_MIN');
const overrideSchema = z.object(Object.fromEntries(STEP_KEYS.map((k) => [k, range.nullable().optional()])) as Record<(typeof STEP_KEYS)[number], z.ZodOptional<z.ZodNullable<typeof range>>>);
/** Unit the admin last entered a row in (display only — values are always stored in days). */
const unitsSchema = z.record(z.enum(STEP_KEYS), z.enum(FORECAST_UNITS)) as z.ZodType<Partial<Record<(typeof STEP_KEYS)[number], ForecastUnit>>>;

/** Every visa category with its override and the ranges currently in effect (history / default). */
adminJourneyRouter.get('/forecast', async (_req, res) => {
  const visas = await prisma.visaCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, slug: true, title: true, visaLabel: true, forecast: true, published: true, sortOrder: true, _count: { select: { cases: true, vacancies: true } } },
  });
  const items = await Promise.all(
    visas.map(async ({ _count, ...v }) => ({
      ...v,
      override: parseOverride(v.forecast),
      units: parseUnits(v.forecast),
      usage: { cases: _count.cases, vacancies: _count.vacancies },
      forecast: undefined,
      effective: await rangesFor(v.id),
    })),
  );
  res.json({ items, steps: STEP_KEYS, fallback: await rangesFor(null) });
});

adminJourneyRouter.put('/forecast/:visaCategoryId', adminOnly, async (req, res) => {
  const { units: unitsIn, ...rest } = (req.body ?? {}) as Record<string, unknown>;
  const body = parse(overrideSchema, rest);
  const visa = await prisma.visaCategory.findUnique({ where: { id: String(req.params.visaCategoryId) }, select: { id: true, forecast: true } });
  if (!visa) throw notFound('VISA_CATEGORY_NOT_FOUND');
  const override = Object.fromEntries(STEP_KEYS.filter((k) => Array.isArray(body[k])).map((k) => [k, body[k]]));
  // Units are kept when the request does not send them; only "week" is stored ("day" is the default).
  const unitsParsed = unitsIn === undefined ? parseUnits(visa.forecast) : parse(unitsSchema, unitsIn ?? {});
  const units = Object.fromEntries(STEP_KEYS.filter((k) => unitsParsed[k] === 'week').map((k) => [k, 'week']));
  const stored = { ...override, ...(Object.keys(units).length ? { units } : {}) };
  const updated = await prisma.visaCategory.update({
    where: { id: visa.id },
    data: { forecast: Object.keys(stored).length ? (stored as Prisma.InputJsonValue) : Prisma.DbNull },
    select: { id: true, forecast: true },
  });
  clearForecastCache();
  await audit(req, 'FORECAST_OVERRIDE_UPDATED', `visa:${visa.id}`, stored as Prisma.InputJsonValue);
  res.json({ id: updated.id, override: parseOverride(updated.forecast), units: parseUnits(updated.forecast), effective: await rangesFor(updated.id) });
});

// ─── Onboarding: a client's progress + item CRUD ───────────────────────

adminJourneyRouter.get('/onboarding/:caseId', async (req, res) => {
  const c = await prisma.case.findUnique({
    where: { id: String(req.params.caseId) },
    select: { id: true, number: true, status: true, decisionAt: true, visaValidFrom: true, visaValidTo: true, client: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  res.json({ case: c, ...(await onboardingForCase(c)) });
});

const itemSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(60),
  icon: z.string().max(60).default('CheckCircle2'),
  title: l10n,
  body: l10n,
  link: z.union([safeUrl, z.literal('')]).nullable().optional(),
  dueDays: z.number().int().min(0).max(3650).nullable().optional(),
  sortOrder: z.number().int().default(0),
  published: z.boolean().default(true),
});

adminJourneyRouter.get('/onboarding-items', async (_req, res) => {
  res.json({ items: await prisma.onboardingItem.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { progress: { where: { doneAt: { not: null } } } } } } }) });
});

adminJourneyRouter.post('/onboarding-items', adminOnly, async (req, res) => {
  const data = parse(itemSchema, req.body ?? {});
  res.status(201).json({ item: await prisma.onboardingItem.create({ data: { ...data, link: data.link || null } }) });
});

adminJourneyRouter.put('/onboarding-items/reorder', adminOnly, async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string()).min(1).max(200) }), req.body ?? {});
  await prisma.$transaction(ids.map((id, i) => prisma.onboardingItem.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

adminJourneyRouter.put('/onboarding-items/:id', adminOnly, async (req, res) => {
  const data = parse(itemSchema.partial(), req.body ?? {});
  const item = await prisma.onboardingItem.update({ where: { id: String(req.params.id) }, data: { ...data, ...(data.link !== undefined ? { link: data.link || null } : {}) } });
  res.json({ item });
});

adminJourneyRouter.delete('/onboarding-items/:id', adminOnly, async (req, res) => {
  await prisma.onboardingItem.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
});

// ─── German: questions + courses ───────────────────────────────────────

const questionSchema = z
  .object({
    level: z.enum(GERMAN_TEST_LEVELS),
    question: l10n,
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
    answer: z.number().int().min(0),
    sortOrder: z.number().int().default(0),
    published: z.boolean().default(true),
  })
  .refine((q) => q.answer < q.options.length, { message: 'ANSWER_OUT_OF_RANGE', path: ['answer'] });

adminJourneyRouter.get('/german/questions', async (_req, res) => {
  res.json({ items: await prisma.germanQuestion.findMany({ orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }] }) });
});

adminJourneyRouter.post('/german/questions', adminOnly, async (req, res) => {
  const data = parse(questionSchema, req.body ?? {});
  res.status(201).json({ item: await prisma.germanQuestion.create({ data }) });
});

adminJourneyRouter.put('/german/questions/:id', adminOnly, async (req, res) => {
  const existing = await prisma.germanQuestion.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound('QUESTION_NOT_FOUND');
  const patch = parse(questionSchema.innerType().partial(), req.body ?? {});
  const options = patch.options ?? (existing.options as string[]);
  const answer = patch.answer ?? existing.answer;
  if (answer >= options.length) throw badRequest('ANSWER_OUT_OF_RANGE');
  res.json({ item: await prisma.germanQuestion.update({ where: { id: existing.id }, data: patch }) });
});

adminJourneyRouter.delete('/german/questions/:id', adminOnly, async (req, res) => {
  await prisma.germanQuestion.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
});

const courseSchema = z.object({
  name: z.string().trim().min(1).max(160),
  provider: z.string().trim().max(160).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  url: z.union([safeUrl, z.literal('')]).nullable().optional(),
  levels: z.string().trim().max(40).nullable().optional(),
  format: z.enum(['online', 'offline', 'hybrid']).nullable().optional(),
  description: l10n.nullable().optional(),
  sortOrder: z.number().int().default(0),
  published: z.boolean().default(true),
});

const courseData = (d: z.infer<typeof courseSchema> | Partial<z.infer<typeof courseSchema>>) => ({
  ...d,
  ...(d.url !== undefined ? { url: d.url || null } : {}),
  ...(d.description === null ? { description: Prisma.DbNull } : {}),
});

adminJourneyRouter.get('/german/courses', async (_req, res) => {
  res.json({ items: await prisma.languageCourse.findMany({ orderBy: { sortOrder: 'asc' } }) });
});

adminJourneyRouter.post('/german/courses', adminOnly, async (req, res) => {
  const data = parse(courseSchema, req.body ?? {});
  res.status(201).json({ item: await prisma.languageCourse.create({ data: courseData(data) as Prisma.LanguageCourseCreateInput }) });
});

adminJourneyRouter.put('/german/courses/:id', adminOnly, async (req, res) => {
  const data = parse(courseSchema.partial(), req.body ?? {});
  res.json({ item: await prisma.languageCourse.update({ where: { id: String(req.params.id) }, data: courseData(data) as Prisma.LanguageCourseUpdateInput }) });
});

adminJourneyRouter.delete('/german/courses/:id', adminOnly, async (req, res) => {
  await prisma.languageCourse.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
});

// ─── Family reunion (staff) ────────────────────────────────────────────

adminJourneyRouter.get('/cases/:id/family', async (req, res) => {
  res.json(await familyGroup(String(req.params.id)));
});

adminJourneyRouter.post('/cases/:id/family', async (req, res) => {
  const body = parse(
    z.object({
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      relation: z.enum(RELATIONS),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      email: z.string().trim().email().max(190).nullable().optional().or(z.literal('')),
      profession: z.string().trim().max(120).nullable().optional(),
    }),
    req.body ?? {},
  );
  const created = await addFamilyMember(String(req.params.id), req.user!.id, { ...body, email: body.email || null });
  await audit(req, 'FAMILY_MEMBER_ADDED', `case:${created.id}`, { parentCaseId: String(req.params.id), relation: body.relation });
  res.status(201).json({ case: created, ...(await familyGroup(String(req.params.id))) });
});

adminJourneyRouter.delete('/cases/:id/family/:memberId', async (req, res) => {
  await removeFamilyMember(String(req.params.id), String(req.params.memberId));
  await audit(req, 'FAMILY_MEMBER_REMOVED', `case:${String(req.params.memberId)}`, { parentCaseId: String(req.params.id) });
  res.json({ ok: true, ...(await familyGroup(String(req.params.id))) });
});
