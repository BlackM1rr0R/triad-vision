import crypto from 'node:crypto';
import type { Prisma, ReadyCertificate } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { HttpError, badRequest, conflict } from '../http.js';
import { isLearned } from '../german/vocab.js';
import { highestLevel } from '../badges/rules.js';
import { readinessFacts } from '../readiness/service.js';
import { computeReadiness } from '../readiness/score.js';
import { currentConsents } from '../privacy/consents.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { notifyUser } from '../notifications.js';
import {
  CHALLENGES,
  challengeForWeek,
  challengeOrder,
  cleanResult,
  evaluateChallenge,
  isoWeek,
  levelRank,
  practiceBand,
  readinessBand,
  sceneForProfession,
  summarize,
  type ReadyLevel,
  type ResultInput,
  type StoredResult,
} from './logic.js';
import { READY_TEXTS, asReadyLocale } from './texts.js';

/**
 * "Germany Ready" (client portal /account/germany-ready): synced practice results, the points overview, the weekly
 * challenge, the practice certificate (public check /ready-certificate/:code) and the employer readiness profile.
 * "View as client" (impersonation) never stores anything here.
 */

export const CHALLENGE_ORDER_KEY = 'readyProgress:challengeOrder';
/** Rows one client may add per 24 hours (on top of the per-minute rate limit of the route). */
export const DAILY_RESULT_CAP = 400;
export const READY_CODE_RE = /^[A-Z2-9]{12}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (n: number) => Array.from(crypto.randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join('');
export const readyVerifyUrl = (code: string) => `${config.clientUrl.replace(/\/+$/, '')}/ready-certificate/${code}`;

// ─── Sync ───────────────────────────────────────────────────────────────

/** Stores validated results; a resend of the same completion is skipped (unique key). 400 on the first bad row. */
export const syncResults = async (userId: string, inputs: ResultInput[], now = new Date()) => {
  const rows = inputs.map((r) => {
    const c = cleanResult(r, now);
    if (typeof c === 'string') throw badRequest(c);
    return c;
  });
  const recent = await prisma.readyActivityResult.count({ where: { userId, createdAt: { gte: new Date(now.getTime() - 86_400_000) } } });
  if (recent + rows.length > DAILY_RESULT_CAP) throw new HttpError(429, 'READY_DAILY_LIMIT');
  const r = await prisma.readyActivityResult.createMany({ data: rows.map((x) => ({ ...x, userId })), skipDuplicates: true });
  return { received: rows.length, stored: r.count, duplicates: rows.length - r.count };
};

// ─── Overview ───────────────────────────────────────────────────────────

const loadResults = async (userId: string, since?: Date): Promise<StoredResult[]> =>
  prisma.readyActivityResult.findMany({
    where: { userId, ...(since ? { completedAt: { gte: since } } : {}) },
    orderBy: { completedAt: 'desc' },
    take: 5000,
    select: { activityId: true, item: true, score: true, max: true, percent: true, completedAt: true },
  });

const serverFacts = async (userId: string) => {
  const [learned, readiness] = await Promise.all([
    prisma.germanWordProgress.findMany({ where: { userId, word: { published: true } }, select: { intervalDays: true } }),
    readinessFacts(userId).then(({ facts }) => computeReadiness(facts).score),
  ]);
  return { wordsLearned: learned.filter(isLearned).length, readinessScore: readiness };
};

export const readChallengeOrder = async () => challengeOrder((await prisma.setting.findUnique({ where: { key: CHALLENGE_ORDER_KEY } }))?.value);

/** This week's challenge with the client's progress; a completed one is recorded once (badge counter). */
export const weeklyChallenge = async (userId: string, now = new Date(), results?: StoredResult[]) => {
  const order = await readChallengeOrder();
  const c = challengeForWeek(now, order);
  const w = isoWeek(now);
  const week = (results ?? (await loadResults(userId, w.start))).filter((r) => r.completedAt >= w.start && r.completedAt < w.end);
  const vocabNew = c.kind === 'vocabNew' ? await prisma.germanWordProgress.count({ where: { userId, createdAt: { gte: w.start, lt: w.end } } }) : 0;
  const p = evaluateChallenge(c, week, vocabNew);
  if (p.done && !isImpersonating()) {
    await prisma.readyChallengeCompletion.createMany({ data: [{ userId, week: w.key, challengeKey: c.key, completedAt: now }], skipDuplicates: true });
  }
  const completed = await prisma.readyChallengeCompletion.count({ where: { userId } });
  return { key: c.key, activityIds: c.activityIds, item: c.item ?? null, week: w.key, endsAt: w.end.toISOString(), ...p, completedTotal: completed };
};

const issueOrUpgrade = async (userId: string, level: ReadyLevel, points: number, activities: number, now: Date): Promise<{ cert: ReadyCertificate; changed: boolean }> => {
  const existing = await prisma.readyCertificate.findUnique({ where: { userId } });
  if (existing) {
    if (existing.revokedAt) return { cert: existing, changed: false };
    if (levelRank(level) > levelRank(existing.level)) {
      return { cert: await prisma.readyCertificate.update({ where: { id: existing.id }, data: { level, points, activities, levelAt: now } }), changed: true };
    }
    if (existing.points !== points || existing.activities !== activities) {
      return { cert: await prisma.readyCertificate.update({ where: { id: existing.id }, data: { points: Math.max(points, existing.points), activities: Math.max(activities, existing.activities) } }), changed: false };
    }
    return { cert: existing, changed: false };
  }
  const year = now.getUTCFullYear();
  for (let i = 0; i < 6; i++) {
    try {
      const cert = await prisma.readyCertificate.create({ data: { userId, level, points, activities, number: `GR-${year}-${randomCode(6)}`, code: randomCode(12), issuedAt: now, levelAt: now } });
      return { cert, changed: true };
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const again = await prisma.readyCertificate.findUnique({ where: { userId } });
      if (again) return { cert: again, changed: false };
    }
  }
  throw conflict('CERTIFICATE_NUMBER_EXHAUSTED');
};

export const certificateView = (c: ReadyCertificate | null) =>
  c
    ? { number: c.number, level: c.level, points: c.points, activities: c.activities, issuedAt: c.issuedAt, levelAt: c.levelAt, revoked: !!c.revokedAt, verifyUrl: c.revokedAt ? null : readyVerifyUrl(c.code) }
    : null;

/** Everything the portal page shows; issues / upgrades the certificate when a level is reached. */
export const readyOverview = async (userId: string, now = new Date()) => {
  const [results, facts, user] = await Promise.all([loadResults(userId), serverFacts(userId), prisma.user.findUnique({ where: { id: userId }, select: { profession: true, locale: true } })]);
  const s = summarize(results, facts);
  let cert = await prisma.readyCertificate.findUnique({ where: { userId } });
  if (s.level && !isImpersonating()) {
    const r = await issueOrUpgrade(userId, s.level, s.points, s.done, now);
    cert = r.cert;
    if (r.changed) {
      const T = READY_TEXTS[asReadyLocale(user?.locale)];
      await notifyUser(userId, { type: 'READY_CERTIFICATE', title: T.notifyTitle, body: T.notifyBody(T.level[s.level]), link: '/account/germany-ready', email: false });
    }
  }
  return {
    ...s,
    readinessScore: facts.readinessScore,
    wordsLearned: facts.wordsLearned,
    professionScene: sceneForProfession(user?.profession),
    challenge: await weeklyChallenge(userId, now, results),
    certificate: certificateView(cert),
  };
};

/** Small summary for the dashboard card: points, level and this week's challenge. */
export const readySummary = async (userId: string, now = new Date()) => {
  const o = await readyOverview(userId, now);
  return { points: o.points, maxPoints: o.maxPoints, done: o.done, level: o.level, next: o.next, challenge: o.challenge, certificate: o.certificate };
};

// ─── Certificate PDF / public check / staff ─────────────────────────────

export const certificateForPdf = async (userId: string) => {
  const [cert, user] = await Promise.all([prisma.readyCertificate.findUnique({ where: { userId } }), prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } })]);
  if (!cert || !user) return null;
  return { cert, fullName: `${user.firstName} ${user.lastName}`.replace(/\s+/g, ' ').trim() };
};

