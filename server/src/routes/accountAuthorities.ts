import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { forbidden } from '../lib/http.js';
import { clientCaseAuthorities } from '../lib/authorities/service.js';

/**
 * Client portal: read-only authorities of the client's own case (embassy, Ausländerbehörde, …) from the
 * authorities catalogue — mounted at /api/account/authorities (before the account router).
 *
 *   GET /cases/:caseId   address, website, e-mail, phone, opening hours, requirements, checklist, waiting time
 *                        (no internal notes, aliases or contact persons)
 */
export const accountAuthoritiesRouter = Router();
accountAuthoritiesRouter.use(requireAuth);
accountAuthoritiesRouter.use((req, _res, next) => (req.user?.role === 'CLIENT' ? next() : next(forbidden())));

accountAuthoritiesRouter.get('/cases/:caseId', async (req, res) => {
  res.json({ items: await clientCaseAuthorities(String(req.params.caseId), req.user!.id) });
});
