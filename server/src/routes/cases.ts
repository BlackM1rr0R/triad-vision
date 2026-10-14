import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { decodeOriginalName, documentUpload } from '../middleware/upload.js';
import { CLIENT_UPLOAD_STAGE, clientSignContract, clientSubmitDocuments, createCase } from '../lib/caseFlow.js';
import { loadCaseDetail } from '../lib/caseView.js';
import { badRequest, conflict, notFound, parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { PDFDocument } from 'pdf-lib';
import { signContractPdf } from '../lib/pdfSign.js';

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

casesRouter.post('/', async (req, res) => {
  const body = parse(
    z.object({ profession: z.string().trim().min(2).max(120), visaCategoryId: z.string().nullable().optional() }),
    req.body,
  );
  if (body.visaCategoryId) {
    const exists = await prisma.visaCategory.count({ where: { id: body.visaCategoryId } });
    if (!exists) throw badRequest('INVALID_VISA_CATEGORY');
  }
  const created = await createCase(req.user!.id, body);
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
    res.status(201).json({ document: doc });
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

casesRouter.post('/:id/messages', async (req, res) => {
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
  const c = await ownCase(req.params.id, req.user!.id);
  const message = await prisma.caseMessage.create({ data: { caseId: c.id, authorId: req.user!.id, body } });
  await notifyStaff(`${c.number}: müştəridən yeni mesaj`, body, { caseId: c.id, link: `/admin/cases/${c.id}`, type: 'NEW_MESSAGE' });
  res.status(201).json({ message });
});
