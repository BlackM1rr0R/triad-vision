import { Router } from 'express';
import { limiter, parse } from '../lib/http.js';
import { familyCheckSchema, familySelfCheck } from '../lib/family/publicCheck.js';

/**
 * Family reunification self-check — mounted at /api/family-check (public, no login, no AI, nothing stored):
 *   GET /   ?title&issued&net&gross&rent&space&spouse&spouseAge&spouseGerman&children&parents
 *           → per person "now / likely / after / check / no", the gaps (codes + numbers) and the document list.
 * Same rules as the case readiness check (lib/family/legal.ts). Rate limited per IP.
 */
export const familyCheckRouter = Router();

const checkLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

familyCheckRouter.get('/', checkLimiter, (req, res) => {
  const r = familySelfCheck(parse(familyCheckSchema, req.query));
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.json(r);
});