const initials = (firstName: string, lastName: string) =>
  [firstName, lastName]
    .map((s) => s.trim()[0]?.toLocaleUpperCase('az'))
    .filter(Boolean)
    .map((c) => `${c}.`)
    .join(' ');

/** Public check: initials, date, level and activity count — nothing else. Revoked → { revoked }. */
export const verifyReadyCertificate = async (code: string) => {
  if (!READY_CODE_RE.test(code)) return null;
  const cert = await prisma.readyCertificate.findUnique({ where: { code } });
  if (!cert) return null;
  if (cert.revokedAt) return { valid: false as const, revoked: true as const };
  const user = await prisma.user.findUnique({ where: { id: cert.userId }, select: { firstName: true, lastName: true } });
  if (!user) return null;
  return { valid: true as const, revoked: false as const, number: cert.number, holder: initials(user.firstName, user.lastName), date: cert.levelAt.toISOString().slice(0, 10), level: cert.level, activities: cert.activities };
};

export const staffCertificateView = (c: ReadyCertificate | null) =>
  c ? { id: c.id, userId: c.userId, number: c.number, level: c.level, points: c.points, activities: c.activities, issuedAt: c.issuedAt, levelAt: c.levelAt, revokedAt: c.revokedAt, revokeReason: c.revokeReason, verifyUrl: readyVerifyUrl(c.code) } : null;

export const setReadyRevoked = async (id: string, revoked: boolean, staffId: string, reason?: string | null) => {
  const cert = await prisma.readyCertificate.findUnique({ where: { id } });
  if (!cert) return null;
  return prisma.readyCertificate.update({
    where: { id },
    data: revoked ? { revokedAt: cert.revokedAt ?? new Date(), revokedById: staffId, revokeReason: reason?.trim() || null } : { revokedAt: null, revokedById: null, revokeReason: null },
  });
};

