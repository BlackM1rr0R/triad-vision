import { Router } from 'express';
import { z } from 'zod';
import { badRequest, parse } from '../../lib/http.js';
import { computeAnalytics } from '../../lib/funnel.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { OVERVIEW_PERIODS } from '../../lib/analyticsOverview/compute.js';
import { cachedOverview, goalSchema, overviewActivity, overviewCsv, writeGoal } from '../../lib/analyticsOverview/service.js';
import { BIZ_SECTIONS, bizAnalytics, bizCsv, bizQuery } from '../../lib/bizAnalytics/service.js';

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

// Management analytics (ADMIN+): stage times, partner / agent / staff performance, client funnel — lib/bizAnalytics.
adminAnalyticsRouter.get('/business', requireMinRole('ADMIN'), async (req, res) => {
  res.json(await bizAnalytics(parse(bizQuery, req.query)));
});

adminAnalyticsRouter.get('/business.csv', requireMinRole('ADMIN'), async (req, res) => {
  const { section, ...rest } = parse(z.object({ section: z.enum(BIZ_SECTIONS).default('partners') }).passthrough(), req.query);
  const q = parse(bizQuery, rest);
  const report = await bizAnalytics(q);
  await audit(req, 'BIZ_ANALYTICS_EXPORTED', section, { from: report.range.from, to: report.range.to, visaCategoryId: q.visaCategoryId ?? null });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="biznes-analitika-${section}-${report.range.from}_${report.range.to}.csv"`);
  res.send(bizCsv(report, section));
});

// ─── Overview ("İcmal", the analytics landing): lib/analyticsOverview ───────────────
// STAFF+; money (revenue, receivables, segment revenue, a revenue goal) only for ADMIN+.

const overviewQuery = z.object({ period: z.enum(OVERVIEW_PERIODS).default('month'), fresh: z.enum(['1', 'true']).optional() });

adminAnalyticsRouter.get('/overview', async (req, res) => {
  const q = parse(overviewQuery, req.query);
  res.json(await cachedOverview({ period: q.period, finance: hasMinRole(req.user!.role, 'ADMIN'), fresh: !!q.fresh }));
});

adminAnalyticsRouter.get('/overview/activity', async (req, res) => {
  const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(30).default(12) }), req.query);
  res.json(await overviewActivity({ finance: hasMinRole(req.user!.role, 'ADMIN'), limit: q.limit }));
});

adminAnalyticsRouter.get('/overview.csv', async (req, res) => {
  const q = parse(overviewQuery, req.query);
  const finance = hasMinRole(req.user!.role, 'ADMIN');
  const o = await cachedOverview({ period: q.period, finance, fresh: !!q.fresh });
  await audit(req, 'ANALYTICS_OVERVIEW_EXPORTED', q.period, { from: o.period.from, to: o.period.to, finance });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="icmal-${o.period.from}_${o.period.to}.csv"`);
  res.send(overviewCsv(o));
});

adminAnalyticsRouter.put('/overview/goal', requireMinRole('ADMIN'), async (req, res) => {
  const goal = parse(goalSchema, req.body);
  await writeGoal(goal);
  await audit(req, 'ANALYTICS_GOAL_SET', goal.metric, goal);
  res.json({ goal });
});
