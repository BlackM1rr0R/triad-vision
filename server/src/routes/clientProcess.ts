import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { decodeOriginalName, documentUpload, verifyUploadedFile } from '../middleware/upload.js';
import { badRequest, conflict, notFound, parse } from '../lib/http.js';
import { ballInCourtFor } from '../lib/clientProcess/ballInCourt.js';
import { clientView, completeTask, loadTask, taskInclude } from '../lib/clientProcess/tasks.js';
import { bookOfficeVisit, cancelOfficeVisit, freeOfficeSlots, listOffices, loadVisit, rescheduleOfficeVisit, visitIcs, visitInclude, visitView } from '../lib/clientProcess/office.js';
import { VISIT_REASONS } from '../lib/clientProcess/texts.js';

/**
 * Client portal / mobile app: ball-in-court, "my tasks" and office visits — mounted at /api/client-process.
 * Clients only ever see their own cases, tasks and visits (404 otherwise).
 */
export const clientProcessRouter = Router();
clientProcessRouter.use(requireAuth);

const ownCase = async (caseId: string, userId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
  if (!c || c.clientId !== userId) throw notFound('CASE_NOT_FOUND');
  return c;
};

const localeOf = async (userId: string) => (await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } }))?.locale ?? 'az';

// ─── Ball in court ────────────────────────────────────────────────────

clientProcessRouter.get('/cases/:id/ball', async (req, res) => {
  await ownCase(req.params.id, req.user!.id);
  res.json({ ball: await ballInCourtFor(req.params.id) });
});

// ─── Tasks ────────────────────────────────────────────────────────────

