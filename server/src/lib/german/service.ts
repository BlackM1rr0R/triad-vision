import { Prisma, type GermanCourse, type GermanExam, type GermanExamDate } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { CLIENT_UPLOAD_STAGE, FINAL_STATUSES } from '../caseFlow.js';
import { badRequest, conflict, notFound } from '../http.js';
import { DEFAULT_REQUIREMENTS } from '../docsIntel/requirementTemplates.js';
import { LANGUAGE_CERT_KEYS } from '../journey/german.js';
import { evaluateResults, LEVELS, MODULES, parseResults, PROFILE_LEVELS, PROVIDERS, rank, type ExamResults } from './progress.js';

/** CRUD + overview of a candidate's German progress (portal "Alman dili", staff panel, admin exam dates). */

const dateLike = z
  .string()
  .trim()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'INVALID_DATE');
const optDate = dateLike.nullable().optional();
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v));
const optText = (max: number) => z.string().trim().max(max).nullable().optional();
const level = z.enum(LEVELS);

export const planSchema = z.object({ targetLevel: level.nullable().optional(), targetDate: optDate, notes: optText(2000) });

const courseBase = z.object({
  school: z.string().trim().min(1).max(160),
  level,
  startsAt: optDate,
  endsAt: optDate,
  schedule: optText(200),
  format: z.enum(['online', 'offline', 'hybrid']).nullable().optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  catalogCourseId: z.string().trim().max(40).nullable().optional(),
  notes: optText(2000),
});
const datesInOrder = (v: { startsAt?: string | null; endsAt?: string | null }) => !v.startsAt || !v.endsAt || Date.parse(v.endsAt) >= Date.parse(v.startsAt);
export const courseCreateSchema = courseBase.refine(datesInOrder, { message: 'END_BEFORE_START', path: ['endsAt'] });
export const courseUpdateSchema = courseBase.partial().refine(datesInOrder, { message: 'END_BEFORE_START', path: ['endsAt'] });

const moduleResult = z.object({
  score: z.number().min(0).max(1000).nullable().optional(),
  max: z.number().min(1).max(1000).nullable().optional(),
  passed: z.boolean().nullable().optional(),
});
const resultsSchema = z.object(Object.fromEntries(MODULES.map((m) => [m, moduleResult.nullable().optional()])) as Record<(typeof MODULES)[number], z.ZodOptional<z.ZodNullable<typeof moduleResult>>>);

const examBase = z.object({
  provider: z.enum(PROVIDERS as [string, ...string[]]),
  level,
  examDateId: z.string().trim().max(40).nullable().optional(),
  examDate: optDate,
  location: optText(200),
  registrationDeadline: optDate,
  registeredAt: optDate,
  status: z.enum(['PLANNED', 'REGISTERED', 'TAKEN', 'PASSED', 'FAILED', 'CANCELLED']).optional(),
  results: resultsSchema.nullable().optional(),
  passed: z.boolean().nullable().optional(),
  notes: optText(2000),
});
export const examCreateSchema = examBase.partial({ provider: true, level: true });
export const examUpdateSchema = examBase.partial();

export const examDateSchema = z.object({
  provider: z.enum(PROVIDERS as [string, ...string[]]),
  level: level.nullable().optional(),
  city: z.string().trim().min(1).max(80).default('Baku'),
  location: optText(200),
  examDate: dateLike,
  registrationDeadline: optDate,
  link: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => /^https?:\/\/\S+$/i.test(v), 'INVALID_URL')
    .nullable()
    .optional()
    .or(z.literal('')),
  notes: optText(500),
  published: z.boolean().optional(),
});
export const examDateUpdateSchema = examDateSchema.partial();

const isoOrNull = (d: Date | null) => d?.toISOString() ?? null;

