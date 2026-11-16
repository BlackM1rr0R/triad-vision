import { Router } from 'express';
import { limiter } from '../lib/http.js';
import { K_MIN } from '../lib/realSalaries/aggregate.js';
import { publicRealSalaries } from '../lib/realSalaries/service.js';

/**
 * Real salary database — mounted at /api/real-salaries (public, no login):
 *   GET /   the monthly snapshot: P25 / median / P75 (rounded to 50 €) and a sample-size band per profession ×
 *           city and profession nationwide, only groups with ≥ 3 distinct workers and no dominant value.
 * Never single contracts, exact counts or employer names (lib/realSalaries/aggregate.ts).
 */
export const realSalariesRouter = Router();

realSalariesRouter.get('/', limiter({ windowMs: 60 * 1000, limit: 120 }), async (_req, res) => {
  const data = await publicRealSalaries();
  res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600');
  res.json({ ...data, kMin: K_MIN });
});