/** My tasks: every case of mine, or one (?caseId). Open ones first (nearest deadline), then done. */
clientProcessRouter.get('/tasks', async (req, res) => {
  const q = parse(z.object({ caseId: z.string().max(40).optional(), status: z.enum(['open', 'all']).default('all') }), req.query);
  if (q.caseId) await ownCase(q.caseId, req.user!.id);
  const tasks = await prisma.clientTask.findMany({
    where: { case: { clientId: req.user!.id }, ...(q.caseId ? { caseId: q.caseId } : {}), status: q.status === 'open' ? 'OPEN' : { in: ['OPEN', 'DONE'] } },
    include: taskInclude,
    orderBy: [{ status: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
  const locale = await localeOf(req.user!.id);
  const now = new Date();
  const views = tasks.map((t) => clientView(t, locale, now));
  // OPEN sorts after DONE alphabetically: open first, deadline-less open tasks after dated ones.
  views.sort((a, b) => Number(a.status !== 'OPEN') - Number(b.status !== 'OPEN') || (a.dueAt ? a.dueAt.getTime() : Infinity) - (b.dueAt ? b.dueAt.getTime() : Infinity));
  res.json({ tasks: views, counts: { open: views.filter((t) => t.status === 'OPEN').length, overdue: views.filter((t) => t.state === 'overdue').length } });
});

const ownTask = async (id: string, userId: string) => {
  const t = await loadTask(id);
  if (!t || t.case.clientId !== userId || t.status === 'CANCELLED') throw notFound('TASK_NOT_FOUND');
  return t;
};

/** Mark done, with an optional note and an optional file (multipart field "file"). */
clientProcessRouter.post('/tasks/:id/done', documentUpload.single('file'), async (req, res) => {
  const file = req.file;
  try {
    const body = parse(z.object({ note: z.string().trim().max(2000).optional() }), req.body ?? {});
    const t = await ownTask(String(req.params.id), req.user!.id);
    if (t.status !== 'OPEN') throw conflict('TASK_NOT_OPEN');
    let documentId: string | null = null;
    if (file) {
      await verifyUploadedFile(file);
      const doc = await prisma.document.create({
        data: {
          caseId: t.caseId,
          stage: 'OTHER',
          originalName: decodeOriginalName(file.originalname).slice(0, 200),
          storedName: file.filename,
          mimeType: file.mimetype,
          size: file.size,
          uploadedById: req.user!.id,
        },
      });
      documentId = doc.id;
      await prisma.caseEvent.create({ data: { caseId: t.caseId, type: 'DOCUMENT_UPLOADED', note: doc.originalName, actorId: req.user!.id, visibleToClient: false } });
    }
    const done = await completeTask(t.id, { userId: req.user!.id, via: 'CLIENT' }, { note: body.note || null, documentId });
    if (!done) throw conflict('TASK_NOT_OPEN');
    res.json({ task: clientView(done, await localeOf(req.user!.id)) });
  } catch (err) {
    if (file) await fs.unlink(path.join(config.uploads.privateDir, file.filename)).catch(() => undefined);
    throw err;
  }
});

/** Undo "done" (the client pressed it by mistake). Auto-completed tasks are reopened by staff only. */
clientProcessRouter.post('/tasks/:id/reopen', async (req, res) => {
  const t = await ownTask(req.params.id, req.user!.id);
  if (t.status !== 'DONE' || t.completedVia !== 'CLIENT' || t.completedById !== req.user!.id) throw conflict('TASK_NOT_REOPENABLE');
  await prisma.clientTask.update({ where: { id: t.id }, data: { status: 'OPEN', completedAt: null, completedById: null, completedVia: null } });
  res.json({ task: clientView((await loadTask(t.id))!, await localeOf(req.user!.id)) });
});

// ─── Office visits ────────────────────────────────────────────────────

clientProcessRouter.get('/office/slots', async (req, res) => {
  const locale = await localeOf(req.user!.id);
  res.json({ slots: await freeOfficeSlots(), offices: await listOffices(locale), reasons: VISIT_REASONS });
});

clientProcessRouter.get('/office/visits', async (req, res) => {
  const q = parse(z.object({ caseId: z.string().max(40).optional() }), req.query);
  if (q.caseId) await ownCase(q.caseId, req.user!.id);
  const visits = await prisma.booking.findMany({
    where: { case: { clientId: req.user!.id }, ...(q.caseId ? { caseId: q.caseId } : {}), slot: { kind: 'OFFICE' } },
    include: visitInclude,
    orderBy: { slot: { startsAt: 'desc' } },
    take: 50,
  });
  const now = new Date();
  res.json({ visits: visits.map((v) => visitView(v, now)) });
});

clientProcessRouter.post('/office/visits', async (req, res) => {
  const body = parse(
    z.object({ caseId: z.string().min(1).max(40), slotId: z.string().min(1).max(40), reason: z.enum(VISIT_REASONS), message: z.string().trim().max(1000).optional() }),
    req.body,
  );
  if (body.reason === 'other' && !body.message) throw badRequest('MESSAGE_REQUIRED');
  const visit = await bookOfficeVisit(req.user!.id, body);
  res.status(201).json({ visit: visitView(visit) });
});

const ownVisit = async (id: string, userId: string) => {
  const v = await loadVisit(id);
  if (!v.case || v.case.clientId !== userId) throw notFound('BOOKING_NOT_FOUND');
  return v;
};

clientProcessRouter.post('/office/visits/:id/cancel', async (req, res) => {
  const v = await ownVisit(req.params.id, req.user!.id);
  res.json({ visit: visitView(await cancelOfficeVisit(v, 'client')) });
});

clientProcessRouter.post('/office/visits/:id/reschedule', async (req, res) => {
  const { slotId } = parse(z.object({ slotId: z.string().min(1).max(40) }), req.body);
  const v = await ownVisit(req.params.id, req.user!.id);
  res.json({ visit: visitView(await rescheduleOfficeVisit(v, slotId)) });
});

clientProcessRouter.get('/office/visits/:id/ics', async (req, res) => {
  const v = await ownVisit(req.params.id, req.user!.id);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="triad-vision-office-visit.ics"');
  res.send(visitIcs(v, v.status === 'CANCELLED'));
});
