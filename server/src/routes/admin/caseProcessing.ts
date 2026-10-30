import { Router } from 'express';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { notFound, parse } from '../../lib/http.js';
import { boardQuery, claimCase, claimSchema, moveSchema, moveStage, processingBoard, processingView } from '../../lib/caseProcessing/index.js';
import { foldersQuery, processingFolders } from '../../lib/caseProcessing/folders.js';

/**
 * Team document workflow of a case (lib/caseProcessing), mounted on the admin router (STAFF+):
 *
 *   GET  /cases/:id/processing        stage, who/when, next assignee, history, document list (drive folder + uploads)
 *   POST /cases/:id/processing        { stage: IN_PROGRESS | WRITTEN | DONE | REFUSED, assigneeId?, note?, origin? }
 *   POST /cases/:id/processing/claim  "Götür": the viewer becomes the assignee ({ force? } takes it from a colleague)
 *   GET  /case-processing/board       cases per stage (?partnerId, ?assignee=me|<id>, ?search)
 *   GET  /case-processing/folders     "İş axını" of the documents section: client folders of one stage (?stage, ?mine, ?search)
 */
export const adminCaseProcessingRouter = Router();

const actorOf = async (id: string) => {
  const actor = await prisma.user.findUnique({ where: { id }, select: { id: true, firstName: true, lastName: true } });
  if (!actor) throw notFound('USER_NOT_FOUND');
  return actor;
};

adminCaseProcessingRouter.get('/cases/:id/processing', async (req, res) => {
  res.json({ processing: await processingView(String(req.params.id)) });
});

adminCaseProcessingRouter.post('/cases/:id/processing', async (req, res) => {
  const body = parse(moveSchema, req.body);
  const caseId = String(req.params.id);
  const moved = await moveStage(caseId, await actorOf(req.user!.id), body);
  await audit(req, 'CASE_PROCESSING_MOVED', `case:${caseId}`, { ...moved, assigneeId: body.assigneeId ?? null, ...(body.origin ? { origin: body.origin } : {}) });
  res.json({ processing: await processingView(caseId) });
});

adminCaseProcessingRouter.post('/cases/:id/processing/claim', async (req, res) => {
  const body = parse(claimSchema, req.body ?? {});
  const caseId = String(req.params.id);
  const r = await claimCase(caseId, await actorOf(req.user!.id), body);
  if (r.claimed) await audit(req, 'CASE_PROCESSING_CLAIMED', `case:${caseId}`, { stage: r.stage, previousAssigneeId: r.previousAssigneeId, ...(body.origin ? { origin: body.origin } : {}) });
  res.json({ claimed: r.claimed, processing: await processingView(caseId) });
});

adminCaseProcessingRouter.get('/case-processing/board', async (req, res) => {
  const q = parse(boardQuery, req.query);
  res.json(await processingBoard(q, req.user!.id));
});

adminCaseProcessingRouter.get('/case-processing/folders', async (req, res) => {
  const q = parse(foldersQuery, req.query);
  res.json(await processingFolders(q, { id: req.user!.id, role: req.user!.role }));
});
