import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Locale } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { decodeOriginalName, documentUpload, verifyUploadedFile } from '../middleware/upload.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound, parse } from '../lib/http.js';
import { clientForm, clientFormDto, saveDraft, submitForm } from '../lib/clientData/forms.js';
import { clientConfirmationDto, latestConfirmation, SECTIONS, submitConfirmation } from '../lib/clientData/confirmation.js';
import { clientGuides } from '../lib/clientData/guides.js';

/**
 * Client data in the portal (/api/client-data, own cases only):
 *
 *   GET  /cases/:caseId/tasks                       open questionnaires + the data confirmation (for the case page)
 *   GET  /cases/:caseId/forms/:formId               the questionnaire with the saved draft
 *   PUT  /cases/:caseId/forms/:formId               { answers } save draft
 *   POST /cases/:caseId/forms/:formId/submit        { answers } → 400 REQUIRED_MISSING { missing[] } or the submitted form
 *   POST /cases/:caseId/files                       multipart "file" → { document } (file answers, correction proofs; stage OTHER)
 *   GET  /cases/:caseId/confirmation                the latest confirmation request
 *   POST /cases/:caseId/confirmation/submit         { answers: { key: { ok } | { ok: false, value, proofDocumentId? } } }
 *   GET  /guides?keys=A,B                           "Necə almalı?" guides in the user's language
 */
export const clientDataRouter = Router();
clientDataRouter.use(requireAuth);

const ownCase = async (req: Request) => {
  const c = await prisma.case.findUnique({ where: { id: String(req.params.caseId) }, select: { id: true, clientId: true } });
  if (!c || c.clientId !== req.user!.id) throw notFound('CASE_NOT_FOUND');
  return c;
};

const LOCALES = ['az', 'de', 'en', 'ru'];
const localeOf = (req: Request): Locale => {
  const h = String(req.headers['x-locale'] ?? '').slice(0, 2);
  return (LOCALES.includes(h) ? h : (req.user?.locale ?? 'az')) as Locale;
};

clientDataRouter.get('/cases/:caseId/tasks', async (req, res) => {
  const c = await ownCase(req);
  const [forms, conf] = await Promise.all([
    prisma.caseForm.findMany({ where: { caseId: c.id, status: { not: 'CANCELLED' } }, orderBy: { sentAt: 'desc' }, select: { id: true, title: true, status: true, sentAt: true, submittedAt: true, dueAt: true } }),
    latestConfirmation(c.id),
  ]);
  res.json({
    forms,
    confirmation: conf ? { id: conf.id, status: conf.status, requestedAt: conf.requestedAt, submittedAt: conf.submittedAt, fields: Array.isArray(conf.fields) ? conf.fields.length : 0 } : null,
  });
});

clientDataRouter.get('/cases/:caseId/forms/:formId', async (req, res) => {
  const c = await ownCase(req);
  res.json({ form: clientFormDto(await clientForm(c.id, String(req.params.formId))) });
});

const answersBody = z.object({ answers: z.record(z.unknown()) });

clientDataRouter.put('/cases/:caseId/forms/:formId', async (req, res) => {
  const body = parse(answersBody, req.body ?? {});
  const c = await ownCase(req);
  const form = await saveDraft(await clientForm(c.id, String(req.params.formId)), req.user!.id, body.answers);
  res.json({ form: clientFormDto(form) });
});

clientDataRouter.post('/cases/:caseId/forms/:formId/submit', async (req, res) => {
  const body = parse(answersBody, req.body ?? {});
  const c = await ownCase(req);
  const out = await submitForm(await clientForm(c.id, String(req.params.formId)), req.user!.id, body.answers, req.ip ?? null);
  if (!out.ok) {
    res.status(400).json({ error: 'REQUIRED_MISSING', missing: out.missing });
    return;
  }
  await audit(req, 'CASE_FORM_SUBMITTED', c.id, { formId: out.form.id });
  res.json({ form: clientFormDto(out.form) });
});

clientDataRouter.post('/cases/:caseId/files', documentUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('FILE_REQUIRED');
  try {
    const c = await ownCase(req);
    await verifyUploadedFile(file);
    const doc = await prisma.document.create({
      data: { caseId: c.id, stage: 'OTHER', originalName: decodeOriginalName(file.originalname).slice(0, 200), storedName: file.filename, mimeType: file.mimetype, size: file.size, uploadedById: req.user!.id },
      select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
    });
    res.status(201).json({ document: doc });
  } catch (err) {
    await fs.unlink(path.join(config.uploads.privateDir, file.filename)).catch(() => undefined);
    throw err;
  }
});

clientDataRouter.get('/cases/:caseId/confirmation', async (req, res) => {
  const c = await ownCase(req);
  const conf = await latestConfirmation(c.id);
  res.json({ confirmation: conf ? clientConfirmationDto(conf) : null, sections: SECTIONS });
});

clientDataRouter.post('/cases/:caseId/confirmation/submit', async (req, res) => {
  const body = parse(answersBody, req.body ?? {});
  const c = await ownCase(req);
  const conf = await latestConfirmation(c.id);
  if (!conf) throw notFound('CONFIRMATION_NOT_FOUND');
  const out = await submitConfirmation(conf, req.user!.id, body.answers, { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null });
  if (!out.ok) {
    res.status(400).json({ error: 'ANSWER_EVERY_LINE', missing: out.missing });
    return;
  }
  await audit(req, 'DATA_CONFIRM_SUBMITTED', c.id, { confirmationId: conf.id, corrections: out.corrections });
  res.json({ confirmation: clientConfirmationDto(out.confirmation) });
});

clientDataRouter.get('/guides', async (req, res) => {
  const keys = String(req.query.keys ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => /^[A-Za-z][A-Za-z0-9_]{1,39}$/.test(k));
  res.json({ guides: await clientGuides(keys, localeOf(req)) });
});
