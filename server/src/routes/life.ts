import { Router, type Response } from 'express';
import { limiter, parse } from '../lib/http.js';
import { getEurAzn } from '../lib/life/cbar.js';
import { lifeConfig, lifeEstimate, lifeQuerySchema } from '../lib/life/service.js';
import { publicLiveNumbers } from '../lib/life/liveNumbers.js';

/**
 * "Life in Germany" — mounted at /api/life (public, no login):
 *   GET /config         simulator professions (salary ranges), cities, defaults, EUR → AZN rate (CBAR)
 *   GET /estimate       monthly life budget for ?profession&city&household&children&taxClass&housing&gross
 *   GET /rate           EUR → AZN (CBAR, fetched server-side at most daily; last known rate as fallback)
 *   GET /live-numbers   board "this month": visas granted, arrivals, top professions / cities (≥ 3 each, 1 h cache)
 */
export const lifeRouter = Router();

const publicCache = (res: Response, seconds: number) => res.setHeader('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=600`);
const estimateLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });

lifeRouter.get('/config', async (_req, res) => {
  publicCache(res, 300);
  res.json(await lifeConfig());
});

lifeRouter.get('/estimate', estimateLimiter, async (req, res) => {
  const r = await lifeEstimate(parse(lifeQuerySchema, req.query));
  publicCache(res, 300);
  res.json(r);
});

lifeRouter.get('/rate', async (_req, res) => {
  publicCache(res, 900);
  res.json({ rate: await getEurAzn({ waitMs: 3000 }) });
});

lifeRouter.get('/live-numbers', async (_req, res) => {
  publicCache(res, 600);
  res.json(await publicLiveNumbers());
});
