import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { ANALYTICS_PERIODS } from '../../lib/toolAnalytics/compute.js';
import { toolAnalyticsReport } from '../../lib/toolAnalytics/service.js';

/**
 * Admin: tool analytics — mounted at /api/admin/tool-analytics (staff and above; aggregates only, no personal data).
 *   GET /?days=7|30|90   per tool: views, interactions, result e-mails, attributed registrations / inquiries,
 *                        conversion %, change against the previous period, daily views (sparkline) + totals.
 */
export const adminToolAnalyticsRouter = Router();

adminToolAnalyticsRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({ days: z.coerce.number().int().refine((n) => (ANALYTICS_PERIODS as readonly number[]).includes(n), 'INVALID_PERIOD').default(30) }),
    req.query,
  );
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await toolAnalyticsReport(q.days));
});