const serializeCourse = (c: GermanCourse) => ({ ...c, startsAt: isoOrNull(c.startsAt), endsAt: isoOrNull(c.endsAt), createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() });
const serializeExam = (e: GermanExam) => {
  const { modules, passed } = evaluateResults(e.provider, parseResults(e.results), e.passed);
  return {
    ...e,
    results: modules,
    passed,
    examDate: isoOrNull(e.examDate),
    registrationDeadline: isoOrNull(e.registrationDeadline),
    registeredAt: isoOrNull(e.registeredAt),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
};
export const serializeExamDate = (d: GermanExamDate) => ({ ...d, examDate: d.examDate.toISOString(), registrationDeadline: isoOrNull(d.registrationDeadline), createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() });

/** The candidate's main case the certificate belongs to: the active one, else the latest. */
const mainCaseOf = async (userId: string) => {
  const cases = await prisma.case.findMany({
    where: { clientId: userId, parentCaseId: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, status: true, visaCategory: { select: { id: true, title: true, visaLabel: true, germanLevel: true } }, vacancy: { select: { germanLevel: true } } },
  });
  return cases.find((c) => !FINAL_STATUSES.includes(c.status)) ?? cases[0] ?? null;
};

// ─── Overview ──────────────────────────────────────────────────────────

export const germanOverview = async (userId: string, opts: { now?: Date; includeAllExamDates?: boolean } = {}) => {
  const now = opts.now ?? new Date();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, lastName: true, germanLevel: true, role: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  const [plan, courses, exams, examDates, kase] = await Promise.all([
    prisma.germanPlan.findUnique({ where: { userId } }),
    prisma.germanCourse.findMany({ where: { userId }, orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }] }),
    prisma.germanExam.findMany({ where: { userId }, orderBy: [{ examDate: 'desc' }, { createdAt: 'desc' }] }),
    prisma.germanExamDate.findMany({ where: { published: true, examDate: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } }, orderBy: { examDate: 'asc' }, take: 60 }),
    mainCaseOf(userId),
  ]);
  const certificates = await prisma.document.findMany({
    where: { case: { clientId: userId, parentCaseId: null }, requirement: { key: { in: LANGUAGE_CERT_KEYS } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, caseId: true, originalName: true, status: true, reviewNote: true, createdAt: true, stage: true },
  });
  const requiredLevel = kase?.vacancy?.germanLevel ?? kase?.visaCategory?.germanLevel ?? null;
  const current = user.germanLevel ?? 'none';
  const target = plan?.targetLevel ?? (requiredLevel && rank(requiredLevel) > 0 ? requiredLevel : 'B1');
  const percent = Math.max(0, Math.min(100, Math.round((rank(current) / Math.max(1, rank(target))) * 100)));

  type TimelineItem = { kind: 'course-start' | 'course-end' | 'deadline' | 'exam' | 'certificate'; date: string; refId: string; title: string; status: string; level: string | null };
  const timeline: TimelineItem[] = [];
  for (const c of courses) {
    if (c.startsAt) timeline.push({ kind: 'course-start', date: c.startsAt.toISOString(), refId: c.id, title: c.school, status: c.status, level: c.level });
    if (c.endsAt) timeline.push({ kind: 'course-end', date: c.endsAt.toISOString(), refId: c.id, title: c.school, status: c.status, level: c.level });
  }
  for (const e of exams) {
    const ev = serializeExam(e);
    if (e.registrationDeadline && e.status === 'PLANNED') timeline.push({ kind: 'deadline', date: e.registrationDeadline.toISOString(), refId: e.id, title: e.provider, status: e.status, level: e.level });
    if (e.examDate) timeline.push({ kind: 'exam', date: e.examDate.toISOString(), refId: e.id, title: e.provider, status: ev.passed === true ? 'PASSED' : ev.passed === false ? 'FAILED' : e.status, level: e.level });
  }
  for (const d of certificates) timeline.push({ kind: 'certificate', date: d.createdAt.toISOString(), refId: d.id, title: d.originalName, status: d.status, level: null });
  timeline.sort((a, b) => a.date.localeCompare(b.date));

  return {
    user: { id: user.id, firstName: user.firstName, lastName: user.lastName },
    level: current,
    levels: PROFILE_LEVELS,
    requiredLevel,
    meetsRequirement: requiredLevel ? rank(current) >= rank(requiredLevel) : null,
    plan: plan ? { targetLevel: plan.targetLevel, targetDate: isoOrNull(plan.targetDate), notes: plan.notes, updatedAt: plan.updatedAt.toISOString() } : null,
    progress: { current, target, percent },
    case: kase ? { id: kase.id, number: kase.number, status: kase.status, visaCategory: kase.visaCategory } : null,
    courses: courses.map(serializeCourse),
    exams: exams.map(serializeExam),
    examDates: examDates.map(serializeExamDate),
    certificates: certificates.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    timeline,
  };
};
export type GermanOverview = Awaited<ReturnType<typeof germanOverview>>;

