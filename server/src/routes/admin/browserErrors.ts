import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { notFound, parse } from '../../lib/http.js';
import { BROWSER_ERROR_STATUSES, groupView, recentNewCount, RETENTION_DAYS } from '../../lib/browserErrors/service.js';

/**
 * Browser error log "Brauzer xətaları" (mounted on /api/admin/browser-errors, ADMIN+ in index.ts):
 *   GET   /          ?status=NEW|RESOLVED|IGNORED&q=&page=   groups by fingerprint, most recent first, counts per status
 *   GET   /summary   { newLast24h }                            number on the admin nav badge
 *   PATCH /:id       { status }                                mark as resolved / ignored / new (audited)
 */
export const adminBrowserErrorsRouter = Router();

const PAGE = 50;

adminBrowserErrorsRouter.get('/summary', async (_req, res) => {
  res.json({ newLast24h: await recentNewCount() });
});

adminBrowserErrorsRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(BROWSER_ERROR_STATUSES).optional(),
      q: z.string().max(100).optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }),
    req.query,
  );
  const text = q.q?.trim();
  const where: Prisma.BrowserErrorGroupWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(text ? { OR: [{ message: { contains: text } }, { route: { contains: text } }] } : {}),
  };
  const [rows, total, grouped, newLast24h] = await Promise.all([
    prisma.browserErrorGroup.findMany({ where, orderBy: { lastSeenAt: 'desc' }, skip: (q.page - 1) * PAGE, take: PAGE }),
    prisma.browserErrorGroup.count({ where }),
    prisma.browserErrorGroup.groupBy({ by: ['status'], _count: { _all: true } }),
    recentNewCount(),
  ]);
  res.json({
    items: rows.map(groupView),
    total,
    page: q.page,
    pageSize: PAGE,
    counts: Object.fromEntries(BROWSER_ERROR_STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0])),
    newLast24h,
    retentionDays: RETENTION_DAYS,
  });
});

adminBrowserErrorsRouter.patch('/:id', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(BROWSER_ERROR_STATUSES) }), req.body ?? {});
  const row = await prisma.browserErrorGroup.findUnique({ where: { id: String(req.params.id) } });
  if (!row) throw notFound();
  const saved = await prisma.browserErrorGroup.update({
    where: { id: row.id },
    data: { status, statusAt: new Date(), statusById: req.user!.id },
  });
  void audit(req, 'BROWSER_ERROR_STATUS', `browser-error:${row.id}`, { from: row.status, to: status });
  res.json({ item: groupView(saved) });
});
