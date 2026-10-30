import { z } from 'zod';

/**
 * Pure rules of the permit expiry reminders (post-arrival worker): residence permit, EU Blue Card,
 * passport and health insurance. No database access, so they are unit tested directly.
 *
 * Like lib/expiry/rules.ts a "window" is a number of days before the expiry date and 0 means "expired".
 * A reminder is sent once per (item, expiry date, window) — the ReminderLog key carries all three, so a
 * corrected date starts its reminders from scratch. Entering late (30 days left on the first run) only
 * sends the narrowest matching window; an expired item is announced once, within EXPIRED_NOTICE_DAYS.
 */

export const PERMIT_ITEMS = ['residence', 'blueCard', 'passport', 'insurance'] as const;
export type PermitItem = (typeof PERMIT_ITEMS)[number];

/** The "expired" notice is only sent this many days after the expiry date (older ones stay quiet). */
export const EXPIRED_NOTICE_DAYS = 14;

const DAY = 24 * 60 * 60 * 1000;

const windowList = z
  .array(z.number().int().min(1).max(365))
  .min(1)
  .max(6)
  .transform((w) => [...new Set(w)].sort((a, b) => b - a));

export const PERMIT_SETTING_KEY = 'permitReminders';

export const permitSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Days before the expiry date, per item (widest first after parsing). */
  windows: z.object({ residence: windowList, blueCard: windowList, passport: windowList, insurance: windowList }),
  /** Also e-mail the responsible staff member (in-app is always sent). */
  staffEmail: z.boolean(),
});
export type PermitSettings = z.infer<typeof permitSettingsSchema>;

/**
 * 90 / 60 / 30 days for every item; the passport keeps a longer lead in front (a new Azerbaijani passport
 * takes months, and the residence title cannot be extended on a passport that runs out first).
 */
export const DEFAULT_PERMIT_SETTINGS: PermitSettings = {
  enabled: true,
  windows: { residence: [90, 60, 30], blueCard: [90, 60, 30], passport: [180, 90, 60, 30], insurance: [90, 60, 30] },
  staffEmail: true,
};

/** Stored settings over the defaults; anything invalid falls back to the defaults. */
export const parsePermitSettings = (value: unknown): PermitSettings => {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<PermitSettings>;
  const parsed = permitSettingsSchema.safeParse({ ...DEFAULT_PERMIT_SETTINGS, ...v, windows: { ...DEFAULT_PERMIT_SETTINGS.windows, ...(v.windows ?? {}) } });
  return parsed.success ? parsed.data : DEFAULT_PERMIT_SETTINGS;
};

/** Residence title kind → item (null = ordinary Aufenthaltserlaubnis). */
export const titleItem = (kind: string | null | undefined): PermitItem => (kind === 'EU_BLUE_CARD' ? 'blueCard' : 'residence');

/** Whole days left until the expiry date (0 or negative once it passed). */
export const daysLeft = (expiresAt: Date, now: Date) => Math.ceil((expiresAt.getTime() - now.getTime()) / DAY);

/**
 * The window a reminder belongs to right now: the narrowest window `now` falls into, 0 = expired (only
 * within EXPIRED_NOTICE_DAYS), null = nothing to send (before the widest window or expired long ago).
 */
export const permitWindow = (windows: readonly number[], expiresAt: Date, now: Date): number | null => {
  const left = daysLeft(expiresAt, now);
  if (left <= 0) return left > -EXPIRED_NOTICE_DAYS ? 0 : null;
  return [...windows].sort((a, b) => a - b).find((w) => left <= w) ?? null;
};

/** ReminderLog key prefix of one item and date; both title kinds share "title" so switching the kind sends nothing twice. */
export const permitReminderPrefix = (item: PermitItem, subjectId: string, expiresAt: Date) =>
  `permit:${item === 'blueCard' || item === 'residence' ? 'title' : item}:${subjectId}:${expiresAt.toISOString().slice(0, 10)}:`;

/** ReminderLog key of one reminder (the prefix + the window). */
export const permitReminderKey = (item: PermitItem, subjectId: string, expiresAt: Date, window: number) => `${permitReminderPrefix(item, subjectId, expiresAt)}${window}`;

export type PermitTone = 'ok' | 'soon' | 'urgent' | 'expired';

/** Chip colour of the client / admin view: inside the narrowest window red, inside the widest amber. */
export const permitTone = (windows: readonly number[], expiresAt: Date, now: Date): PermitTone => {
  const left = daysLeft(expiresAt, now);
  if (left <= 0) return 'expired';
  const sorted = [...windows].sort((a, b) => a - b);
  if (left <= sorted[0]) return 'urgent';
  if (left <= sorted[sorted.length - 1]) return 'soon';
  return 'ok';
};
