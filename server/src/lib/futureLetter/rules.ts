import type { FutureLetter } from '@prisma/client';

/** Pure rules of the letter to my future self (unit-tested): fallback date and when a letter is due. */

const DAY = 86_400_000;
const MAX_FALLBACK_DAYS = 5 * 366;

/** "2027-03-01" → Date (UTC midnight) when it is tomorrow or later and at most ~5 years ahead. */
export const parseDeliverOn = (s: string | null | undefined, now = new Date()): Date | null | 'INVALID' => {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'INVALID';
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return 'INVALID';
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (d.getTime() <= today || d.getTime() > today + MAX_FALLBACK_DAYS * DAY) return 'INVALID';
  return d;
};

/** Due when not yet delivered and (arrived, or the fallback day has begun). */
export const deliveryReason = (l: Pick<FutureLetter, 'deliveredAt' | 'deliverOn'>, arrived: boolean, now = new Date()): 'ARRIVAL' | 'DATE' | null => {
  if (l.deliveredAt) return null;
  if (arrived) return 'ARRIVAL';
  if (l.deliverOn && l.deliverOn.getTime() <= now.getTime()) return 'DATE';
  return null;
};
