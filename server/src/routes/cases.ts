import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireVerifiedEmail } from '../middleware/verified.js';
import { decodeOriginalName, documentUpload, verifyUploadedFile } from '../middleware/upload.js';
import { CLIENT_UPLOAD_STAGE, clientSignContract, clientSubmitDocuments, createCase } from '../lib/caseFlow.js';
import { loadCaseDetail } from '../lib/caseView.js';
import { badRequest, conflict, forbidden, HttpError, notFound, parse } from '../lib/http.js';
import { createCaseMessage, listMessages, markMessagesRead, publishTyping } from '../lib/messaging/caseMessages.js';
import { PDFDocument } from 'pdf-lib';
import { signContractPdf } from '../lib/pdfSign.js';
import { checkCaseDocument } from '../lib/docCheck/index.js';
import { scheduleAiDocCheck } from '../lib/aiDocs/docCheck.js';
import { prepareCaseDocument, publicQuality, scheduleUploadAnalysis } from '../lib/uploadAi/index.js';
import { emitAutomationEvent } from '../lib/automation/events.js';

export const casesRouter = Router();
casesRouter.use(requireAuth);

const ownCase = async (caseId: string, userId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId } });
  if (!c || c.clientId !== userId) throw notFound('CASE_NOT_FOUND');
  return c;
};

const removeFile = (storedName: string) =>
  fs.unlink(path.join(config.uploads.privateDir, storedName)).catch(() => undefined);

casesRouter.get('/', async (req, res) => {
  const cases = await prisma.case.findMany({
    where: { clientId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    include: { visaCategory: { select: { title: true, visaLabel: true } } },
  });
  res.json({ cases });
});

/** Shown where a profession is expected when the client did not name one (staff lists, notifications). */
const VISA_TYPE_LABEL_AZ = { WORK: 'İş vizası', AUSBILDUNG: 'Ausbildung', WEITERBILDUNG: 'Weiterbildung', JOB_SEEKER: 'İş axtarışı vizası', STUDY: 'Təhsil vizası', FAMILY: 'Ailə birləşməsi', TOURIST: 'Turist vizası' } as const;

casesRouter.post('/', requireVerifiedEmail, async (req, res) => {
  // Visa cases belong to candidates; employer (and staff) accounts open cases through the admin flow.
  if (req.user!.role !== 'CLIENT') throw forbidden('CANDIDATES_ONLY');
  const body = parse(
    z.object({
      // The client picks the kind of application; the profession is optional (taken from the profile).
      visaType: z.enum(['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST']).default('WORK'),
      profession: z.string().trim().max(120).optional(),
      visaCategoryId: z.string().nullable().optional(),
    }),
    req.body,
  );
  if (body.visaCategoryId) {
    const exists = await prisma.visaCategory.count({ where: { id: body.visaCategoryId, published: true } });
    if (!exists) throw badRequest('INVALID_VISA_CATEGORY');
  }
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { profession: true } });
  const profession = body.profession || me?.profession || VISA_TYPE_LABEL_AZ[body.visaType];
  const created = await createCase(req.user!.id, { profession, visaType: body.visaType, visaCategoryId: body.visaCategoryId });
  res.status(201).json({ case: created });
});

casesRouter.get('/:id', async (req, res) => {
  await ownCase(req.params.id, req.user!.id);
  res.json({ case: await loadCaseDetail(req.params.id, { forStaff: false }) });
});

casesRouter.post('/:id/documents', documentUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('FILE_REQUIRED');
  try {
    const c = await ownCase(String(req.params.id), req.user!.id);
    const stage = CLIENT_UPLOAD_STAGE[c.status];
    if (!stage) throw conflict('UPLOAD_NOT_ALLOWED');
    await verifyUploadedFile(file);

    const { requirementId } = parse(z.object({ requirementId: z.string() }), req.body);
    const requirement = await prisma.documentRequirement.findUnique({ where: { id: requirementId } });
    if (!requirement || requirement.caseId !== c.id || requirement.stage !== stage) {
      throw badRequest('INVALID_REQUIREMENT');
    }

    const doc = await prisma.document.create({
      data: {
        caseId: c.id,
        requirementId,
        stage,
        originalName: decodeOriginalName(file.originalname).slice(0, 200),
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        uploadedById: req.user!.id,
      },
    });
    await prisma.caseEvent.create({
      data: { caseId: c.id, type: 'DOCUMENT_UPLOADED', note: doc.originalName, actorId: req.user!.id, visibleToClient: false },
    });
    void emitAutomationEvent({ type: 'DOCUMENT_UPLOADED', entityType: 'document', entityId: doc.id, caseId: c.id }); // automation hook
    // Automatic quality checks (PDF readable, photo is an image, resolution, passport MRZ/expiry); never throws.
    const checks = await checkCaseDocument(doc.id);
    // Smart uploads: scan quality (blur, darkness, glare, cut-off) for instant feedback; never throws.
    const quality = publicQuality(await prepareCaseDocument(doc.id));
    res.status(201).json({ document: { ...doc, checks }, checks, quality });
    scheduleAiDocCheck(doc.id); // AI check against the requirement, in the background (checks.ai)
    scheduleUploadAnalysis({ documentId: doc.id }); // recognition + proposals, in the background
  } catch (err) {
    await removeFile(file.filename);
    throw err;
  }
});

