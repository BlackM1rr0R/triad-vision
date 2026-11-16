import { Router } from 'express';
import { trustCenterView } from '../lib/trust/public.js';

/**
 * Public Trust Center data — mounted at /api/trust (no login): measures implemented in the code, configured
 * sub-processors, owner-confirmed facts (data location only when set), AVV availability, contact links.
 */
export const trustRouter = Router();

trustRouter.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(await trustCenterView());
});
