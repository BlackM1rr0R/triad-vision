import type { Prisma } from '@prisma/client';

/**
 * Notification center (bell panel + /notifications page, staff and every portal): the type → category rules used
 * for the filter chips and the row icons, and the matching Prisma filters. Notification.type is a free string
 * (case statuses, STAFF, TASK_ASSIGNED, PARTNER_COMMISSION_PAID …), so a category is "the type contains one of
 * these tokens"; the first category that matches wins (order below), everything else is "system".
 * The JS classifier and the SQL filter use the same token lists, so a filtered list and the per-category counts
 * always agree. Pure apart from the Prisma types (unit tested: tests/unit/notificationCenter.test.ts).
 */

export const NOTIFICATION_CATEGORIES = ['case', 'document', 'message', 'task', 'finance', 'system'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Checked in this order; 'case' last of the named ones, since many other types also mention a status word. */
const RULES: [Exclude<NotificationCategory, 'system'>, string[]][] = [
  ['message', ['MESSAGE', 'CHAT', 'MENTION', 'WHATSAPP', 'SMS', 'REPLY', 'INTERNAL_NOTE', 'COMMENT']],
  ['document', ['DOCUMENT', 'DOCS', 'EXPIRY', 'PASSPORT', 'VAULT', 'SIGNATURE', 'OFFICIAL_FORM', 'DRIVE', 'PHOTO', 'TRANSLATION', 'OCR']],
  ['task', ['TASK', 'CALENDAR', 'INTERVIEW', 'TIMER', 'BOOKING', 'REMINDER', 'CHECKIN', 'SHIFT', 'PROBATION', 'DIGEST']],
  ['finance', ['PAYMENT', 'INVOICE', 'QUOTE', 'PACKAGE', 'COMMISSION', 'REFERRAL', 'BILLING', 'SETTLEMENT']],
  [
    'case',
    ['CASE', 'APPROVED', 'REJECTED', 'CANCELLED', 'REOPENED', 'CONTRACT', 'EMBASSY', 'APPOINTMENT', 'DECISION', 'PROCESSING', 'STATUS', 'RENEWAL', 'RECOGNITION', 'ASSIGNED', 'FAMILY', 'ARRIVAL', 'PERMIT', 'CANDIDATE', 'VACANCY'],
  ],
];

const TOKENS = new Map(RULES);

/** Category of a notification type (case-insensitive). */
export const notificationCategory = (type: string): NotificationCategory => {
  const t = type.toUpperCase();
  for (const [cat, tokens] of RULES) if (tokens.some((k) => t.includes(k))) return cat;
  return 'system';
};

const anyToken = (tokens: string[]): Prisma.NotificationWhereInput => ({ OR: tokens.map((k) => ({ type: { contains: k } })) });

/** Prisma filter for the notifications of one category (same precedence as notificationCategory). */
export const categoryWhere = (cat: NotificationCategory): Prisma.NotificationWhereInput => {
  const idx = RULES.findIndex(([c]) => c === cat);
  const before = (idx === -1 ? RULES : RULES.slice(0, idx)).flatMap(([, tokens]) => tokens);
  const not = before.length ? [{ NOT: anyToken(before) }] : [];
  if (cat === 'system') return { AND: not };
  return { AND: [anyToken(TOKENS.get(cat)!), ...not] };
};

/** Totals per category from a `groupBy type` of the user's notifications (all + unread). */
export const categoryCounts = (all: { type: string; count: number }[], unread: { type: string; count: number }[]) => {
  const out = Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, { key: c, total: 0, unread: 0 }])) as Record<NotificationCategory, { key: NotificationCategory; total: number; unread: number }>;
  for (const r of all) out[notificationCategory(r.type)].total += r.count;
  for (const r of unread) out[notificationCategory(r.type)].unread += r.count;
  return NOTIFICATION_CATEGORIES.map((c) => out[c]);
};
