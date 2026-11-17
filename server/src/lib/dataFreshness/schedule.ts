import type { FreshnessCadence, FreshnessItem } from './registry.js';

/**
 * Due dates and status of data-freshness items (pure). Days are ISO calendar days (UTC).
 *  - Without a review an item is due on its `reviewBy` day.
 *  - Due dates repeat every cadence (12 / 6 months) from `reviewBy`, in both directions.
 *  - A review settles every due date up to REVIEW_COVERS_DAYS after it: reviewing on 10 Nov counts for the
 *    1 January check; the next due date is the first one after that window. `once` items are done after a
 *    review on or after (reviewBy − REVIEW_COVERS_DAYS).
 */

export const DUE_SOON_DAYS = 30;
export const REVIEW_COVERS_DAYS = 90;

export type FreshnessStatus = 'ok' | 'dueSoon' | 'overdue' | 'done';

const DAY = 86_400_000;
const toDay = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
const ms = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);
export const addDays = (iso: string, n: number) => toDay(new Date(ms(iso) + n * DAY));
export const daysBetween = (from: string, to: string) => Math.round((ms(to) - ms(from)) / DAY);

const cadenceMonths = (c: FreshnessCadence) => (c === 'yearly' ? 12 : c === 'halfYearly' ? 6 : 0);

/** `iso` plus n months (day of month clamped to the month's length). */
export const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return toDay(new Date(Date.UTC(ny, nm, Math.min(d, last))));
};

/** Next due day of an item given its latest review (null: never reviewed). Null = nothing due any more (`once`, done). */
export const nextDue = (item: Pick<FreshnessItem, 'reviewBy' | 'cadence'>, lastReviewedAt: Date | string | null | undefined): string | null => {
  if (!lastReviewedAt) return item.reviewBy;
  const covered = addDays(toDay(lastReviewedAt), REVIEW_COVERS_DAYS);
  const step = cadenceMonths(item.cadence);
  if (!step) return covered >= item.reviewBy ? null : item.reviewBy;
  // Walk the series from reviewBy to the first due date after the covered window (backwards first when the review
  // is long before reviewBy, so an early review never skips the reviewBy date itself).
  let due = item.reviewBy;
  while (due > covered) {
    const prev = addMonths(due, -step);
    if (prev <= covered) break;
    due = prev;
  }
  while (due <= covered) due = addMonths(due, step);
  return due;
};

export const statusOf = (due: string | null, today: Date | string = new Date()): FreshnessStatus => {
  if (!due) return 'done';
  const t = toDay(today);
  if (t >= due) return 'overdue';
  return daysBetween(t, due) <= DUE_SOON_DAYS ? 'dueSoon' : 'ok';
};

/** Reminder kinds due on `today` for an item: 30 days before ("soon") and from the due day on ("due"). */
export const reminderKinds = (due: string | null, today: Date | string = new Date()): Array<'soon' | 'due'> => {
  const s = statusOf(due, today);
  return s === 'overdue' ? ['due'] : s === 'dueSoon' ? ['soon'] : [];
};
