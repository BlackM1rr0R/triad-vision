import { Router, type Request } from 'express';
import { parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { invalidateMyWork } from '../../lib/myWork.js';
import {
  caseHandoverInfo,
  draftSchema,
  leaveDraft,
  myHandovers,
  notePatchSchema,
  patchHandoverNote,
  saveLeaveDraft,
  tickChecklist,
  tickSchema,
} from '../../lib/shifts/handoverNotes.js';

/**
 * Handover notes — /api/admin/handover-notes (STAFF+). Builds on the automatic absence handover
 * (lib/assignment/handover.ts); see lib/shifts/handoverNotes.ts.
 *
 *   GET   /mine                        my leave drafts, cases I cover, my active / returned handovers (+ changes)
 *   GET   /leave/:leaveId · PUT        draft for a leave { general: { note, checklist }, cases: { [caseId]: … } }
 *   GET   /case/:caseId                running handover of the case (note, checklist) + the last finished one
 *   PATCH /:id                         owner / ADMIN edits note + checklist of a running handover
 *   PATCH /:id/checklist               { index, done } — substitute, owner or ADMIN
 */
export const adminHandoverNotesRouter = Router();

const viewer = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

adminHandoverNotesRouter.get('/mine', async (req, res) => {
  res.json(await myHandovers(viewer(req)));
});

adminHandoverNotesRouter.get('/leave/:leaveId', async (req, res) => {
  res.json(await leaveDraft(viewer(req), String(req.params.leaveId)));
});

adminHandoverNotesRouter.put('/leave/:leaveId', async (req, res) => {
  const out = await saveLeaveDraft(viewer(req), String(req.params.leaveId), parse(draftSchema, req.body));
  void audit(req, 'HANDOVER_NOTES_SAVED', String(req.params.leaveId), { cases: out.cases.filter((c) => c.note || c.checklist.length).length, applied: out.applied });
  if (out.applied) invalidateMyWork();
  res.json(out);
});

adminHandoverNotesRouter.get('/case/:caseId', async (req, res) => {
  res.json(await caseHandoverInfo(String(req.params.caseId)));
});

adminHandoverNotesRouter.patch('/:id/checklist', async (req, res) => {
  const b = parse(tickSchema, req.body);
  const handover = await tickChecklist(viewer(req), String(req.params.id), b.index, b.done);
  invalidateMyWork(handover.substituteId);
  res.json({ handover });
});

adminHandoverNotesRouter.patch('/:id', async (req, res) => {
  const handover = await patchHandoverNote(viewer(req), String(req.params.id), parse(notePatchSchema, req.body));
  void audit(req, 'HANDOVER_NOTE_UPDATED', handover.id, { caseId: handover.caseId });
  invalidateMyWork(handover.substituteId);
  res.json({ handover });
});
