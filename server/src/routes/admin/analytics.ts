import { Router } from 'express';
import { z } from 'zod';
import { badRequest, parse } from '../../lib/http.js';
import { computeAnalytics } from '../../lib/funnel.js';

// Admin: analytics — mounted at /api/admin/analytics (staff and above; aggregates only, no personal data)
export const adminAnalyticsRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 731;
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

adminAnalyticsRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({ from: isoDay.optional(), to: isoDay.optional(), groupBy: z.enum(['day', 'week', 'month']).optional() }),
    req.query,
  );
  const to = q.to ? new Date(`${q.to}T00:00:00Z`) : todayUtc();
  const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(to.getTime() - 29 * DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw badRequest('INVALID_DATE');
  if (from > to) throw badRequest('INVALID_RANGE');
  const days = Math.round((to.getTime() - from.getTime()) / DAY) + 1;
  if (days > MAX_RANGE_DAYS) throw badRequest('RANGE_TOO_LONG');
  const groupBy = q.groupBy ?? (days > 120 ? 'month' : days > 45 ? 'week' : 'day');
  res.json(await computeAnalytics({ from, to, groupBy }));
});
