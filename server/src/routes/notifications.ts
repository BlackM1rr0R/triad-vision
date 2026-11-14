import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, parse } from '../lib/http.js';
import { NOTIFICATION_CATEGORIES, categoryCounts, categoryWhere, notificationCategory } from '../lib/notificationCenter.js';

/**
 * The signed-in user's in-app notifications (every role: staff bell, client portal, employer / agent / partner
 * portals). Only ever the caller's own rows.
 *
 *   GET  /?limit=50&cursor=<id>&category=case|document|message|task|finance|system&unread=1
 *        { items: [...with category], unread, nextCursor }   newest first; keyset paging by (createdAt, id)
 *   GET  /summary                       { unread, total, categories: [{ key, total, unread }] }
 *   POST /read   { ids? , category? }   marks read (none = all, or all of a category); the first read time stays
 *   POST /unread { ids }                marks read notifications unread again
 * New notifications reach the browser as the SSE event 'notification' (lib/messaging/realtime).
 */
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const flag = z.enum(['1', 'true', '0', 'false']).transform((v) => v === '1' || v === 'true');
const category = z.enum(NOTIFICATION_CATEGORIES);
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(40).optional(),
  category: category.optional(),
  unread: flag.optional(),
});

notificationsRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const userId = req.user!.id;
  const and: Prisma.NotificationWhereInput[] = [{ userId }];
  if (q.category) and.push(categoryWhere(q.category));
  if (q.unread) and.push({ readAt: null });
  if (q.cursor) {
    const at = await prisma.notification.findFirst({ where: { id: q.cursor, userId }, select: { id: true, createdAt: true } });
    if (!at) throw badRequest('INVALID_CURSOR');
    and.push({ OR: [{ createdAt: { lt: at.createdAt } }, { createdAt: at.createdAt, id: { lt: at.id } }] });
  }
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where: { AND: and }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.limit + 1 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  const items = rows.slice(0, q.limit).map((n) => ({ ...n, category: notificationCategory(n.type) }));
  res.json({ items, unread, nextCursor: rows.length > q.limit ? items[items.length - 1].id : null });
});

notificationsRouter.get('/summary', async (req, res) => {
  const userId = req.user!.id;
  const [all, unread] = await Promise.all([
    prisma.notification.groupBy({ by: ['type'], where: { userId }, _count: { _all: true } }),
    prisma.notification.groupBy({ by: ['type'], where: { userId, readAt: null }, _count: { _all: true } }),
  ]);
  const cats = categoryCounts(
    all.map((r) => ({ type: r.type, count: r._count._all })),
    unread.map((r) => ({ type: r.type, count: r._count._all })),
  );
  res.json({ unread: cats.reduce((a, c) => a + c.unread, 0), total: cats.reduce((a, c) => a + c.total, 0), categories: cats });
});

notificationsRouter.post('/read', async (req, res) => {
  const { ids, category: cat } = parse(z.object({ ids: z.array(z.string().max(40)).max(500).optional(), category: category.optional() }), req.body ?? {});
  await prisma.notification.updateMany({
    where: { AND: [{ userId: req.user!.id, readAt: null }, ...(ids ? [{ id: { in: ids } }] : []), ...(cat ? [categoryWhere(cat)] : [])] },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});

notificationsRouter.post('/unread', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().max(40)).min(1).max(500) }), req.body ?? {});
  await prisma.notification.updateMany({ where: { userId: req.user!.id, id: { in: ids }, readAt: { not: null } }, data: { readAt: null } });
  res.json({ ok: true });
});
