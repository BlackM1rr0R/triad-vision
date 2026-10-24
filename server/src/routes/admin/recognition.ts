import fs from 'node:fs/promises';
import { Router } from 'express';
import { z } from 'zod';
import { requireMinRole } from '../../middleware/auth.js';
import { documentUpload } from '../../middleware/upload.js';
import { audit } from '../../lib/audit.js';
import { badRequest, parse } from '../../lib/http.js';
import {
  addProcessEvent,
  caseRecognition,
  changeStatus,
  checklistInput,
  createFeeInvoice,
  createInput,
  createProcess,
  deleteProcess,
  eventInput,
  listProcesses,
  listQuery,
  relinkChecklist,
  saveChecklist,
  statusInput,
  updateInput,
  updateProcess,
  uploadLetter,
} from '../../lib/recognition/service.js';
import {
  applyStep,
  caseAccelerated,
  listProcedures,
  listQuery as accelListQuery,
  loadProcedure,
  logMessage,
  mailInput,
  messageInput,
  sendSubmission,
  sendVollmacht,
  startInput,
  startProcedure,
  stepInput,
  submissionDraft,
  updateInput as accelUpdateInput,
  updateProcedure,
  uploadProcedureDocument,
  UPLOAD_KINDS,
} from '../../lib/recognition/accelerated.js';
import { deadlineSettingsSchema, getDeadlineSettings, runRecognitionDeadlines, saveDeadlineSettings, upcomingDeadlines } from '../../lib/recognition/deadlines.js';
import { prisma } from '../../db.js';

/**
 * Recognition tracker (Anerkennung) — mounted at /api/admin/recognition (STAFF+):
 *
 *   GET    /?status&authority&type&soon&staffId   all processes + counts (status 'open' | 'all' | a status)
 *   GET    /cases/:caseId                         case card: processes, timelines, linkable documents
 *   POST   /cases/:caseId                         new process { procedureType, profession, regulated?, authority?, … }
 *   PATCH  /:id                                   fields (authority, reference, fee, deficit, adaptation, deadline …)
 *   POST   /:id/status                            { status, note?, date? } (client notified, User.recognitionStatus synced)
 *   PUT    /:id/checklist                         { items: [{ key, done, documentId? }] }
 *   POST   /:id/checklist/relink                  link items to the case's requirement documents again
 *   POST   /:id/events                            { type: NOTE | LETTER_IN | LETTER_OUT | DOCUMENT, note?, documentId?, at? }
 *   POST   /:id/letters                           multipart file + type, note?, at?, checkKey? (stored in the case drive)
 *   POST   /:id/fee-invoice                       client invoice DRAFT for the fee (lib/billing)
 *   DELETE /:id                                   ADMIN+
 *   GET    /deadlines?days&staffId                recognition + § 81a deadlines (the Expiring page)
 *   GET    /settings · PUT /settings (ADMIN+) · POST /run (ADMIN+)   deadline reminders
 */
export const adminRecognitionRouter = Router();

const id = (v: unknown) => String(v);

adminRecognitionRouter.get('/', async (req, res) => {
  res.json(await listProcesses(parse(listQuery, req.query)));
});

adminRecognitionRouter.get('/deadlines', async (req, res) => {
  const q = parse(z.object({ days: z.coerce.number().int().refine((d) => [30, 60, 90, 180].includes(d), 'days must be 30, 60, 90 or 180').default(30), staffId: z.string().trim().min(1).max(40).optional() }), req.query);
  res.json({ days: q.days, items: await upcomingDeadlines(q.days, { staffId: q.staffId }) });
});

adminRecognitionRouter.get('/settings', async (_req, res) => {
  res.json({ settings: await getDeadlineSettings() });
});

adminRecognitionRouter.put('/settings', requireMinRole('ADMIN'), async (req, res) => {
  const saved = await saveDeadlineSettings(parse(deadlineSettingsSchema, req.body?.settings ?? req.body ?? {}));
  await audit(req, 'RECOGNITION_SETTINGS', 'setting:recognitionDeadlines', saved);
  res.json({ settings: saved });
});

adminRecognitionRouter.post('/run', requireMinRole('ADMIN'), async (_req, res) => {
  res.json(await runRecognitionDeadlines());
});

