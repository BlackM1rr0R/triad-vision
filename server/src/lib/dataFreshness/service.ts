import type { Locale } from '@prisma/client';
import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { FRESHNESS_ITEMS, freshnessItem, type FreshnessItem } from './registry.js';
import { nextDue, reminderKinds, statusOf, type FreshnessStatus } from './schedule.js';
import { FRESHNESS_TEXT } from './texts.js';

/**
 * Data freshness (/api/admin/data-freshness, ADMIN+): the registry with each item's latest review, next due date
 * and status; "mark reviewed" stores reviewer + date + note; the daily job reminds admins 30 days before and on the
 * due date, once per item and due date (ReminderLog keys `data-freshness:<soon|due>:<id>:<due>`).
 */

/** Source repository (file links in the admin list). */
export const REPO_BLOB_URL = 'https://github.com/BlackM1rr0R/triad-vision/blob/main/';

const today = (now: Date) => now.toISOString().slice(0, 10);

const latestReviews = async () => {
  const rows = await prisma.dataFreshnessReview.findMany({ orderBy: { reviewedAt: 'desc' } });
  const latest = new Map<string, (typeof rows)[number]>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!latest.has(r.itemId)) latest.set(r.itemId, r);
    counts.set(r.itemId, (counts.get(r.itemId) ?? 0) + 1);
  }
  return { latest, counts };
};

export interface FreshnessRow extends FreshnessItem {
  due: string | null;
  status: FreshnessStatus;
  reviews: number;
  lastReview: { at: string; by: string; note: string | null } | null;
  fileUrls: string[];
}

export const listFreshness = async (now = new Date()) => {
  const { latest, counts } = await latestReviews();
  const items: FreshnessRow[] = FRESHNESS_ITEMS.map((item) => {
    const last = latest.get(item.id) ?? null;
    const due = nextDue(item, last?.reviewedAt ?? null);
    return {
      ...item,
      due,
      status: statusOf(due, now),
      reviews: counts.get(item.id) ?? 0,
      lastReview: last ? { at: last.reviewedAt.toISOString(), by: last.reviewerName, note: last.note } : null,
      fileUrls: item.files.map((f) => REPO_BLOB_URL + f.path),
    };
  });
  return { today: today(now), items };
};

export const reviewHistory = async (itemId: string) => {
  if (!freshnessItem(itemId)) throw notFound('ITEM_NOT_FOUND');
  const rows = await prisma.dataFreshnessReview.findMany({ where: { itemId }, orderBy: { reviewedAt: 'desc' }, take: 50 });
  return rows.map((r) => ({ at: r.reviewedAt.toISOString(), by: r.reviewerName, note: r.note, settledDue: r.settledDue, nextDue: r.nextDue }));
};

export const markReviewed = async (itemId: string, reviewer: { id: string; name: string }, note: string | null, now = new Date()) => {
  const item = freshnessItem(itemId);
  if (!item) throw notFound('ITEM_NOT_FOUND');
  const last = await prisma.dataFreshnessReview.findFirst({ where: { itemId }, orderBy: { reviewedAt: 'desc' } });
  const settledDue = nextDue(item, last?.reviewedAt ?? null);
  const next = nextDue(item, now);
  await prisma.dataFreshnessReview.create({
    data: { itemId, reviewedById: reviewer.id, reviewerName: reviewer.name.slice(0, 200), note: note || null, settledDue, nextDue: next, reviewedAt: now },
  });
  return { itemId, settledDue, nextDue: next, status: statusOf(next, now) };
};

/**
 * Daily job: for each item 30 days before its due date ("soon") and from the due date on ("due"), one notification
 * per kind and due date. All new hits of a run go out as one notification per active ADMIN / SUPER_ADMIN, in their
 * language. Returns the number of items notified.
 */
export const runFreshnessReminders = async (now = new Date()) => {
  const { latest } = await latestReviews();
  const hits: Array<{ item: FreshnessItem; kind: 'soon' | 'due'; due: string; key: string }> = [];
  for (const item of FRESHNESS_ITEMS) {
    const due = nextDue(item, latest.get(item.id)?.reviewedAt ?? null);
    if (!due) continue;
    for (const kind of reminderKinds(due, now)) hits.push({ item, kind, due, key: `data-freshness:${kind}:${item.id}:${due}` });
  }
  if (!hits.length) return 0;
  const sent = new Set((await prisma.reminderLog.findMany({ where: { key: { in: hits.map((h) => h.key) } }, select: { key: true } })).map((r) => r.key));
  const fresh = hits.filter((h) => !sent.has(h.key));
  if (!fresh.length) return 0;
  // Claim the keys first (unique): a parallel run (second API instance) skips what this one claimed.
  const claimed: typeof fresh = [];
  for (const h of fresh) {
    try {
      await prisma.reminderLog.create({ data: { key: h.key } });
      claimed.push(h);
    } catch {
      /* already claimed */
    }
  }
  if (!claimed.length) return 0;
  const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, locale: true } });
  for (const a of admins) {
    const T = FRESHNESS_TEXT[a.locale as Locale] ?? FRESHNESS_TEXT.az;
    const label = (i: FreshnessItem) => (a.locale === 'az' ? i.label.az : i.label.en);
    const body = claimed.map((h) => (h.kind === 'due' ? T.due(label(h.item), h.due) : T.soon(label(h.item), h.due))).join('\n');
    await notifyUser(a.id, { type: 'DATA_FRESHNESS', title: T.title(claimed.length), body, link: '/admin/data-freshness', ctaLabel: T.cta });
  }
  return claimed.length;
};
