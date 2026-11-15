import { Router } from 'express';
import { limiter, parse } from '../lib/http.js';
import { whenQuerySchema } from '../lib/whenInGermany/estimate.js';
import { whenEstimate } from '../lib/whenInGermany/service.js';

/**
 * "When could I be in Germany?" — mounted at /api/when-in-germany (public, no login, no AI):
 *   GET /estimate   ?profession&education&german&documents&recognition&route → arrival month + stage timeline.
 *                   Unknown / missing values fall back to the defaults, so the bare page renders an example.
 * Durations: percentiles of our case history (daily cache, groups ≥ 10 cases only) or documented estimates.
 */
export const whenInGermanyRouter = Router();

const estimateLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });

whenInGermanyRouter.get('/estimate', estimateLimiter, async (req, res) => {
  const r = await whenEstimate(parse(whenQuerySchema, req.query));
  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600');
  res.json(r);
});
