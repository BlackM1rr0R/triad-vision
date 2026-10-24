import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { forbidden } from '../lib/http.js';
import { clientRecognition } from '../lib/recognition/service.js';

/**
 * Client portal: read-only recognition status (Anerkennung) of the client's own case — mounted at
 * /api/account/recognition (before the account router).
 *
 *   GET /cases/:caseId   processes: procedure, authority, status timeline, deficits / adaptation measure,
 *                        checklist progress and what the client still has to send (no internal notes)
 */
export const accountRecognitionRouter = Router();
accountRecognitionRouter.use(requireAuth);
accountRecognitionRouter.use((req, _res, next) => (req.user?.role === 'CLIENT' ? next() : next(forbidden())));

accountRecognitionRouter.get('/cases/:caseId', async (req, res) => {
  res.json({ items: await clientRecognition(String(req.params.caseId), req.user!.id) });
});
