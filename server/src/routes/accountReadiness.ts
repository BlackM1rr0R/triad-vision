import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { forbidden, parse } from '../lib/http.js';
import { moneyInput, WEIGHTS } from '../lib/readiness/score.js';
import { readinessFor, saveMoney } from '../lib/readiness/service.js';

/**
 * Germany readiness score — mounted at /api/account/readiness (CLIENT only, always the signed-in client's own data):
 *   GET  /        score 0–100, sub-scores with weights and the next step each, history (one snapshot per day)
 *   PUT  /money   the money self-check answers (partial updates allowed); returns the new score
 */
export const accountReadinessRouter = Router();
accountReadinessRouter.use(requireAuth);
accountReadinessRouter.use((req, _res, next) => (req.user?.role === 'CLIENT' ? next() : next(forbidden())));

accountReadinessRouter.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ ...(await readinessFor(req.user!.id)), weights: WEIGHTS });
});

accountReadinessRouter.put('/money', async (req, res) => {
  const body = parse(moneyInput, req.body);
  await saveMoney(req.user!.id, body);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ ...(await readinessFor(req.user!.id)), weights: WEIGHTS });
});
