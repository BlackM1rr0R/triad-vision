import type { GermanWord, GermanWordProgress, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import {
  buildSession,
  DAILY_GOAL,
  DAILY_NEW_WORDS,
  dayKey,
  addDays,
  isLearned,
  NEW_STATE,
  newWordLevels,
  recommendedLevel,
  review,
  streakOf,
  VOCAB_FIELDS,
  VOCAB_LEVELS,
} from './vocab.js';

/**
 * Vocabulary trainer of a candidate (portal "Alman dili" page, mobile app, staff case panel):
 * summary with streak and groups, today's session, recording a review.
 */

export const sessionQuerySchema = z.object({
  level: z.enum(VOCAB_LEVELS).optional(),
  field: z.enum(VOCAB_FIELDS).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const reviewSchema = z.object({ wordId: z.string().trim().min(1).max(40), grade: z.number().int().min(0).max(5) });

const ACTIVITY_DAYS = 14;

const translationsOf = (v: Prisma.JsonValue) => {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  return { az: s('az'), ru: s('ru'), en: s('en') };
};

const serializeWord = (w: GermanWord) => ({
  id: w.id,
  de: w.de,
  article: w.article,
  plural: w.plural,
  example: w.example,
  level: w.level,
  field: w.field,
  translations: translationsOf(w.translations),
});

/** Days until the next review per answer button, so the apps can label them ("in 6 days"). */
const preview = (p: Pick<GermanWordProgress, 'repetitions' | 'easiness' | 'intervalDays'> | null, now: Date) => {
  const s = p ?? NEW_STATE;
  return { again: 0, hard: review(s, 3, now).intervalDays, good: review(s, 4, now).intervalDays, easy: review(s, 5, now).intervalDays };
};

export const vocabSummary = async (userId: string, now = new Date()) => {
  const today = dayKey(now);
  const [user, words, progress, days] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { germanLevel: true } }),
    prisma.germanWord.findMany({ where: { published: true }, select: { id: true, level: true, field: true } }),
    prisma.germanWordProgress.findMany({ where: { userId, word: { published: true } }, select: { wordId: true, intervalDays: true, dueAt: true, lastReviewedAt: true } }),
    prisma.germanPracticeDay.findMany({ where: { userId, reviews: { gt: 0 } }, orderBy: { day: 'desc' }, take: 400 }),
  ]);
  if (!user) throw notFound('USER_NOT_FOUND');
  const byWord = new Map(progress.map((p) => [p.wordId, p]));
  const group = <K extends string>(keys: readonly K[], keyOf: (w: (typeof words)[number]) => string) =>
    keys.map((key) => {
      const ws = words.filter((w) => keyOf(w) === key);
      const ps = ws.map((w) => byWord.get(w.id)).filter((p) => !!p);
      return { key, total: ws.length, started: ps.length, learned: ps.filter(isLearned).length };
    });
  const todayRow = days.find((d) => d.day === today);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const activity = Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
    const day = addDays(today, i - ACTIVITY_DAYS + 1);
    const d = byDay.get(day);
    return { day, reviews: d?.reviews ?? 0, correct: d?.correct ?? 0, newWords: d?.newWords ?? 0 };
  });
  const last = progress.reduce<Date | null>((m, p) => (p.lastReviewedAt && (!m || p.lastReviewedAt > m) ? p.lastReviewedAt : m), null);
  return {
    profileLevel: user.germanLevel ?? 'none',
    recommendedLevel: recommendedLevel(user.germanLevel),
    streak: streakOf(days.map((d) => d.day), today),
    today: { day: today, reviews: todayRow?.reviews ?? 0, correct: todayRow?.correct ?? 0, newWords: todayRow?.newWords ?? 0, goal: DAILY_GOAL, newLimit: DAILY_NEW_WORDS },
    due: progress.filter((p) => p.dueAt <= now).length,
    total: words.length,
    started: progress.length,
    learned: progress.filter(isLearned).length,
    levels: group(VOCAB_LEVELS, (w) => w.level),
    fields: group(VOCAB_FIELDS, (w) => w.field),
    activity,
    totals: { reviews: days.reduce((s, d) => s + d.reviews, 0), correct: days.reduce((s, d) => s + d.correct, 0), days: days.length },
    lastPracticeAt: last?.toISOString() ?? null,
  };
};
export type VocabSummary = Awaited<ReturnType<typeof vocabSummary>>;