adminRecognitionRouter.get('/cases/:caseId', async (req, res) => {
  res.json(await caseRecognition(id(req.params.caseId)));
});

adminRecognitionRouter.post('/cases/:caseId', async (req, res) => {
  const p = await createProcess(id(req.params.caseId), parse(createInput, req.body ?? {}), req.user!.id);
  await audit(req, 'RECOGNITION_CREATED', `recognition:${p.id}`, { caseId: p.caseId, procedureType: p.procedureType });
  res.status(201).json({ process: p });
});

adminRecognitionRouter.patch('/:id', async (req, res) => {
  res.json({ process: await updateProcess(id(req.params.id), parse(updateInput, req.body ?? {}), req.user!.id) });
});

adminRecognitionRouter.post('/:id/status', async (req, res) => {
  const body = parse(statusInput, req.body ?? {});
  const p = await changeStatus(id(req.params.id), body, req.user!.id);
  await audit(req, 'RECOGNITION_STATUS', `recognition:${p.id}`, { status: p.status });
  res.json({ process: p });
});

adminRecognitionRouter.put('/:id/checklist', async (req, res) => {
  res.json({ process: await saveChecklist(id(req.params.id), parse(checklistInput, req.body ?? {})) });
});

adminRecognitionRouter.post('/:id/checklist/relink', async (req, res) => {
  res.json({ process: await relinkChecklist(id(req.params.id)) });
});

adminRecognitionRouter.post('/:id/events', async (req, res) => {
  res.status(201).json({ event: await addProcessEvent(id(req.params.id), parse(eventInput, req.body ?? {}), req.user!.id) });
});

adminRecognitionRouter.post('/:id/letters', documentUpload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED');
  const body = z
    .object({
      type: z.enum(['LETTER_IN', 'LETTER_OUT', 'DOCUMENT']).default('LETTER_IN'),
      note: z.string().trim().max(2000).optional(),
      at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      checkKey: z.string().trim().max(40).optional(),
    })
    .safeParse(req.body ?? {});
  if (!body.success) {
    await fs.unlink(req.file.path).catch(() => undefined);
    throw badRequest('VALIDATION_ERROR');
  }
  const out = await uploadLetter(id(req.params.id), req.file, body.data, req.user!.id);
  await audit(req, 'RECOGNITION_LETTER', `recognition:${id(req.params.id)}`, { type: body.data.type, documentId: out.document.id });
  res.status(201).json(out);
});

adminRecognitionRouter.post('/:id/fee-invoice', async (req, res) => {
  const inv = await createFeeInvoice(id(req.params.id), req.user!.id);
  await audit(req, 'RECOGNITION_FEE_INVOICE', `clientInvoice:${inv.id}`, { recognitionId: id(req.params.id), grossCents: inv.grossCents });
  res.status(201).json({ invoice: { id: inv.id, status: inv.status, grossCents: inv.grossCents } });
});

adminRecognitionRouter.delete('/:id', requireMinRole('ADMIN'), async (req, res) => {
  const p = await deleteProcess(id(req.params.id));
  await audit(req, 'RECOGNITION_DELETED', `recognition:${p.id}`, { caseId: p.caseId, procedureType: p.procedureType, status: p.status });
  res.json({ ok: true });
});

/**
 * § 81a accelerated skilled-worker procedure — mounted at /api/admin/accelerated (STAFF+):
 *
 *   GET    /?status&soon&companyId                 procedures with their nearest deadline + counts
 *   GET    /cases/:caseId                          case card: procedure, steps, deadlines, correspondence, documents
 *   POST   /cases/:caseId                          start { authority?, authorityEmail?, reference?, note? } (needs the case's employer)
 *   PATCH  /:id                                    authority / e-mail / reference / note / fee / deadlines
 *   POST   /:id/step                               { action: POWER_OF_ATTORNEY | AGREEMENT | SUBMITTED | FEE_REQUESTED | FEE_PAID | IN_REVIEW
 *                                                    | PRE_APPROVAL | EMBASSY_NOTIFIED | APPOINTMENT | DECIDED | CANCEL, … }
 *   POST   /:id/documents                          multipart file + kind (POWER_OF_ATTORNEY | AGREEMENT | PRE_APPROVAL | LETTER_IN | LETTER_OUT), date?, channel?, subject?, dueAt?
 *   POST   /:id/messages                           correspondence entry { direction, channel, subject?, body?, documentId?, dueAt?, at? }
 *   GET    /:id/submission                         proposed submission e-mail (German) + suggested attachments
 *   POST   /:id/submission                         { to, subject, body, documentIds } → sent, logged OUT, status SUBMITTED
 *   POST   /:id/vollmacht                          power of attorney from the template → e-signature by the worker
 *   DELETE /:id                                    ADMIN+
 */
