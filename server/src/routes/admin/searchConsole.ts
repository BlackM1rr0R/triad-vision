import { Router } from 'express';
import { searchPerformance } from '../../lib/searchConsole.js';

/**
 * Admin → Search performance (/admin/search-performance, ADMIN+): Google Search Console data of the last 28 days
 * (totals, top queries, top pages, clicks per day), cached 6 h — lib/searchConsole.ts. Not configured: the setup
 * state (which env vars are missing, the service account e-mail to add in Search Console).
 *   GET /api/admin/search-console?refresh=1
 */
export const adminSearchConsoleRouter = Router();

adminSearchConsoleRouter.get('/', async (req, res) => {
  res.json(await searchPerformance({ refresh: req.query.refresh === '1' }));
});
