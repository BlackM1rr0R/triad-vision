import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { forbidden } from '../lib/http.js';
import { clientOverview } from '../lib/caseContracts/service.js';

/**
 * Client portal: the two contracts of the client's own case (Əmək müqaviləsi, then İş müqaviləsi) — mounted at
 * /api/account/case-contracts (before the account router). Signing itself happens on /account/signatures.
 *
 *   GET /cases/:caseId   per step: waiting for Triad Vision / waiting for you / signed / approved, the client's
 *                        signer id (link to the signing page) and the signed PDF (case document) once complete
 */
export const accountCaseContractsRouter = Router();
accountCaseContractsRouter.use(requireAuth);
accountCaseContractsRouter.use((req, _res, next) => (req.user?.role === 'CLIENT' ? next() : next(forbidden())));

accountCaseContractsRouter.get('/cases/:caseId', async (req, res) => {
  res.json(await clientOverview(String(req.params.caseId), req.user!.id));
});