// ─── Writes (scoped to one user) ──────────────────────────────────────

export const savePlan = async (userId: string, input: z.infer<typeof planSchema>) => {
  const data = { targetLevel: input.targetLevel ?? null, targetDate: toDate(input.targetDate) ?? null, notes: input.notes ?? null };
  return prisma.germanPlan.upsert({ where: { userId }, create: { userId, ...data }, update: data });
};

const courseData = (input: Partial<z.infer<typeof courseBase>>) => {
  const data: Prisma.GermanCourseUncheckedUpdateInput = {};
  if (input.school !== undefined) data.school = input.school;
  if (input.level !== undefined) data.level = input.level;
  if (input.startsAt !== undefined) data.startsAt = toDate(input.startsAt);
  if (input.endsAt !== undefined) data.endsAt = toDate(input.endsAt);
  for (const k of ['schedule', 'format', 'catalogCourseId', 'notes'] as const) if (input[k] !== undefined) data[k] = input[k] || null;
  if (input.status !== undefined) data.status = input.status;
  return data;
};

export const createCourse = async (userId: string, input: z.infer<typeof courseCreateSchema>, actorId: string) => {
  if (input.catalogCourseId && !(await prisma.languageCourse.count({ where: { id: input.catalogCourseId } }))) throw badRequest('UNKNOWN_CATALOG_COURSE');
  return prisma.germanCourse.create({ data: { ...(courseData(input) as Prisma.GermanCourseUncheckedCreateInput), userId, school: input.school, level: input.level, createdById: actorId } });
};

const ownCourse = async (userId: string, id: string) => {
  const c = await prisma.germanCourse.findUnique({ where: { id } });
  if (!c || c.userId !== userId) throw notFound('COURSE_NOT_FOUND');
  return c;
};

export const updateCourse = async (userId: string, id: string, input: z.infer<typeof courseUpdateSchema>) => {
  const before = await ownCourse(userId, id);
  const startsAt = input.startsAt !== undefined ? toDate(input.startsAt) : before.startsAt;
  const endsAt = input.endsAt !== undefined ? toDate(input.endsAt) : before.endsAt;
  if (startsAt && endsAt && endsAt < startsAt) throw badRequest('END_BEFORE_START');
  return prisma.germanCourse.update({ where: { id }, data: courseData(input) });
};

export const deleteCourse = async (userId: string, id: string) => {
  await ownCourse(userId, id);
  await prisma.germanCourse.delete({ where: { id } });
};

