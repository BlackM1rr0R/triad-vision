import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config.js';

/**
 * Pure rules of the EUR → AZN rate alerts (service.ts does the database and e-mail work).
 */

export const DIRECTIONS = ['gte', 'lte'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Active alerts (unsubscribed / expired ones not counted, unconfirmed ones counted) per e-mail address / account. */
export const MAX_ALERTS_PER_EMAIL = 3;
export const UNCONFIRMED_TTL_DAYS = 7;
/** Unsubscribed and expired alerts are deleted this many days later (DSGVO retention). */
export const ENDED_TTL_DAYS = 30;
export const ALERT_LIFETIME_MONTHS = 6;
/** Plausible target range (EUR has traded between ~1.1 and ~2.5 AZN since 2006; CBAR parser bounds 0.5–10). */
export const TARGET_MIN = 0.5;
export const TARGET_MAX = 10;

const DAY = 24 * 60 * 60 * 1000;
const BAKU_OFFSET_MS = 4 * 60 * 60 * 1000; // Asia/Baku: UTC+4, no DST

/** The Baku calendar day (YYYY-MM-DD) of a moment. */
export const bakuIso = (d: Date) => new Date(d.getTime() + BAKU_OFFSET_MS).toISOString().slice(0, 10);

export const roundTarget = (n: number) => Math.round(n * 10_000) / 10_000;

export const targetSchema = z.coerce
  .number()
  .finite()
  .min(TARGET_MIN)
  .max(TARGET_MAX)
  .transform(roundTarget);

export const alertInputSchema = z.object({
  direction: z.enum(DIRECTIONS),
  target: targetSchema,
  lng: z.string().max(5).optional(),
});
export type AlertInput = z.infer<typeof alertInputSchema>;

export const conditionMet = (direction: string, target: number, rate: number) => (direction === 'lte' ? rate <= target : rate >= target);

/**
 * Whether an alert fires on `rate` now: confirmed, not unsubscribed / expired / paused, still within its lifetime,
 * the condition holds, and nothing was e-mailed for it earlier on the same Baku day.
 */
export const shouldFire = (
  a: { confirmedAt: Date | null; unsubscribedAt: Date | null; expiredAt: Date | null; pausedAt: Date | null; expiresAt: Date | null; lastSentAt: Date | null; direction: string; target: number },
  rate: number,
  now: Date,
) =>
  !!a.confirmedAt &&
  !a.unsubscribedAt &&
  !a.expiredAt &&
  !a.pausedAt &&
  (!a.expiresAt || a.expiresAt.getTime() > now.getTime()) &&
  (!a.lastSentAt || bakuIso(a.lastSentAt) !== bakuIso(now)) &&
  conditionMet(a.direction, a.target, rate);

/** End of the alert's lifetime: 6 calendar months after `from` (confirmation or re-arming). */
export const expiryFrom = (from: Date) => {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + ALERT_LIFETIME_MONTHS);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
};

export const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * DAY);

/** "2,0123" (az / de / ru) or "2.0123" (en): four decimals like the CBAR bulletin. */
export const fmtRate = (n: number, lng: string) => (lng === 'en' ? n.toFixed(4) : n.toFixed(4).replace('.', ','));

/** "2026-11-18" → "18.11.2026". */
export const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
};

// ─── Signed links (confirm / manage / unsubscribe) ───────────────────────

const sig = (id: string) => crypto.createHmac('sha256', config.jwtSecret).update(`rate-alert:${id}`).digest('base64url').slice(0, 32);

/** "<id>.<sig>": never stored, derived from the row id with the server secret. */
export const alertToken = (id: string) => `${id}.${sig(id)}`;

export const verifyAlertToken = (token: unknown): string | null => {
  if (typeof token !== 'string' || token.length > 120) return null;
  const [id, s, extra] = token.split('.');
  if (!id || !s || extra !== undefined || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  const want = Buffer.from(sig(id));
  const got = Buffer.from(s);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? id : null;
};

export const maskEmail = (email: string) => {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, local.length - 2)))}@${domain}`;
};
