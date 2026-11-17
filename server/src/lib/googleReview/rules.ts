/**
 * Pure rules of the automatic Google review requests (no database): which trigger events are due, who may be
 * asked, what happens to a rating. Unit-tested in tests/unit/googleReviewRules.test.ts.
 *
 * Google policy decision (researched 2026-11-17, https://support.google.com/contributionpolicy/answer/7400114
 * "Fake engagement": merchants may not "discourage or prohibit negative reviews, or selectively solicit positive
 * reviews from customers"): the flow must NOT be review gating. Therefore
 *   - after the one-click 1–5 rating EVERY client sees the Google link (4–5 prominently, 1–3 next to a private
 *     feedback form); a 1–3 rating additionally creates a staff follow-up task;
 *   - the e-mail itself also carries a plain "write a Google review" link, so rating first is optional;
 *   - a recent low satisfaction (NPS) score or an open problem report only POSTPONES the request (staff follow up
 *     first, the request is sent after the hold period / once the problem is closed); it never removes the
 *     client from the review programme because of what they think of us.
 */

export const GR_TRIGGERS = ['APPROVED', 'ARRIVAL', 'CLOSED'] as const;
export type GrTrigger = (typeof GR_TRIGGERS)[number];

const DAY = 24 * 60 * 60 * 1000;

/** The event is due when `delayDays` have passed, and too old (never sent) after `maxAgeDays`. */
export const eventDue = (eventAt: Date, delayDays: number, maxAgeDays: number, now: Date) => {
  const age = now.getTime() - eventAt.getTime();
  return age >= delayDays * DAY && age <= Math.max(maxAgeDays, delayDays) * DAY;
};

export interface EligibilityInput {
  /** Family member cases hang under the main applicant's case (parentCaseId set) → never asked. */
  isMainApplicant: boolean;
  isActive: boolean;
  email: string | null | undefined;
  /** User.emailNotifications (service e-mails). */
  emailNotifications: boolean;
  /** Own opt-out link (or a campaign unsubscribe). */
  optedOut: boolean;
  /** Latest review request this client got (new invites + the legacy one-time request). */
  lastInviteAt: Date | null;
  /** Latest answered satisfaction survey score (0–10) and when. */
  lastSurveyScore: number | null;
  lastSurveyAt: Date | null;
  /** Open problem report / open follow-up task for this client. */
  hasOpenProblem: boolean;
  now: Date;
}

export interface EligibilityRules {
  cooldownDays: number;
  /** Survey score at or below this counts as "unhappy". */
  lowScoreMax: number;
  /** A survey answer older than this is not "recent". */
  lowScoreLookbackDays: number;
}

export type Eligibility =
  | { action: 'SEND' }
  /** Low recent score: staff follow-up first, request postponed. */
  | { action: 'HOLD'; reason: 'LOW_SCORE' }
  /** Not now (open problem): re-evaluated on the next run, nothing recorded. */
  | { action: 'WAIT'; reason: 'OPEN_PROBLEM' }
  | { action: 'SKIP'; reason: 'FAMILY_MEMBER' | 'INACTIVE' | 'NO_EMAIL' | 'EMAIL_OFF' | 'OPTED_OUT' | 'COOLDOWN' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const evaluateEligibility = (i: EligibilityInput, r: EligibilityRules): Eligibility => {
  if (!i.isMainApplicant) return { action: 'SKIP', reason: 'FAMILY_MEMBER' };
  if (!i.isActive) return { action: 'SKIP', reason: 'INACTIVE' };
  if (!i.email || !EMAIL_RE.test(i.email)) return { action: 'SKIP', reason: 'NO_EMAIL' };
  if (!i.emailNotifications) return { action: 'SKIP', reason: 'EMAIL_OFF' };
  if (i.optedOut) return { action: 'SKIP', reason: 'OPTED_OUT' };
  if (i.lastInviteAt && i.now.getTime() - i.lastInviteAt.getTime() < r.cooldownDays * DAY) return { action: 'SKIP', reason: 'COOLDOWN' };
  if (i.hasOpenProblem) return { action: 'WAIT', reason: 'OPEN_PROBLEM' };
  if (
    i.lastSurveyScore !== null &&
    i.lastSurveyAt &&
    i.lastSurveyScore <= r.lowScoreMax &&
    i.now.getTime() - i.lastSurveyAt.getTime() <= r.lowScoreLookbackDays * DAY
  )
    return { action: 'HOLD', reason: 'LOW_SCORE' };
  return { action: 'SEND' };
};

/** One reminder, `reminderDays` after sending, only while the rating page was never opened. 0 = off. */
export const reminderDue = (
  inv: { status: string; sentAt: Date | null; remindedAt: Date | null; openedAt: Date | null; ratedAt: Date | null; googleClickedAt: Date | null },
  reminderDays: number,
  now: Date,
) =>
  reminderDays > 0 &&
  inv.status === 'SENT' &&
  !!inv.sentAt &&
  !inv.remindedAt &&
  !inv.openedAt &&
  !inv.ratedAt &&
  !inv.googleClickedAt &&
  now.getTime() - inv.sentAt.getTime() >= reminderDays * DAY;

/** 1–3 → staff follow-up + private feedback form; 4–5 → thanks. The Google link is shown to everyone. */
export const isLowRating = (rating: number) => rating >= 1 && rating <= 3;
export const validRating = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5;

/** The Google "write a review" link: the pasted URL, else built from the Place ID. */
export const googleWriteReviewUrl = (s: { url: string; placeId: string }) =>
  s.url || (s.placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(s.placeId)}` : '');

/** Distribution 1–5 (index 0 = rating 1). */
export const ratingDistribution = (ratings: (number | null)[]) => {
  const d = [0, 0, 0, 0, 0];
  for (const r of ratings) if (r !== null && validRating(r)) d[r - 1]++;
  return d;
};
