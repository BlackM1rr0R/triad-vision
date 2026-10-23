import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { decodeOriginalName, documentUpload, verifyUploadedFile } from '../middleware/upload.js';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, parse } from '../lib/http.js';
import { checkCaseDocument } from '../lib/docCheck/index.js';
import { scheduleAiDocCheck } from '../lib/aiDocs/docCheck.js';
import { prepareCaseDocument, publicQuality, scheduleUploadAnalysis } from '../lib/uploadAi/index.js';
import { emitAutomationEvent } from '../lib/automation/events.js';
import {
  certificateTarget,
  courseCreateSchema,
  courseUpdateSchema,
  createCourse,
  createExam,
  deleteCourse,
  deleteExam,
  examCreateSchema,
  examUpdateSchema,
  germanOverview,
  getOwnExam,
  planSchema,
  savePlan,
  serializeExamDate,
  updateCourse,
  updateExam,
} from '../lib/german/service.js';

/**
 * German language progress of the signed-in candidate — mounted at /api/german ("Alman dili" page, app).
 *
 *   GET    /me                          level (User.germanLevel), goal, courses, exams, exam dates, timeline
 *   PUT    /me/plan                     { targetLevel, targetDate, notes }
 *   POST   /me/courses   PATCH|DELETE /me/courses/:id
 *   POST   /me/exams     PATCH|DELETE /me/exams/:id      (examDateId picks one of the admin's exam dates)
 *   POST   /me/exams/:id/certificate    multipart file → language-certificate document of the main case
 *   GET    /exam-dates                  upcoming published exam dates
 *
 * The level itself changes through the self-test (journey), staff, or an accepted certificate.
 */
export const germanRouter = Router();
germanRouter.use(requireAuth);

const clientOnly = (req: Request) => {
  if (req.user!.role !== 'CLIENT') throw forbidden('CLIENTS_ONLY');
  return req.user!.id;
};

germanRouter.get('/exam-dates', async (_req, res) => {
  const items = await prisma.germanExamDate.findMany({ where: { published: true, examDate: { gte: new Date() } }, orderBy: { examDate: 'asc' }, take: 60 });
  res.json({ items: items.map(serializeExamDate) });
});

germanRouter.get('/me', async (req, res) => {
  res.json(await germanOverview(clientOnly(req)));
});

germanRouter.put('/me/plan', async (req, res) => {
  const userId = clientOnly(req);
  await savePlan(userId, parse(planSchema, req.body ?? {}));
  res.json(await germanOverview(userId));
});

germanRouter.post('/me/courses', async (req, res) => {
  const userId = clientOnly(req);
  const course = await createCourse(userId, parse(courseCreateSchema, req.body ?? {}), userId);
  res.status(201).json({ id: course.id, ...(await germanOverview(userId)) });
});

germanRouter.patch('/me/courses/:id', async (req, res) => {
  const userId = clientOnly(req);
  await updateCourse(userId, String(req.params.id), parse(courseUpdateSchema, req.body ?? {}));
  res.json(await germanOverview(userId));
});

germanRouter.delete('/me/courses/:id', async (req, res) => {
  const userId = clientOnly(req);
  await deleteCourse(userId, String(req.params.id));
  res.json(await germanOverview(userId));
});

germanRouter.post('/me/exams', async (req, res) => {
  const userId = clientOnly(req);
  const exam = await createExam(userId, parse(examCreateSchema, req.body ?? {}), userId);
  res.status(201).json({ id: exam.id, ...(await germanOverview(userId)) });
});

germanRouter.patch('/me/exams/:id', async (req, res) => {
  const userId = clientOnly(req);
  await updateExam(userId, String(req.params.id), parse(examUpdateSchema, req.body ?? {}));
  res.json(await germanOverview(userId));
});

germanRouter.delete('/me/exams/:id', async (req, res) => {
  const userId = clientOnly(req);
  await deleteExam(userId, String(req.params.id));
  res.json(await germanOverview(userId));
});

const removeFile = (storedName: string) => fs.unlink(path.join(config.uploads.privateDir, storedName)).catch(() => undefined);

/** Certificate of an exam: stored like any case upload (checks, smart uploads, staff review). */
germanRouter.post('/me/exams/:id/certificate', documentUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('FILE_REQUIRED');
  try {
    const userId = clientOnly(req);
    const exam = await getOwnExam(userId, String(req.params.id));
    await verifyUploadedFile(file);
    const { caseId, requirement } = await certificateTarget(userId);
    const doc = await prisma.document.create({
      data: {
        caseId,
        requirementId: requirement.id,
        stage: requirement.stage,
        originalName: decodeOriginalName(file.originalname).slice(0, 200),
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        uploadedById: userId,
      },
    });
    await prisma.germanExam.update({ where: { id: exam.id }, data: { certificateDocumentId: doc.id } });
    await prisma.caseEvent.create({ data: { caseId, type: 'DOCUMENT_UPLOADED', note: doc.originalName, actorId: userId, visibleToClient: false } });
    await audit(req, 'GERMAN_CERTIFICATE_UPLOADED', `document:${doc.id}`, { examId: exam.id, caseId });
    void emitAutomationEvent({ type: 'DOCUMENT_UPLOADED', entityType: 'document', entityId: doc.id, caseId }); // automation hook
    const checks = await checkCaseDocument(doc.id);
    const quality = publicQuality(await prepareCaseDocument(doc.id));
    res.status(201).json({ document: { ...doc, checks }, quality, ...(await germanOverview(userId)) });
    scheduleAiDocCheck(doc.id);
    scheduleUploadAnalysis({ documentId: doc.id });
  } catch (err) {
    await removeFile(file.filename);
    throw err;
  }
});