casesRouter.delete('/:id/documents/:docId', async (req, res) => {
  const c = await ownCase(req.params.id, req.user!.id);
  const doc = await prisma.document.findUnique({ where: { id: req.params.docId } });
  if (!doc || doc.caseId !== c.id) throw notFound('DOCUMENT_NOT_FOUND');
  // Clients may only remove their own not-yet-reviewed uploads while the upload step is open.
  if (CLIENT_UPLOAD_STAGE[c.status] !== doc.stage || doc.uploadedById !== req.user!.id || doc.status === 'ACCEPTED') {
    throw conflict('DELETE_NOT_ALLOWED');
  }
  await prisma.document.delete({ where: { id: doc.id } });
  await removeFile(doc.storedName);
  res.json({ ok: true });
});

casesRouter.post('/:id/submit', async (req, res) => {
  await clientSubmitDocuments(req.params.id, req.user!.id);
  res.json({ ok: true });
});

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

casesRouter.post('/:id/contract/sign', async (req, res) => {
  const body = parse(
    z.object({
      signerName: z.string().trim().min(3).max(160),
      signature: z.string().max(1_500_000).regex(PNG_DATA_URL),
      agree: z.literal(true),
    }),
    req.body,
  );
  const c = await ownCase(req.params.id, req.user!.id);
  if (c.status !== 'CONTRACT_SENT') throw conflict('INVALID_TRANSITION');
  const contract = await prisma.contract.findUnique({ where: { caseId: c.id } });
  if (!contract) throw notFound('CONTRACT_NOT_FOUND');
  // Contracts sent through the multi-party module are signed there (all parties, audit trail).
  if (contract.signatureRequestId) throw conflict('USE_SIGNATURE_REQUEST');
  const original = await prisma.document.findUniqueOrThrow({ where: { id: contract.fileDocumentId } });

  const pngBuffer = Buffer.from(PNG_DATA_URL.exec(body.signature)![1], 'base64');
  // The regex only checks the prefix; non-PNG bytes would make pdf-lib throw (500).
  if (!pngBuffer.subarray(0, 8).equals(PNG_MAGIC)) throw badRequest('INVALID_SIGNATURE');
  // A valid header with corrupt image data would still make pdf-lib throw later; check it decodes.
  try {
    await (await PDFDocument.create()).embedPng(pngBuffer);
  } catch {
    throw badRequest('INVALID_SIGNATURE');
  }
  const ip = req.ip ?? 'unknown';
  const userAgent = req.get('user-agent') ?? 'unknown';
  const { pdf } = await signContractPdf(await fs.readFile(path.join(config.uploads.privateDir, original.storedName)), {
    caseNumber: c.number,
    signerName: body.signerName,
    signerEmail: req.user!.email,
    signedAt: new Date(),
    ip,
    userAgent,
    signaturePng: pngBuffer,
  });

  const storedName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.pdf`;
  await fs.writeFile(path.join(config.uploads.privateDir, storedName), pdf);
  const signedDoc = await prisma.document.create({
    data: {
      caseId: c.id,
      stage: 'CONTRACT_SIGNED',
      originalName: `${c.number}-contract-signed-v${contract.version}.pdf`,
      storedName,
      mimeType: 'application/pdf',
      size: pdf.length,
      uploadedById: req.user!.id,
    },
  });

  try {
    await clientSignContract(c.id, req.user!.id, { signerName: body.signerName, signedDocumentId: signedDoc.id, ip, userAgent });
  } catch (err) {
    await prisma.document.delete({ where: { id: signedDoc.id } });
    await removeFile(storedName);
    throw err;
  }
  res.json({ ok: true });
});

// ─── Messages (chat with the case manager; realtime events via /api/messaging/events) ──

casesRouter.get('/:id/messages', async (req, res) => {
  const c = await ownCase(req.params.id, req.user!.id);
  res.json({ messages: await listMessages(c.id) });
});

casesRouter.post('/:id/messages', async (req, res) => {
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
  const c = await ownCase(req.params.id, req.user!.id);
  const message = await createCaseMessage({ caseId: c.id, authorId: req.user!.id, body, side: 'client' });
  res.status(201).json({ message });
});

/** Marks every staff message of the case as read (read receipts for the team). */
casesRouter.post('/:id/messages/read', async (req, res) => {
  const c = await ownCase(req.params.id, req.user!.id);
  const { messageIds, readAt } = await markMessagesRead(c, 'client');
  res.json({ messageIds, readAt });
});

/** "… is typing" for the team; at most one event per 2 s per user (429 when faster). */
casesRouter.post('/:id/typing', async (req, res) => {
  const c = await ownCase(req.params.id, req.user!.id);
  const sent = await publishTyping(c, req.user!, 'client');
  if (!sent) throw new HttpError(429, 'TOO_MANY_REQUESTS');
  res.json({ ok: true });
});
