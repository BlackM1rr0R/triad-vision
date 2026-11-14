import { Router } from 'express';
import { searchPerformance, urlInspection } from '../../lib/searchConsole.js';

/**
 * Admin → Search performance (/admin/search-performance, ADMIN+): Google Search Console data of the last 28 days
 * (totals, top queries, top pages, clicks per day, opportunities: striking distance, low CTR, per-language
 * breakdown, duplicate URLs), cached 6 h — lib/searchConsole.ts. Not configured: the setup state (which env vars
 * are missing, the service account e-mail to add in Search Console).
 *   GET /api/admin/search-console?refresh=1             (refresh: only when the cache is older than 10 min)
 *   GET /api/admin/search-console/inspection?refresh=1  URL Inspection of the key pages in every language,
 *                                                       cached 24 h (refresh: only when older than 1 h)
 */
export const adminSearchConsoleRouter = Router();

adminSearchConsoleRouter.get('/', async (req, res) => {
  res.json(await searchPerformance({ refresh: req.query.refresh === '1' }));
});

adminSearchConsoleRouter.get('/inspection', async (req, res) => {
  res.json(await urlInspection({ refresh: req.query.refresh === '1' }));
});
