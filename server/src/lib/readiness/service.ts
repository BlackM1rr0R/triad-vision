import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { itemState } from '../account/docChecklist.js';
import { cvCompleteness, readCv } from '../cv/schema.js';
import { HOUSING_STEPS, ticks } from '../housing/core.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { computeReadiness, readMoney, type DocState, type HousingSignal, type MoneyAnswers, type ReadinessFacts } from './score.js';

/**
 * Facts for the readiness score (lib/readiness/score.ts) of one client — only the client's own data:
 * profile + German progress, the main application (newest non-closed main case, else the newest approved one),
 * its document requirements (doc checklist states), CV, recognition, housing / arrival plan / the employer's
 * HOUSING checklist item, and the money self-check. GET also stores one snapshot per day (trend line).
 */

const HISTORY_DAYS = 120;
const DAY = 24 * 60 * 60 * 1000;
const today = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

const mainCase = (userId: string) =>
  prisma.case.findFirst({
    where: { clientId: userId, parentCaseId: null, status: { notIn: ['REJECTED', 'CANCELLED'] } },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      status: true,
      requirements: { where: { required: true }, select: { id: true, documents: { select: { status: true } } } },
      housing: { select: { housingSteps: true, contractUploadedAt: true, anmeldungDoneAt: true } },
      arrivalPlan: { select: { status: true, housingStatus: true } },
      employerArrivalItems: { where: { key: 'HOUSING' }, select: { done: true } },
    },
  });

export const readinessFacts = async (userId: string): Promise<{ facts: ReadinessFacts; caseId: string | null }> => {
  const [user, exams, test, courses, c, cv, recognition, self] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { germanLevel: true, recognitionStatus: true, birthDate: true, address: true, phone: true, nationality: true } }),
    prisma.germanExam.findMany({ where: { userId }, select: { level: true, status: true, passed: true } }),
    prisma.germanTestAttempt.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { estimated: true } }),
    prisma.germanCourse.count({ where: { userId, status: 'ACTIVE' } }),
    mainCase(userId),
    prisma.candidateCv.findUnique({ where: { userId }, select: { data: true } }),
    prisma.recognitionProcess.findFirst({ where: { clientId: userId }, orderBy: { updatedAt: 'desc' }, select: { status: true } }),
    prisma.readinessSelfCheck.findUnique({ where: { userId } }),
  ]);

  const passed = exams.filter((e) => e.passed === true || e.status === 'PASSED').map((e) => e.level);
  const examLevel = [...passed].sort().pop() ?? null;
  const examBooked = exams.some((e) => e.status === 'PLANNED' || e.status === 'REGISTERED');

  const approved = c?.status === 'APPROVED';
  const required: DocState[] = (c?.requirements ?? []).map((r) => {
    const s = itemState(r.documents);
    return s === 'accepted' ? 'accepted' : s === 'review' ? 'review' : 'missing';
  });

  const signals: HousingSignal[] = [];
  if (c?.housing?.anmeldungDoneAt) signals.push('ANMELDUNG_DONE');
  const plan = c?.arrivalPlan && c.arrivalPlan.status !== 'CANCELLED' ? c.arrivalPlan : null;
  if (plan?.housingStatus === 'ARRANGED' || c?.employerArrivalItems.some((i) => i.done)) signals.push('ARRANGED');
  if (plan?.housingStatus === 'OFFERED') signals.push('OFFERED');
  if (c?.housing?.contractUploadedAt) signals.push('CONTRACT');
  if (plan?.housingStatus === 'SEARCHING' || plan?.housingStatus === 'REQUESTED') signals.push('SEARCHING');
  const stepTicks = ticks(c?.housing?.housingSteps ?? null);
  const stepsDone = HOUSING_STEPS.filter((s) => stepTicks[s]).length;

  const facts: ReadinessFacts = {
    german: { profile: user?.germanLevel ?? null, exam: examLevel, test: test?.estimated ?? null, activeCourse: courses > 0, examBooked },
    documents: { hasCase: !!c, approved, required },
    skills: {
      cvPercent: cv ? cvCompleteness(readCv(cv.data), user ?? {}) : 0,
      hasCv: !!cv,
      recognition: recognition?.status ?? user?.recognitionStatus ?? null,
    },
    housing: { signals, stepsDone, stepsTotal: HOUSING_STEPS.length, approved },
    money: readMoney(self?.answers),
  };
  return { facts, caseId: c?.id ?? null };
};

/** Score + history; stores today's snapshot (not while staff view the portal as the client). */
export const readinessFor = async (userId: string, now = new Date()) => {
  const { facts, caseId } = await readinessFacts(userId);
  const r = computeReadiness(facts);
  const day = today(now);
  if (!isImpersonating()) {
    const parts = Object.fromEntries(r.parts.map((p) => [p.key, p.score])) as Prisma.InputJsonValue;
    await prisma.readinessSnapshot.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, score: r.score, parts },
      update: { score: r.score, parts },
    });
  }
  const history = await prisma.readinessSnapshot.findMany({
    where: { userId, day: { gte: new Date(day.getTime() - HISTORY_DAYS * DAY) } },
    orderBy: { day: 'asc' },
    select: { day: true, score: true },
  });
  return {
    score: r.score,
    parts: r.parts,
    history: history.map((h) => ({ day: h.day.toISOString().slice(0, 10), score: h.score })),
    money: facts.money,
    caseId,
  };
};

export const saveMoney = async (userId: string, answers: MoneyAnswers) => {
  const current = readMoney((await prisma.readinessSelfCheck.findUnique({ where: { userId } }))?.answers);
  const merged = { ...current, ...answers } as Prisma.InputJsonValue;
  await prisma.readinessSelfCheck.upsert({ where: { userId }, create: { userId, answers: merged }, update: { answers: merged } });
};

/** DSGVO export (lib/privacy): score history and the self-check answers. */
export const readinessExport = async (userId: string) => ({
  snapshots: await prisma.readinessSnapshot.findMany({ where: { userId }, orderBy: { day: 'asc' }, select: { day: true, score: true, parts: true } }),
  selfCheck: (await prisma.readinessSelfCheck.findUnique({ where: { userId }, select: { answers: true, updatedAt: true } })) ?? null,
});
