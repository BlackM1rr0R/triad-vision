import { prisma } from '../../db.js';
import { isLearned, dayKey, streakOf } from '../german/vocab.js';
import { cityOf, displayNameOf, visaLineOf, type NameStyle } from '../successShare/service.js';
import type { CardLocale } from '../successShare/texts.js';
import { BAKU, coordsOf } from './cities.js';
import { daysBetween, firstNameOnly, haversineKm, levelProgress, topFunFact, yearReview, type ReviewCase } from './stats.js';
import { STORY_CARD_TEXTS } from './texts.js';
import type { StoryCardInput, StoryFormat } from './card.js';

/**
 * "Your visa story" (Triad Wrapped) of a client's own approved main case — GET /api/account/visa-story/:caseId —
 * and the staff "Year in review" (GET /api/admin/year-review). Every number is counted from the live data;
 * nothing is stored. Interview-prep practice stays in the browser (components/prep/usePractised), so the client
 * adds that slide itself.
 */

const CASE_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;

const storyCase = (userId: string, caseId: string) =>
  prisma.case.findFirst({
    where: { id: caseId, clientId: userId, status: 'APPROVED', parentCaseId: null },
    select: {
      id: true,
      number: true,
      clientId: true,
      profession: true,
      visaType: true,
      decisionAt: true,
      closedAt: true,
      updatedAt: true,
      visaCategory: { select: { visaLabel: true, title: true } },
      company: { select: { city: true } },
      vacancy: { select: { city: true } },
      arrivalPlan: { select: { housingCity: true } },
      assignedStaff: { select: { firstName: true } },
    },
  });

export const visaStory = async (userId: string, caseId: string, locale: CardLocale, now = new Date()) => {
  if (!CASE_ID_RE.test(caseId)) return null;
  const [user, c] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, createdAt: true, germanLevel: true, role: true } }),
    storyCase(userId, caseId),
  ]);
  if (!user || user.role !== 'CLIENT' || !c) return null;
  const approvedAt = c.decisionAt ?? c.closedAt ?? c.updatedAt;

  const [docsUploaded, docsApproved, messages, fromClient, attempts, exams, words, days] = await Promise.all([
    prisma.document.count({ where: { caseId: c.id } }),
    prisma.document.count({ where: { caseId: c.id, status: 'ACCEPTED' } }),
    prisma.caseMessage.count({ where: { caseId: c.id } }),
    prisma.caseMessage.count({ where: { caseId: c.id, authorId: userId } }),
    prisma.germanTestAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { estimated: true } }),
    prisma.germanExam.findMany({ where: { userId, passed: true }, select: { level: true } }),
    prisma.germanWordProgress.findMany({ where: { userId, word: { published: true } }, select: { intervalDays: true, reviews: true } }),
    prisma.germanPracticeDay.findMany({ where: { userId, reviews: { gt: 0 } }, select: { day: true } }),
  ]);

  const city = cityOf(c);
  const coords = coordsOf(city);
  const km = coords ? haversineKm(BAKU, coords) : null;
  const wordsLearned = words.filter(isLearned).length;
  const totalDays = daysBetween(user.createdAt, approvedAt);
  const german = levelProgress(
    [...attempts.map((a) => a.estimated), user.germanLevel],
    [user.germanLevel, ...attempts.map((a) => a.estimated), ...exams.map((e) => e.level)],
  );

  return {
    caseId: c.id,
    firstName: firstNameOnly(user.firstName),
    registeredAt: user.createdAt.toISOString(),
    approvedAt: approvedAt.toISOString(),
    days: totalDays,
    profession: c.profession?.trim() || null,
    visaLine: visaLineOf(c, locale),
    documents: { uploaded: docsUploaded, approved: docsApproved },
    messages: { total: messages, fromYou: fromClient, fromTeam: messages - fromClient },
    staffFirstName: firstNameOnly(c.assignedStaff?.firstName),
    destination: { city, km },
    german: {
      ...german,
      wordsLearned,
      reviews: words.reduce((s, w) => s + w.reviews, 0),
      bestStreak: streakOf(
        days.map((d) => d.day),
        dayKey(now),
      ).best,
    },
    funFact: topFunFact({ days: totalDays, docsUploaded, docsApproved, messages, km, wordsLearned }),
  };
};

export type VisaStory = NonNullable<Awaited<ReturnType<typeof visaStory>>>;

const fmt = (n: number, locale: CardLocale) => new Intl.NumberFormat(locale === 'az' ? 'az-Latn-AZ' : locale).format(n);

/** Card input from the story: name reduced to the chosen style, counts only. */
export const storyCardInput = async (userId: string, story: VisaStory, format: StoryFormat, nameStyle: NameStyle, locale: CardLocale): Promise<StoryCardInput> => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true } });
  const tx = STORY_CARD_TEXTS[locale];
  const stats: StoryCardInput['stats'] = [{ value: fmt(story.days, locale), label: tx.days }];
  if (story.destination.km !== null) stats.push({ value: fmt(story.destination.km, locale), label: story.destination.city ? tx.kmTo(story.destination.city) : tx.km });
  stats.push({ value: fmt(story.documents.uploaded, locale), label: tx.docs });
  if (story.german.wordsLearned > 0) stats.push({ value: fmt(story.german.wordsLearned, locale), label: tx.words });
  else if (story.messages.total > 0) stats.push({ value: fmt(story.messages.total, locale), label: tx.messages });
  return {
    format,
    displayName: displayNameOf(user, nameStyle, locale),
    kicker: tx.kicker,
    headline: tx.headline,
    stats,
    footer: tx.footer,
    lang: locale,
  };
};

// ─── Year in review ─────────────────────────────────────────────────────

export const staffYearReview = async (year: number, withStaff: boolean) => {
  // Padded by a day on each side: the pure function decides by the Baku calendar.
  const from = new Date(Date.UTC(year, 0, 1) - 86_400_000);
  const to = new Date(Date.UTC(year + 1, 0, 1) + 86_400_000);
  const rows = await prisma.case.findMany({
    where: { parentCaseId: null, OR: [{ createdAt: { gte: from, lt: to } }, { decisionAt: { gte: from, lt: to } }] },
    select: {
      number: true,
      createdAt: true,
      decisionAt: true,
      status: true,
      profession: true,
      assignedStaffId: true,
      assignedStaff: { select: { firstName: true, lastName: true } },
      company: { select: { city: true } },
      vacancy: { select: { city: true } },
      arrivalPlan: { select: { housingCity: true } },
    },
  });
  const cases: ReviewCase[] = rows.map((r) => ({
    number: r.number,
    createdAt: r.createdAt,
    decisionAt: r.decisionAt,
    status: r.status,
    profession: r.profession,
    city: cityOf(r),
    staffId: r.assignedStaffId,
    staffName: r.assignedStaff ? `${r.assignedStaff.firstName} ${r.assignedStaff.lastName}`.trim() : null,
  }));
  const review = yearReview(cases, year);
  return withStaff ? review : { ...review, perStaff: null };
};
