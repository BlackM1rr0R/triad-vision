import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { bakuParts, bakuMidnight } from '../reports/dates.js';
import { auditRows } from './whoCanSee.js';
import { auditText } from './texts.js';

/**
 * Quarterly access reviews. On days 1–7 of a quarter (Baku time; the window covers a server that was down on
 * day 1) the scheduler creates ONE review for the quarter (unique quarter + ReminderLog key, so idempotent): every
 * account with elevated access or inactive for > 90 days, plus the break-glass usage of the previous quarter. The
 * super admins are notified; on the review page they confirm each account or jump to edit it, then complete.
 */

export const REVIEW_WINDOW_DAYS = 7;
export const REVIEW_STATUSES = ['PENDING', 'CONFIRMED', 'CHANGED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Pure: "2026-Q4" of a Baku date. */
export const quarterOf = (d: Date) => {
  const p = bakuParts(d);
  return `${p.y}-Q${Math.floor(p.m / 3) + 1}`;
};

/** Pure: first instant (Baku midnight) of the quarter of `d`, and of the previous quarter. */
export const quarterBounds = (d: Date) => {
  const p = bakuParts(d);
  const qm = Math.floor(p.m / 3) * 3;
  const start = bakuMidnight(p.y, qm, 1);
  const prevStart = bakuMidnight(qm === 0 ? p.y - 1 : p.y, qm === 0 ? 9 : qm - 3, 1);
  return { start, prevStart };
};

/** Pure: whether `d` lies in the creation window (days 1–7 of a quarter, Baku time). */
export const inReviewWindow = (d: Date) => {
  const p = bakuParts(d);
  return p.m % 3 === 0 && p.d <= REVIEW_WINDOW_DAYS;
};

const reminderKey = (quarter: string) => `access-review:${quarter}`;

/** Creates the review of the quarter of `now` (force = outside the window too). Returns null when it exists. */
export const createQuarterlyReview = async (now = new Date(), opts: { force?: boolean } = {}) => {
  if (!opts.force && !inReviewWindow(now)) return null;
  const quarter = quarterOf(now);
  if (await prisma.accessReview.findUnique({ where: { quarter }, select: { id: true } })) return null;
  // ReminderLog marks the quarter (kept for the reminder history); the unique quarter column is the real guard
  // against a parallel run, so a run that crashed after the mark can still create the review later in the window.
  await prisma.reminderLog.create({ data: { key: reminderKey(quarter) } }).catch(() => undefined);

  const rows = await auditRows({ elevated: true }, now);
  const { start, prevStart } = quarterBounds(now);
  const grants = await prisma.breakGlassGrant.findMany({ where: { createdAt: { gte: prevStart, lt: start } }, select: { userId: true } });
  const byUser = new Map<string, number>();
  for (const g of grants) byUser.set(g.userId, (byUser.get(g.userId) ?? 0) + 1);
  const summary = { breakGlass: { total: grants.length, byUser: Object.fromEntries(byUser) }, accounts: rows.length, period: { from: prevStart.toISOString(), to: start.toISOString() } };

  let review;
  try {
    review = await prisma.accessReview.create({
      data: {
        quarter,
        summary: summary as Prisma.InputJsonValue,
        items: { create: rows.map((r) => ({ userId: r.userId, kind: r.kind, reasons: [...r.reasons, ...(byUser.get(r.userId) ? ['BREAK_GLASS_USED'] : [])] })) },
      },
    });
  } catch {
    return null; // created by a parallel run (unique quarter)
  }
  const supers = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true, locale: true } });
  for (const s of supers) {
    const t = auditText(s.locale);
    await notifyUser(s.id, { type: 'ACCESS_REVIEW', title: t.reviewTitle(quarter), body: t.reviewBody(rows.length, grants.length), link: `/admin/access?tab=audit&review=${review.id}`, push: true, email: true, forceEmail: true }).catch(
      () => undefined,
    );
  }
  return review;
};

export const listReviews = () =>
  prisma.accessReview.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { _count: { select: { items: true } } } });

export const reviewDetail = async (id: string) => {
  const r = await prisma.accessReview.findUnique({ where: { id }, include: { items: { orderBy: { kind: 'asc' } } } });
  if (!r) throw notFound('REVIEW_NOT_FOUND');
  const users = await prisma.user.findMany({
    where: { id: { in: r.items.map((i) => i.userId) } },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    ...r,
    items: r.items.map((i) => {
      const u = byId.get(i.userId);
      return { ...i, user: u ? { id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, role: u.role, isActive: u.isActive } : null };
    }),
  };
};

export const decideItem = async (itemId: string, status: Exclude<ReviewStatus, 'PENDING'>, byId: string, note?: string) => {
  const item = await prisma.accessReviewItem.findUnique({ where: { id: itemId }, include: { review: { select: { completedAt: true } } } });
  if (!item) throw notFound('ITEM_NOT_FOUND');
  if (item.review.completedAt) throw new HttpError(409, 'REVIEW_COMPLETED');
  const updated = await prisma.accessReviewItem.update({ where: { id: item.id }, data: { status, note: note?.slice(0, 500) ?? null, decidedById: byId, decidedAt: new Date() } });
  return { before: item.status, item: updated };
};

export const completeReview = async (id: string, byId: string) => {
  const r = await prisma.accessReview.findUnique({ where: { id }, include: { items: { select: { status: true } } } });
  if (!r) throw notFound('REVIEW_NOT_FOUND');
  if (r.completedAt) return r;
  if (r.items.some((i) => i.status === 'PENDING')) throw new HttpError(409, 'ITEMS_PENDING');
  return prisma.accessReview.update({ where: { id }, data: { completedAt: new Date(), completedById: byId } });
};
