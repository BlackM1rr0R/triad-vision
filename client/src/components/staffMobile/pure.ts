/**
 * Pure helpers of the phone staff view (components/staffMobile): swipe maths and the quick case transitions a
 * status allows. No React, no imports — unit tested from server/tests/unit/staffMobilePure.test.ts.
 */

export type SwipeSide = 'left' | 'right';

/** Distance a row must travel to trigger its action: 35 % of its width, kept between 72 and ~115 px. */
export const SWIPE_MIN_PX = 72;
export const SWIPE_FRACTION = 0.35;
/** Below this the gesture is treated as a tap / scroll, the row does not move. */
export const SWIPE_SLOP_PX = 8;
/** Flick: a fast short swipe also counts (px per ms). */
export const SWIPE_FLICK_VELOCITY = 0.6;

export const swipeThreshold = (width: number) => Math.min(SWIPE_MIN_PX * 1.6, Math.max(SWIPE_MIN_PX, width * SWIPE_FRACTION));

/**
 * Visual offset for a raw finger delta: 1:1 up to the threshold, then rubber-banded; a side without an action
 * only gives a little resistance (the row hints it cannot go there).
 */
export const swipeOffset = (dx: number, threshold: number, allowed: { left: boolean; right: boolean }) => {
  const side: SwipeSide = dx < 0 ? 'left' : 'right';
  const abs = Math.abs(dx);
  const ok = side === 'left' ? allowed.left : allowed.right;
  if (!ok) return Math.sign(dx) * Math.min(16, abs * 0.15);
  const out = abs <= threshold ? abs : threshold + (abs - threshold) * 0.35;
  return Math.sign(dx) * out;
};

/** Which action a released swipe triggers (dx > 0 = finger moved right = the action on the left edge, "right"). */
export const swipeOutcome = (dx: number, threshold: number, allowed: { left: boolean; right: boolean }, velocity = 0): SwipeSide | null => {
  const side: SwipeSide = dx < 0 ? 'left' : 'right';
  if (Math.abs(dx) < SWIPE_SLOP_PX) return null;
  if (side === 'left' ? !allowed.left : !allowed.right) return null;
  if (Math.abs(dx) >= threshold) return side;
  // A quick flick in the same direction past a third of the way also counts.
  if (Math.abs(velocity) >= SWIPE_FLICK_VELOCITY && Math.sign(velocity) === Math.sign(dx) && Math.abs(dx) >= threshold / 3) return side;
  return null;
};

/** A horizontal gesture wins over vertical scrolling once it is clearly more sideways than up / down. */
export const isHorizontal = (dx: number, dy: number) => Math.abs(dx) > SWIPE_SLOP_PX && Math.abs(dx) > Math.abs(dy) * 1.2;

// ─── Quick case transitions (POST /admin/cases/:id/actions) ───────────────

export type QuickAction = 'CONFIRM_CONTRACT' | 'REJECT_SIGNATURE' | 'REQUEST_CHANGES' | 'MARK_LODGED' | 'APPROVE' | 'REJECT';

/** Actions that need a note (the server asks for at least 3 characters). */
export const NOTE_REQUIRED: readonly QuickAction[] = ['REJECT_SIGNATURE', 'REQUEST_CHANGES'];

/**
 * The transitions the phone status sheet offers per status (the server's lib/caseFlow rules); every other change
 * (appointment, cancel, reopen) stays on the case page.
 */
export const quickActionsFor = (status: string): QuickAction[] => {
  switch (status) {
    case 'DOCUMENTS_REVIEW':
    case 'EMBASSY_REVIEW':
      return ['REQUEST_CHANGES'];
    case 'CONTRACT_SIGNED':
      return ['CONFIRM_CONTRACT', 'REJECT_SIGNATURE'];
    case 'APPOINTMENT_SCHEDULED':
      return ['MARK_LODGED'];
    case 'DECISION_PENDING':
      return ['APPROVE', 'REJECT'];
    default:
      return [];
  }
};

/** Request body of a quick action. */
export const actionBody = (a: QuickAction, note?: string): Record<string, unknown> => {
  const text = note?.trim() || undefined;
  switch (a) {
    case 'APPROVE':
      return { action: 'DECIDE', decision: 'APPROVED', ...(text ? { reason: text } : {}) };
    case 'REJECT':
      return { action: 'DECIDE', decision: 'REJECTED', ...(text ? { reason: text } : {}) };
    case 'REJECT_SIGNATURE':
    case 'REQUEST_CHANGES':
      return { action: a, note: text ?? '' };
    default:
      return { action: a };
  }
};

/** Status the case moves to (optimistic UI). */
export const nextStatusOf = (status: string, a: QuickAction): string => {
  switch (a) {
    case 'CONFIRM_CONTRACT':
      return 'EMBASSY_DOCUMENTS';
    case 'REJECT_SIGNATURE':
      return 'CONTRACT_SENT';
    case 'REQUEST_CHANGES':
      return status === 'EMBASSY_REVIEW' ? 'EMBASSY_DOCUMENTS' : 'DOCUMENTS_PENDING';
    case 'MARK_LODGED':
      return 'DECISION_PENDING';
    case 'APPROVE':
      return 'APPROVED';
    case 'REJECT':
      return 'REJECTED';
  }
};
