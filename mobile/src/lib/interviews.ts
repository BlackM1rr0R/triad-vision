import { colors } from '@/theme';
import type { Interview, InterviewStatus } from '@/types';

/** Badge colours per status (mirror of client/src/components/ops/shared.ts INTERVIEW_TONE). */
export const INTERVIEW_TONE: Record<InterviewStatus, { fg: string; bg: string }> = {
  PROPOSED: { fg: colors.warning, bg: colors.warningSoft },
  CONFIRMED: { fg: colors.success, bg: colors.successSoft },
  CANCELLED: { fg: colors.muted, bg: colors.surface },
  DONE: { fg: colors.blue, bg: colors.blueSoft },
  NO_SHOW: { fg: colors.danger, bg: colors.dangerSoft },
};

/** The meeting link is offered from 15 minutes before the start until the end (+ a little slack). */
export const JOIN_BEFORE_MS = 15 * 60 * 1000;
export const JOIN_AFTER_END_MS = 30 * 60 * 1000;

export const minutesBetween = (startsAt: string, endsAt: string) =>
  Math.max(0, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000));

/** True while joining makes sense: confirmed, has a link and the time window is open. */
export const canJoin = (i: Pick<Interview, 'status' | 'startsAt' | 'endsAt' | 'meetingUrl'>, now = Date.now()) => {
  if (i.status !== 'CONFIRMED' || !i.meetingUrl) return false;
  const start = new Date(i.startsAt).getTime();
  const end = new Date(i.endsAt).getTime();
  return now >= start - JOIN_BEFORE_MS && now <= end + JOIN_AFTER_END_MS;
};

/** The candidate may answer a proposal until it starts; a confirmed one may still be declined. */
export const canConfirm = (i: Pick<Interview, 'status' | 'startsAt'>, now = Date.now()) =>
  i.status === 'PROPOSED' && new Date(i.startsAt).getTime() > now;

export const canDecline = (i: Pick<Interview, 'status' | 'endsAt'>, now = Date.now()) =>
  (i.status === 'PROPOSED' || i.status === 'CONFIRMED') && new Date(i.endsAt).getTime() > now;

/** The next interview to highlight on the home screen: the earliest live one. */
export const nextInterview = (upcoming: Interview[]) =>
  [...upcoming].filter((i) => i.status === 'PROPOSED' || i.status === 'CONFIRMED').sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
