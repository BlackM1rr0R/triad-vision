import { prisma } from '../../db.js';
import { profileCompleteness } from '../../routes/account.js';
import { dayKey, isLearned, streakOf } from '../german/vocab.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { BADGES, documentFacts, earnedKeys, highestLevel, type BadgeFacts } from './rules.js';

/**
 * Client badges (GET /api/account/badges): gathers the facts with a fixed set of queries, stores newly earned badges
 * with the date (idempotent: unique per user + key) and returns every badge locked / unlocked. `fresh` = earned but
 * not yet celebrated on a device; POST /api/account/badges/seen clears it. "View as client" (impersonation) never
 * stores anything.
 */

export const badgeFacts = async (userId: string, now = new Date()): Promise<BadgeFacts> => {
  const [user, cases, days, learned, attempts, exams] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.case.findMany({
      where: { clientId: userId },
      select: {
        status: true,
        contract: { select: { signedAt: true } },
        arrivalFollowUp: { select: { id: true } },
        arrivalPlan: { select: { status: true } },
        requirements: { select: { required: true, documents: { select: { status: true } } } },
      },
    }),
    prisma.germanPracticeDay.findMany({ where: { userId, reviews: { gt: 0 } }, select: { day: true } }),
    prisma.germanWordProgress.findMany({ where: { userId, word: { published: true } }, select: { intervalDays: true } }),
    prisma.germanTestAttempt.findMany({ where: { userId }, select: { estimated: true } }),
    prisma.germanExam.findMany({ where: { userId, passed: true }, select: { level: true } }),
  ]);
  const docs = cases.map((c) => documentFacts(c.requirements));
  return {
    profilePercent: profileCompleteness(user).percent,
    docsUploaded: docs.some((d) => d.uploaded),
    docsAccepted: docs.some((d) => d.accepted),
    contractSigned: cases.some((c) => !!c.contract?.signedAt),
    visaApproved: cases.some((c) => c.status === 'APPROVED'),
    arrived: cases.some((c) => !!c.arrivalFollowUp || c.arrivalPlan?.status === 'COMPLETED'),
    bestStreak: streakOf(
      days.map((d) => d.day),
      dayKey(now),
    ).best,
    wordsLearned: learned.filter(isLearned).length,
    level: highestLevel(user.germanLevel, ...attempts.map((a) => a.estimated), ...exams.map((e) => e.level)),
  };
};

export const clientBadges = async (userId: string, now = new Date()) => {
  const facts = await badgeFacts(userId, now);
  const keys = earnedKeys(facts);
  if (keys.length && !isImpersonating()) {
    await prisma.clientBadge.createMany({ data: keys.map((key) => ({ userId, key, earnedAt: now })), skipDuplicates: true });
  }
  const stored = await prisma.clientBadge.findMany({ where: { userId } });
  const byKey = new Map(stored.map((b) => [b.key, b]));
  const badges = BADGES.map((b) => {
    const row = byKey.get(b.key);
    // Impersonation: what would be earned is shown as earned (nothing stored, never "fresh").
    const earned = !!row || keys.includes(b.key);
    return {
      key: b.key,
      group: b.group,
      icon: b.icon,
      earned,
      earnedAt: row?.earnedAt.toISOString() ?? null,
      fresh: !!row && !row.seenAt,
      progress: b.progress && !earned ? b.progress(facts) : null,
    };
  });
  return { badges, earned: badges.filter((b) => b.earned).length, total: badges.length, streak: facts.bestStreak, wordsLearned: facts.wordsLearned };
};

/** The client saw the celebration of these badges (all fresh ones when no keys are given). */
export const markBadgesSeen = async (userId: string, keys: string[] | null, now = new Date()) => {
  const r = await prisma.clientBadge.updateMany({ where: { userId, seenAt: null, ...(keys ? { key: { in: keys } } : {}) }, data: { seenAt: now } });
  return r.count;
};