/** Today's cards: due reviews, then new words (profile level and the next, or the chosen level / field). */
export const vocabSession = async (userId: string, q: z.infer<typeof sessionQuerySchema>, now = new Date()) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { germanLevel: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  const wordWhere: Prisma.GermanWordWhereInput = { published: true, ...(q.level ? { level: q.level } : {}), ...(q.field ? { field: q.field } : {}) };
  const [due, dueTotal, todayRow] = await Promise.all([
    prisma.germanWordProgress.findMany({ where: { userId, dueAt: { lte: now }, word: wordWhere }, include: { word: true }, orderBy: { dueAt: 'asc' }, take: q.limit }),
    prisma.germanWordProgress.count({ where: { userId, dueAt: { lte: now }, word: { published: true } } }),
    prisma.germanPracticeDay.findUnique({ where: { userId_day: { userId, day: dayKey(now) } } }),
  ]);
  const fresh = await prisma.germanWord.findMany({
    where: { ...wordWhere, ...(q.level ? {} : { level: { in: newWordLevels(user.germanLevel) } }), progress: { none: { userId } } },
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
    take: q.limit,
  });
  const { reviews, news } = buildSession(due, fresh, { limit: q.limit, newToday: todayRow?.newWords ?? 0 });
  const cards = [
    ...reviews.map((p) => ({ ...serializeWord(p.word), state: 'review' as const, repetitions: p.repetitions, intervalDays: p.intervalDays, preview: preview(p, now) })),
    ...news.map((w) => ({ ...serializeWord(w), state: 'new' as const, repetitions: 0, intervalDays: 0, preview: preview(null, now) })),
  ];
  return { cards, dueTotal, newLeft: Math.max(0, DAILY_NEW_WORDS - (todayRow?.newWords ?? 0)) };
};

/** Records one answer: SM-2 state of the word and the day's practice counters. */
export const recordReview = async (userId: string, input: z.infer<typeof reviewSchema>, now = new Date()) => {
  const word = await prisma.germanWord.findUnique({ where: { id: input.wordId } });
  if (!word || !word.published) throw notFound('WORD_NOT_FOUND');
  const before = await prisma.germanWordProgress.findUnique({ where: { userId_wordId: { userId, wordId: word.id } } });
  const next = review(before ?? NEW_STATE, input.grade, now);
  const state = { repetitions: next.repetitions, easiness: next.easiness, intervalDays: next.intervalDays, dueAt: next.dueAt, lastGrade: input.grade, lastReviewedAt: now };
  const ok = next.correct ? 1 : 0;
  const lapse = !next.correct && before && before.repetitions > 0 ? 1 : 0;
  const day = dayKey(now);
  const [progress] = await prisma.$transaction([
    prisma.germanWordProgress.upsert({
      where: { userId_wordId: { userId, wordId: word.id } },
      create: { userId, wordId: word.id, ...state, reviews: 1, correct: ok, lapses: 0 },
      update: { ...state, reviews: { increment: 1 }, correct: { increment: ok }, lapses: { increment: lapse } },
    }),
    prisma.germanPracticeDay.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, reviews: 1, correct: ok, newWords: before ? 0 : 1 },
      update: { reviews: { increment: 1 }, correct: { increment: ok }, newWords: { increment: before ? 0 : 1 } },
    }),
  ]);
  return {
    progress: { wordId: word.id, repetitions: progress.repetitions, intervalDays: progress.intervalDays, easiness: progress.easiness, dueAt: progress.dueAt.toISOString(), learned: isLearned(progress) },
    correct: next.correct,
    summary: await vocabSummary(userId, now),
  };
};

/** Staff view: vocabulary summary plus the latest self-test attempts. */
export const practiceForStaff = async (userId: string, now = new Date()) => {
  const [vocab, attempts] = await Promise.all([
    vocabSummary(userId, now),
    prisma.germanTestAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);
  return { vocab, attempts: attempts.map((a) => ({ id: a.id, estimated: a.estimated, correct: a.correct, total: a.total, percent: a.percent, levels: a.levels, createdAt: a.createdAt.toISOString() })) };
};
