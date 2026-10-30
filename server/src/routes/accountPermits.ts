import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { forbidden } from '../lib/http.js';
import { clientPermits } from '../lib/permits/service.js';

/**
 * Client portal: the worker's own permit dates after the visa (residence permit / EU Blue Card, health
 * insurance, passport) with days left — mounted at /api/account/permits (before the account router).
 *
 *   GET /    { items: [{ item, expiresAt, daysLeft, tone, case }] } — empty before an approved case
 */
export const accountPermitsRouter = Router();
accountPermitsRouter.use(requireAuth);
accountPermitsRouter.use((req, _res, next) => (req.user?.role === 'CLIENT' ? next() : next(forbidden())));

accountPermitsRouter.get('/', async (req, res) => {
  res.json(await clientPermits(req.user!.id));
});
