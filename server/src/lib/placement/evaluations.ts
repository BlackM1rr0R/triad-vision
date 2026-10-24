import type { InterviewEvaluation, Locale } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { evaluationText } from './texts.js';

/**
 * Structured interview evaluations. After an interview (its start time passed, or status DONE) the employer
 * (company portal) and staff fill in one evaluation each per interview: overall 1–5, five criteria 1–5, a
 * recommendation and free-text strengths / concerns / notes. Writing again updates the author's own one.
 * The candidate card shows them with averages; candidates never see them.
 */

export const EVAL_CRITERIA = ['german', 'skills', 'experience', 'motivation', 'communication'] as const;
export type EvalCriterion = (typeof EVAL_CRITERIA)[number];
export const RECOMMENDATIONS = ['HIRE', 'MAYBE', 'NO'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

const rating = z.number().int().min(1).max(5);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

export const evaluationInput = z.object({
  overall: rating,
  scores: z.object(Object.fromEntries(EVAL_CRITERIA.map((k) => [k, rating])) as Record<EvalCriterion, typeof rating>),
  recommendation: z.enum(RECOMMENDATIONS),
  strengths: text(3000),
  concerns: text(3000),
  notes: text(3000),
});
export type EvaluationInput = z.infer<typeof evaluationInput>;

/** An interview can be evaluated once it started (or was marked DONE); never when cancelled / no-show. */
export const canEvaluate = (i: { status: string; startsAt: Date }, now = Date.now()) =>
  i.status === 'DONE' || ((i.status === 'CONFIRMED' || i.status === 'PROPOSED') && i.startsAt.getTime() <= now);

const scoresOf = (v: unknown): Record<EvalCriterion, number | null> => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return Object.fromEntries(EVAL_CRITERIA.map((k) => [k, typeof o[k] === 'number' ? (o[k] as number) : null])) as Record<EvalCriterion, number | null>;
};

export const evaluationView = (e: InterviewEvaluation) => ({
  id: e.id,
  interviewId: e.interviewId,
  candidateId: e.candidateId,
  authorKind: e.authorKind as 'EMPLOYER' | 'STAFF',
  authorId: e.authorId,
  authorName: e.authorName,
  overall: e.overall,
  scores: scoresOf(e.scores),
  recommendation: e.recommendation as Recommendation,
  strengths: e.strengths,
  concerns: e.concerns,
  notes: e.notes,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});
export type EvaluationView = ReturnType<typeof evaluationView>;

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Averages over a set of evaluations (overall, per criterion) and the recommendation counts. */
export const evaluationSummary = (items: Pick<EvaluationView, 'overall' | 'scores' | 'recommendation'>[]) => ({
  count: items.length,
  overall: avg(items.map((e) => e.overall)),
  scores: Object.fromEntries(EVAL_CRITERIA.map((k) => [k, avg(items.map((e) => e.scores[k]).filter((n): n is number => n !== null))])) as Record<EvalCriterion, number | null>,
  recommendations: Object.fromEntries(RECOMMENDATIONS.map((r) => [r, items.filter((e) => e.recommendation === r).length])) as Record<Recommendation, number>,
});

/** Creates or updates the author's own evaluation of an interview. */
export const saveEvaluation = async (
  interview: { id: string; candidateId: string },
  author: { kind: 'EMPLOYER' | 'STAFF'; id: string; name: string },
  input: EvaluationInput,
) => {
  const data = {
    overall: input.overall,
    scores: input.scores,
    recommendation: input.recommendation,
    strengths: input.strengths ?? null,
    concerns: input.concerns ?? null,
    notes: input.notes ?? null,
    authorName: author.name.slice(0, 160),
  };
  const existing = await prisma.interviewEvaluation.findFirst({ where: { interviewId: interview.id, authorId: author.id } });
  const row = existing
    ? await prisma.interviewEvaluation.update({ where: { id: existing.id }, data })
    : await prisma.interviewEvaluation.create({ data: { ...data, interviewId: interview.id, candidateId: interview.candidateId, authorKind: author.kind, authorId: author.id } });
  return { evaluation: evaluationView(row), created: !existing };
};

export const evaluationsOfInterview = async (interviewId: string, onlyAuthorKind?: 'EMPLOYER' | 'STAFF', onlyAuthorIds?: string[]) => {
  const rows = await prisma.interviewEvaluation.findMany({
    where: { interviewId, ...(onlyAuthorKind ? { authorKind: onlyAuthorKind } : {}), ...(onlyAuthorIds ? { authorId: { in: onlyAuthorIds } } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(evaluationView);
};

/** Every evaluation of a candidate with the interview's time / company / vacancy, plus averages. */
export const candidateEvaluations = async (candidateId: string) => {
  const rows = await prisma.interviewEvaluation.findMany({ where: { candidateId }, orderBy: { createdAt: 'desc' }, take: 200 });
  const interviews = await prisma.interview.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.interviewId))] } },
    select: { id: true, startsAt: true, status: true, company: { select: { id: true, name: true } }, application: { select: { vacancy: { select: { id: true, title: true } } } } },
  });
  const byId = new Map(interviews.map((i) => [i.id, i]));
  const items = rows.map((r) => {
    const i = byId.get(r.interviewId);
    return { ...evaluationView(r), interview: i ? { id: i.id, startsAt: i.startsAt, status: i.status, company: i.company, vacancy: i.application?.vacancy ?? null } : null };
  });
  return {
    items,
    summary: evaluationSummary(items),
    byAuthor: { EMPLOYER: evaluationSummary(items.filter((e) => e.authorKind === 'EMPLOYER')), STAFF: evaluationSummary(items.filter((e) => e.authorKind === 'STAFF')) },
  };
};

/** Tells the interview's staff owner (or its creator, when staff) that an employer evaluated the candidate. */
export const notifyEvaluation = async (
  interview: { staffId: string | null; createdById: string | null; candidateId: string; createdBy?: { role: string } | null; candidate: { firstName: string; lastName: string } },
  author: { id: string; name: string },
  input: EvaluationInput,
) => {
  const target = interview.staffId ?? (interview.createdBy && !['CLIENT', 'COMPANY'].includes(interview.createdBy.role) ? interview.createdById : null);
  if (!target || target === author.id) return;
  const u = await prisma.user.findUnique({ where: { id: target }, select: { locale: true } });
  if (!u) return;
  const t = evaluationText(u.locale as Locale, { candidate: `${interview.candidate.firstName} ${interview.candidate.lastName}`.trim(), author: author.name, overall: input.overall, recommendation: input.recommendation });
  await notifyUser(target, { type: 'INTERVIEW_EVALUATION', title: t.title, body: t.body, link: `/admin/candidates?id=${interview.candidateId}`, email: false });
};
