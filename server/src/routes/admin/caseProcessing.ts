import { Router } from 'express';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { notFound, parse } from '../../lib/http.js';
import { boardQuery, moveSchema, moveStage, processingBoard, processingView } from '../../lib/caseProcessing/index.js';

/**
 * Team document workflow of a case (lib/caseProcessing), mounted on the admin router (STAFF+):
 *
 *   GET  /cases/:id/processing        stage, who/when, next assignee, history, document list (drive folder + uploads)
 *   POST /cases/:id/processing        { stage: IN_PROGRESS | WRITTEN | DONE | REFUSED, assigneeId?, note? }
 *   GET  /case-processing/board       cases per stage (?partnerId, ?assignee=me|<id>, ?search)
 */
export const adminCaseProcessingRouter = Router();

adminCaseProcessingRouter.get('/cases/:id/processing', async (req, res) => {
  res.json({ processing: await processingView(String(req.params.id)) });
});

adminCaseProcessingRouter.post('/cases/:id/processing', async (req, res) => {
  const body = parse(moveSchema, req.body);
  const caseId = String(req.params.id);
  const actor = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, firstName: true, lastName: true } });
  if (!actor) throw notFound('USER_NOT_FOUND');
  const moved = await moveStage(caseId, actor, body);
  await audit(req, 'CASE_PROCESSING_MOVED', `case:${caseId}`, { ...moved, assigneeId: body.assigneeId ?? null });
  res.json({ processing: await processingView(caseId) });
});

adminCaseProcessingRouter.get('/case-processing/board', async (req, res) => {
  const q = parse(boardQuery, req.query);
  res.json(await processingBoard(q, req.user!.id));
});