const examData = async (input: Partial<z.infer<typeof examBase>>, current?: GermanExam) => {
  const data: Prisma.GermanExamUncheckedUpdateInput = {};
  if (input.examDateId !== undefined) {
    data.examDateId = input.examDateId;
    if (input.examDateId) {
      // Picking a published date fills provider, date, place and deadline (explicit values win).
      const d = await prisma.germanExamDate.findUnique({ where: { id: input.examDateId } });
      if (!d) throw badRequest('UNKNOWN_EXAM_DATE');
      data.provider = d.provider;
      if (d.level) data.level = d.level;
      data.examDate = d.examDate;
      data.location = [d.location, d.city].filter(Boolean).join(', ') || null;
      data.registrationDeadline = d.registrationDeadline;
    }
  }
  if (input.provider !== undefined) data.provider = input.provider as GermanExam['provider'];
  if (input.level !== undefined) data.level = input.level;
  for (const k of ['examDate', 'registrationDeadline', 'registeredAt'] as const) if (input[k] !== undefined) data[k] = toDate(input[k]);
  for (const k of ['location', 'notes'] as const) if (input[k] !== undefined) data[k] = input[k] || null;
  if (input.status !== undefined) data.status = input.status;
  let clean: ExamResults | null = null;
  if (input.results !== undefined) {
    clean = {};
    for (const m of MODULES) {
      const r = input.results?.[m];
      if (r) clean[m] = { score: r.score ?? null, max: r.max ?? null, passed: r.passed ?? null };
    }
    data.results = Object.keys(clean).length ? (clean as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
  }
  if (input.passed !== undefined) data.passed = input.passed;
  // Status follows a known overall result; registering sets the date.
  const provider = (data.provider as GermanExam['provider'] | undefined) ?? current?.provider ?? 'OTHER';
  const results = clean ?? parseResults(current?.results);
  const explicit = input.passed !== undefined ? input.passed : (current?.passed ?? null);
  const { passed } = evaluateResults(provider, results, explicit);
  if (passed !== null && input.status === undefined && (input.results !== undefined || input.passed !== undefined)) data.status = passed ? 'PASSED' : 'FAILED';
  if ((data.status === 'REGISTERED' || input.status === 'REGISTERED') && !current?.registeredAt && input.registeredAt === undefined) data.registeredAt = new Date();
  return data;
};

export const createExam = async (userId: string, input: z.infer<typeof examCreateSchema>, actorId: string) => {
  const data = await examData(input);
  const provider = (data.provider as string | undefined) ?? input.provider;
  const lvl = (data.level as string | undefined) ?? input.level;
  if (!provider || !lvl) throw badRequest('PROVIDER_AND_LEVEL_REQUIRED');
  return prisma.germanExam.create({ data: { ...(data as Prisma.GermanExamUncheckedCreateInput), provider: provider as GermanExam['provider'], level: lvl, userId, createdById: actorId } });
};

const ownExam = async (userId: string, id: string) => {
  const e = await prisma.germanExam.findUnique({ where: { id } });
  if (!e || e.userId !== userId) throw notFound('EXAM_NOT_FOUND');
  return e;
};

export const updateExam = async (userId: string, id: string, input: z.infer<typeof examUpdateSchema>) => {
  const before = await ownExam(userId, id);
  return prisma.germanExam.update({ where: { id }, data: await examData(input, before) });
};

export const deleteExam = async (userId: string, id: string) => {
  await ownExam(userId, id);
  await prisma.germanExam.delete({ where: { id } });
};

export const getOwnExam = ownExam;

/**
 * Where an uploaded certificate goes: the language-certificate requirement of the candidate's main case
 * (the one of the stage open for uploads first), created as an optional INITIAL item when the case has none.
 */
export const certificateTarget = async (userId: string) => {
  const kase = await mainCaseOf(userId);
  if (!kase) throw conflict('NO_CASE');
  const reqs = await prisma.documentRequirement.findMany({ where: { caseId: kase.id, key: { in: LANGUAGE_CERT_KEYS } }, orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }] });
  const open = CLIENT_UPLOAD_STAGE[kase.status];
  const req = reqs.find((r) => r.stage === open) ?? reqs[0];
  if (req) return { caseId: kase.id, requirement: req };
  const def = DEFAULT_REQUIREMENTS.INITIAL.find((r) => r.key === 'LANGUAGE_CERT')!;
  const count = await prisma.documentRequirement.count({ where: { caseId: kase.id, stage: 'INITIAL' } });
  const created = await prisma.documentRequirement.create({ data: { caseId: kase.id, stage: 'INITIAL', key: 'LANGUAGE_CERT', title: def.title, required: false, sortOrder: count } });
  return { caseId: kase.id, requirement: created };
};

// ─── Exam dates (admin) ────────────────────────────────────────────────

export const examDateData = (input: Partial<z.infer<typeof examDateSchema>>) => {
  const data: Prisma.GermanExamDateUncheckedUpdateInput = {};
  if (input.provider !== undefined) data.provider = input.provider as GermanExamDate['provider'];
  if (input.level !== undefined) data.level = input.level;
  if (input.city !== undefined) data.city = input.city;
  if (input.examDate !== undefined) data.examDate = toDate(input.examDate)!;
  if (input.registrationDeadline !== undefined) data.registrationDeadline = toDate(input.registrationDeadline);
  for (const k of ['location', 'link', 'notes'] as const) if (input[k] !== undefined) data[k] = input[k] || null;
  if (input.published !== undefined) data.published = input.published;
  return data;
};
