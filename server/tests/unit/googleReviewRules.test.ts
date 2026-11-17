import { describe, expect, it } from 'vitest';
import {
  type EligibilityInput,
  evaluateEligibility,
  eventDue,
  googleWriteReviewUrl,
  isLowRating,
  ratingDistribution,
  reminderDue,
  validRating,
} from '../../src/lib/googleReview/rules.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-17T10:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const rules = { cooldownDays: 180, lowScoreMax: 6, lowScoreLookbackDays: 180 };
const base: EligibilityInput = {
  isMainApplicant: true,
  isActive: true,
  email: 'aysel@example.com',
  emailNotifications: true,
  optedOut: false,
  lastInviteAt: null,
  lastSurveyScore: null,
  lastSurveyAt: null,
  hasOpenProblem: false,
  now,
};
const ev = (over: Partial<EligibilityInput>) => evaluateEligibility({ ...base, ...over }, rules);

describe('google review eligibility', () => {
  it('sends to an ordinary main applicant', () => {
    expect(ev({})).toEqual({ action: 'SEND' });
  });

  it('skips family members, inactive, no e-mail, e-mail off and opt-outs', () => {
    expect(ev({ isMainApplicant: false })).toEqual({ action: 'SKIP', reason: 'FAMILY_MEMBER' });
    expect(ev({ isActive: false })).toEqual({ action: 'SKIP', reason: 'INACTIVE' });
    expect(ev({ email: '' })).toEqual({ action: 'SKIP', reason: 'NO_EMAIL' });
    expect(ev({ email: 'not-an-address' })).toEqual({ action: 'SKIP', reason: 'NO_EMAIL' });
    expect(ev({ emailNotifications: false })).toEqual({ action: 'SKIP', reason: 'EMAIL_OFF' });
    expect(ev({ optedOut: true })).toEqual({ action: 'SKIP', reason: 'OPTED_OUT' });
  });

  it('asks at most once per 180 days', () => {
    expect(ev({ lastInviteAt: ago(10) })).toEqual({ action: 'SKIP', reason: 'COOLDOWN' });
    expect(ev({ lastInviteAt: ago(179) })).toEqual({ action: 'SKIP', reason: 'COOLDOWN' });
    expect(ev({ lastInviteAt: ago(181) })).toEqual({ action: 'SEND' });
  });

  it('a recent low NPS score holds the request for a staff follow-up (not a permanent exclusion)', () => {
    expect(ev({ lastSurveyScore: 4, lastSurveyAt: ago(5) })).toEqual({ action: 'HOLD', reason: 'LOW_SCORE' });
    expect(ev({ lastSurveyScore: 6, lastSurveyAt: ago(5) })).toEqual({ action: 'HOLD', reason: 'LOW_SCORE' });
    expect(ev({ lastSurveyScore: 7, lastSurveyAt: ago(5) })).toEqual({ action: 'SEND' });
    expect(ev({ lastSurveyScore: 2, lastSurveyAt: ago(200) })).toEqual({ action: 'SEND' }); // not recent
  });

  it('an open problem report postpones; opt-out and cooldown win over everything', () => {
    expect(ev({ hasOpenProblem: true })).toEqual({ action: 'WAIT', reason: 'OPEN_PROBLEM' });
    expect(ev({ hasOpenProblem: true, lastSurveyScore: 1, lastSurveyAt: ago(1) })).toEqual({ action: 'WAIT', reason: 'OPEN_PROBLEM' });
    expect(ev({ optedOut: true, lastSurveyScore: 1, lastSurveyAt: ago(1) }).action).toBe('SKIP');
    expect(ev({ lastInviteAt: ago(3), hasOpenProblem: true })).toEqual({ action: 'SKIP', reason: 'COOLDOWN' });
  });
});

describe('google review timing', () => {
  it('event is due after the delay and until maxAge', () => {
    expect(eventDue(ago(2), 3, 90, now)).toBe(false);
    expect(eventDue(ago(3), 3, 90, now)).toBe(true);
    expect(eventDue(ago(90), 3, 90, now)).toBe(true);
    expect(eventDue(ago(91), 3, 90, now)).toBe(false);
    expect(eventDue(ago(14), 14, 7, now)).toBe(true); // maxAge never shorter than the delay
  });

  it('one reminder after 7 days, only when nothing was opened', () => {
    const inv = { status: 'SENT', sentAt: ago(8), remindedAt: null, openedAt: null, ratedAt: null, googleClickedAt: null };
    expect(reminderDue(inv, 7, now)).toBe(true);
    expect(reminderDue({ ...inv, sentAt: ago(6) }, 7, now)).toBe(false);
    expect(reminderDue({ ...inv, remindedAt: ago(1) }, 7, now)).toBe(false);
    expect(reminderDue({ ...inv, openedAt: ago(2) }, 7, now)).toBe(false);
    expect(reminderDue({ ...inv, googleClickedAt: ago(2) }, 7, now)).toBe(false);
    expect(reminderDue({ ...inv, status: 'HELD' }, 7, now)).toBe(false);
    expect(reminderDue(inv, 0, now)).toBe(false); // reminders off
  });
});

describe('google review ratings and link', () => {
  it('1–3 is low, 4–5 is not; only integers 1–5 are valid', () => {
    expect([1, 2, 3, 4, 5].map(isLowRating)).toEqual([true, true, true, false, false]);
    expect(validRating(0)).toBe(false);
    expect(validRating(3.5)).toBe(false);
    expect(validRating('4')).toBe(false);
    expect(validRating(5)).toBe(true);
  });

  it('distribution counts per star', () => {
    expect(ratingDistribution([5, 5, 4, 1, null, 9])).toEqual([1, 0, 0, 1, 2]);
  });

  it('builds the write-review link from the Place ID when no URL is set', () => {
    expect(googleWriteReviewUrl({ url: 'https://g.page/r/abc/review', placeId: 'ChIJ123' })).toBe('https://g.page/r/abc/review');
    expect(googleWriteReviewUrl({ url: '', placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4' })).toBe('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');
    expect(googleWriteReviewUrl({ url: '', placeId: '' })).toBe('');
  });
});