// ─── Employer readiness profile (consent-gated) ─────────────────────────

export const READINESS_CONSENT = 'READINESS_PROFILE' as const;
export const readinessProfileAllowed = async (userId: string) => (await currentConsents(userId))[READINESS_CONSENT]?.granted === true;

const MOCK_LEVEL = { 'mock-b1': 'B1', 'mock-a1': 'A1' } as const;

/** Full card for the company's own worker — null without the client's consent. */
export const readinessProfile = async (userId: string) => {
  if (!(await readinessProfileAllowed(userId))) return null;
  const [results, facts, user, attempts, exams, cert] = await Promise.all([
    loadResults(userId),
    serverFacts(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { germanLevel: true, profession: true } }),
    prisma.germanTestAttempt.findMany({ where: { userId }, select: { estimated: true } }),
    prisma.germanExam.findMany({ where: { userId, passed: true }, select: { level: true } }),
    prisma.readyCertificate.findUnique({ where: { userId } }),
  ]);
  const s = summarize(results, facts);
  let mock: { level: 'A1' | 'B1'; module: string; percent: number } | null = null;
  for (const id of ['mock-b1', 'mock-a1'] as const) {
    const rows = results.filter((r) => r.activityId === id);
    if (!rows.length) continue;
    const best = rows.reduce((a, b) => (b.percent > a.percent ? b : a));
    mock = { level: MOCK_LEVEL[id], module: best.item, percent: best.percent };
    break;
  }
  const scene = sceneForProfession(user?.profession);
  const sceneBest = scene ? results.filter((r) => r.activityId === 'work-scenes' && r.item === scene).reduce((m, r) => Math.max(m, r.percent), -1) : -1;
  const interview = s.activities.find((a) => a.id === 'interview-prep')!;
  return {
    readinessScore: facts.readinessScore,
    germanLevel: highestLevel(user?.germanLevel, ...attempts.map((a) => a.estimated), ...exams.map((e) => e.level)),
    mockExam: mock,
    germanyReady: cert && !cert.revokedAt ? (cert.level as ReadyLevel) : null,
    workScene: scene ? { id: scene, percent: sceneBest >= 0 ? sceneBest : null, passed: sceneBest >= 80 } : null,
    interviewPractised: interview.attempts > 0,
    interviewDone: interview.done,
    activitiesDone: s.done,
  };
};

/** Anonymous pool view: bands only — null without consent. */
export const readinessBands = async (userId: string) => {
  if (!(await readinessProfileAllowed(userId))) return null;
  const [results, facts, cert] = await Promise.all([loadResults(userId), serverFacts(userId), prisma.readyCertificate.findUnique({ where: { userId }, select: { revokedAt: true } })]);
  const s = summarize(results, facts);
  return { readinessBand: readinessBand(facts.readinessScore), practiceBand: practiceBand(s.done), germanyReady: !!cert && !cert.revokedAt };
};

// ─── Admin: challenge pool order ────────────────────────────────────────

export const setChallengeOrder = async (order: string[]) => {
  const clean = challengeOrder(order);
  await prisma.setting.upsert({ where: { key: CHALLENGE_ORDER_KEY }, create: { key: CHALLENGE_ORDER_KEY, value: clean as Prisma.InputJsonValue }, update: { value: clean as Prisma.InputJsonValue } });
  return clean;
};

export const challengePreview = (order: string[], now = new Date(), weeks = 6) =>
  Array.from({ length: weeks }, (_, i) => {
    const d = new Date(now.getTime() + i * 7 * 86_400_000);
    return { week: isoWeek(d).key, key: challengeForWeek(d, order).key };
  });

export const ALL_CHALLENGES = CHALLENGES.map((c) => ({ key: c.key, goal: c.goal, activityIds: c.activityIds, item: c.item ?? null }));

// ─── Privacy ────────────────────────────────────────────────────────────

export const readyExport = async (userId: string) => ({
  results: await prisma.readyActivityResult.findMany({ where: { userId }, orderBy: { completedAt: 'asc' }, select: { activityId: true, item: true, score: true, max: true, percent: true, completedAt: true } }),
  certificate: await prisma.readyCertificate.findUnique({ where: { userId }, select: { number: true, level: true, points: true, activities: true, issuedAt: true, levelAt: true, revokedAt: true } }),
  weeklyChallenges: await prisma.readyChallengeCompletion.findMany({ where: { userId }, orderBy: { completedAt: 'asc' }, select: { week: true, challengeKey: true, completedAt: true } }),
});

export const eraseReady = async (userId: string) => {
  await prisma.readyActivityResult.deleteMany({ where: { userId } });
  await prisma.readyCertificate.deleteMany({ where: { userId } });
  await prisma.readyChallengeCompletion.deleteMany({ where: { userId } });
};

