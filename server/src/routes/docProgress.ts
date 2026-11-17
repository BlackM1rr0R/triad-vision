import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { docProgressForClient } from '../lib/docProgress/service.js';

/**
 * Client portal — "Sənədlərimin vəziyyəti", mounted at /api/doc-progress:
 *   GET /cases/:id   the process overview of one of the caller's own cases (404 for any other case):
 *                    steps with dates, documents per stage with counts per status, the team's document stage
 *                    (Schon geschrieben / In Bearbeitung / Fertig / Ablehnung) as information, and the
 *                    "embassy documents are being collected" card while the client waits for the work contract.
 */
export const docProgressRouter = Router();
docProgressRouter.use(requireAuth);

docProgressRouter.get('/cases/:id', async (req, res) => {
  res.json({ overview: await docProgressForClient(String(req.params.id), req.user!.id) });
});