export const adminAcceleratedRouter = Router();

adminAcceleratedRouter.get('/', async (req, res) => {
  res.json(await listProcedures(parse(accelListQuery, req.query)));
});

adminAcceleratedRouter.get('/cases/:caseId', async (req, res) => {
  res.json(await caseAccelerated(id(req.params.caseId)));
});

adminAcceleratedRouter.post('/cases/:caseId', async (req, res) => {
  const p = await startProcedure(id(req.params.caseId), parse(startInput, req.body ?? {}), req.user!.id);
  await audit(req, 'ACCELERATED_STARTED', `accelerated:${p.id}`, { caseId: p.caseId, companyId: p.companyId });
  res.status(201).json({ procedure: p });
});

adminAcceleratedRouter.patch('/:id', async (req, res) => {
  res.json({ procedure: await updateProcedure(id(req.params.id), parse(accelUpdateInput, req.body ?? {})) });
});

adminAcceleratedRouter.post('/:id/step', async (req, res) => {
  const body = parse(stepInput, req.body ?? {});
  const p = await applyStep(id(req.params.id), body, req.user!.id);
  await audit(req, 'ACCELERATED_STEP', `accelerated:${p.id}`, { action: body.action, status: p.status });
  res.json({ procedure: p });
});

adminAcceleratedRouter.post('/:id/documents', documentUpload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED');
  const body = z
    .object({
      kind: z.enum(UPLOAD_KINDS),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      channel: z.string().max(10).optional(),
      subject: z.string().trim().max(300).optional(),
      dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .safeParse(req.body ?? {});
  if (!body.success) {
    await fs.unlink(req.file.path).catch(() => undefined);
    throw badRequest('VALIDATION_ERROR');
  }
  const out = await uploadProcedureDocument(id(req.params.id), req.file, body.data, req.user!.id);
  await audit(req, 'ACCELERATED_DOCUMENT', `accelerated:${id(req.params.id)}`, { kind: body.data.kind, documentId: out.document.id });
  res.status(201).json(out);
});

adminAcceleratedRouter.post('/:id/messages', async (req, res) => {
  res.status(201).json({ message: await logMessage(id(req.params.id), parse(messageInput, req.body ?? {}), req.user!.id) });
});

adminAcceleratedRouter.get('/:id/submission', async (req, res) => {
  res.json({ draft: await submissionDraft(id(req.params.id), req.user!) });
});

adminAcceleratedRouter.post('/:id/submission', async (req, res) => {
  const body = parse(mailInput, req.body ?? {});
  const out = await sendSubmission(id(req.params.id), body, req.user!.id);
  await audit(req, 'ACCELERATED_SUBMITTED', `accelerated:${out.procedure.id}`, { to: body.to, attachments: body.documentIds.length });
  res.status(201).json(out);
});

adminAcceleratedRouter.post('/:id/vollmacht', async (req, res) => {
  const r = await sendVollmacht(id(req.params.id), req.user!);
  await audit(req, 'ACCELERATED_VOLLMACHT_SENT', `signatureRequest:${r.id}`, { procedureId: id(req.params.id) });
  res.status(201).json({ signatureRequest: { id: r.id } });
});

adminAcceleratedRouter.delete('/:id', requireMinRole('ADMIN'), async (req, res) => {
  const p = await loadProcedure(id(req.params.id));
  await prisma.acceleratedMessage.deleteMany({ where: { procedureId: p.id } });
  await prisma.acceleratedProcedure.delete({ where: { id: p.id } });
  await audit(req, 'ACCELERATED_DELETED', `accelerated:${p.id}`, { caseId: p.caseId, status: p.status });
  res.json({ ok: true });
});
