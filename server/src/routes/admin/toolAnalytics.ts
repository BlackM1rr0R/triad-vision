import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { ANALYTICS_PERIODS } from '../../lib/toolAnalytics/compute.js';
import { toolAnalyticsReport } from '../../lib/toolAnalytics/service.js';
import { audit } from '../../lib/audit.js';
import { featurableToolPaths, featuredInput, getFeaturedTools, setFeaturedTools, DEFAULT_FEATURED_TOOLS } from '../../lib/featuredTools.js';
import { requireMinRole } from '../../middleware/auth.js';

/**
 * Admin: tool analytics — mounted at /api/admin/tool-analytics (staff and above; aggregates only, no personal data).
 *   GET /?days=7|30|90   per tool: views, interactions, result e-mails, attributed registrations / inquiries,
 *                        conversion %, change against the previous period, daily views (sparkline) + totals.
 *   GET /featured        the "most useful" tools of /tools (ordered paths) + every path that may be featured
 *   PUT /featured        { paths } save the order (ADMIN+, audited; [] = back to the default list)
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

adminToolAnalyticsRouter.get('/featured', async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ ...(await getFeaturedTools()), available: featurableToolPaths(), defaults: DEFAULT_FEATURED_TOOLS });
});

adminToolAnalyticsRouter.put('/featured', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(featuredInput, req.body);
  const saved = await setFeaturedTools(body.paths);
  await audit(req, 'FEATURED_TOOLS_UPDATED', 'tools', { paths: saved.paths });
  res.json({ ...saved, available: featurableToolPaths(), defaults: DEFAULT_FEATURED_TOOLS });
});
