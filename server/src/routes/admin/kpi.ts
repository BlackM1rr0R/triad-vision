import { Router } from 'express';
import { z } from 'zod';
import { requireMinRole } from '../../middleware/auth.js';
import { notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { isMonth } from '../../lib/kpi/compute.js';
import { kpiCsv, staffKpiCard, teamKpis } from '../../lib/kpi/service.js';

/**
 * Staff KPI — /api/admin/kpi (STAFF+; the team view and other people's cards are ADMIN+).
 *
 *   GET /me?month=YYYY-MM              own KPI card (workspace "KPI-m")
 *   GET /team?month=YYYY-MM            leaderboard: every active staff member, team average, 6-month series
 *   GET /team/export.csv?month=        the leaderboard as CSV
 *   GET /staff/:id?month=YYYY-MM       one person's card (staff detail page)
 *
 * Computations: lib/kpi (compute.ts is pure and unit tested).
 */
export const adminKpiRouter = Router();

const monthQuery = z.object({ month: z.string().refine(isMonth, 'INVALID_MONTH').optional() });

adminKpiRouter.get('/me', async (req, res) => {
  const { month } = parse(monthQuery, req.query);
  res.json(await staffKpiCard(req.user!.id, month));
});

adminKpiRouter.get('/team', requireMinRole('ADMIN'), async (req, res) => {
  const { month } = parse(monthQuery, req.query);
  res.json(await teamKpis(month));
});

adminKpiRouter.get('/team/export.csv', requireMinRole('ADMIN'), async (req, res) => {
  const { month } = parse(monthQuery, req.query);
  const data = await teamKpis(month);
  await audit(req, 'KPI_EXPORTED', undefined, { month: data.month, rows: data.rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="staff-kpi-${data.month}.csv"`);
  res.send(kpiCsv(data));
});

adminKpiRouter.get('/staff/:id', requireMinRole('ADMIN'), async (req, res) => {
  const { month } = parse(monthQuery, req.query);
  const card = await staffKpiCard(String(req.params.id), month);
  if (!card) throw notFound('STAFF_NOT_FOUND');
  res.json(card);
});
