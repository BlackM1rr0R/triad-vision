import type { CaseStatus, Prisma, VisaType, WaitingRoomItem, WaitingRoomProgress } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * Client "waiting room": short lessons, videos, exercises and checklists to use the waiting time
 * (life in Germany, work culture, bureaucracy, A1 phrases). Items can be limited to visa types and
 * case statuses (null / empty = everyone). Exercise answers stay on the server: the client gets the
 * questions, sends its choices and the server grades them.
 */

export const WR_KINDS = ['LESSON', 'VIDEO', 'EXERCISE', 'CHECKLIST'] as const;
export type WaitingRoomKind = (typeof WR_KINDS)[number];
export const WR_TOPICS = ['life', 'work', 'language', 'bureaucracy', 'culture'] as const;
export type WaitingRoomTopic = (typeof WR_TOPICS)[number];
export const WR_VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const satisfies readonly VisaType[];
export const WR_STAGES = [
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const satisfies readonly CaseStatus[];

/** Points: every finished item, plus up to 10 for an exercise score of 100 %. */
export const POINTS_PER_ITEM = 10;

export type L10n = { az: string; de: string; en: string; ru: string };
export interface ExerciseQuestion {
  q: L10n;
  options: L10n[];
  answer: number;
}

const listOf = (v: Prisma.JsonValue | null): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Item fits a case: no limits, or the case's visa type / status is listed. No case = only unlimited items. */
export const fitsCase = (item: Pick<WaitingRoomItem, 'visaTypes' | 'stages'>, c: { visaType: VisaType; status: CaseStatus } | null) => {
  const visas = listOf(item.visaTypes);
  const stages = listOf(item.stages);
  if (!c) return !visas.length && !stages.length;
  return (!visas.length || visas.includes(c.visaType)) && (!stages.length || stages.includes(c.status));
};

export const exerciseOf = (item: Pick<WaitingRoomItem, 'exercise'>): ExerciseQuestion[] =>
  Array.isArray(item.exercise) ? (item.exercise as unknown as ExerciseQuestion[]).filter((q) => q && Array.isArray(q.options)) : [];

/** Client view of an item: exercise questions without the right answers. */
export const clientItem = (item: WaitingRoomItem) => ({
  id: item.id,
  kind: item.kind,
  topic: item.topic,
  title: item.title,
  body: item.body,
  videoUrl: item.videoUrl,
  minutes: item.minutes,
  exercise: item.kind === 'EXERCISE' ? exerciseOf(item).map((q) => ({ q: q.q, options: q.options })) : null,
});

/** Grades exercise answers: per question right / wrong plus the right option (instant feedback). */
export const gradeExercise = (questions: ExerciseQuestion[], answers: (number | null)[]) => {
  const results = questions.map((q, i) => ({ correct: answers[i] === q.answer, answer: q.answer, chosen: answers[i] ?? null }));
  const right = results.filter((r) => r.correct).length;
  return { results, right, total: questions.length, score: questions.length ? Math.round((right / questions.length) * 100) : 0 };
};

/** The client's newest open main case (visa type + status decide which items fit). */
export const activeCaseOf = (userId: string) =>
  prisma.case.findFirst({
    where: { clientId: userId, closedAt: null },
    orderBy: [{ parentCaseId: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, visaType: true, status: true },
  });

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Points and streak: the streak counts consecutive days (UTC) with at least one finished item, ending
 * today or yesterday (a streak survives until the end of the next day).
 */
export const progressStats = (rows: Pick<WaitingRoomProgress, 'completedAt' | 'score' | 'updatedAt'>[], totalItems: number, now = new Date()) => {
  const done = rows.filter((r) => r.completedAt);
  const points = done.reduce((sum, r) => sum + POINTS_PER_ITEM + (r.score != null ? Math.round(r.score / 10) : 0), 0);
  const days = new Set<string>();
  for (const r of rows) {
    if (r.completedAt) days.add(dayKey(r.completedAt));
    // Re-doing an exercise on another day keeps the streak alive too.
    if (r.completedAt && r.updatedAt) days.add(dayKey(r.updatedAt));
  }
  let streak = 0;
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!days.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { completed: done.length, total: totalItems, points, streak, percent: totalItems ? Math.round((done.length / totalItems) * 100) : 0 };
};

export interface StarterItem {
  kind: WaitingRoomKind;
  topic: WaitingRoomTopic;
  title: L10n;
  body?: L10n;
  videoUrl?: string;
  exercise?: ExerciseQuestion[];
  minutes: number;
  visaTypes?: VisaType[];
  stages?: CaseStatus[];
}

/**
 * Loads the starter set (lib/waitingRoom/starter.ts). Idempotent: an item whose German title already
 * exists is skipped, so the action can be repeated after editing or deleting items.
 */
export const loadStarterContent = async (items: StarterItem[]) => {
  const existing = await prisma.waitingRoomItem.findMany({ select: { title: true } });
  const titles = new Set(existing.map((e) => (e.title as Partial<L10n>)?.de?.trim().toLowerCase()).filter(Boolean));
  const base = ((await prisma.waitingRoomItem.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
  let created = 0;
  for (const [i, it] of items.entries()) {
    if (titles.has(it.title.de.trim().toLowerCase())) continue;
    await prisma.waitingRoomItem.create({
      data: {
        kind: it.kind,
        topic: it.topic,
        title: it.title,
        body: it.body ?? undefined,
        videoUrl: it.videoUrl ?? null,
        exercise: it.exercise ? (it.exercise as unknown as Prisma.InputJsonValue) : undefined,
        minutes: it.minutes,
        visaTypes: it.visaTypes?.length ? it.visaTypes : undefined,
        stages: it.stages?.length ? it.stages : undefined,
        sortOrder: base + i,
        published: true,
      },
    });
    created++;
  }
  return { created, skipped: items.length - created };
};
