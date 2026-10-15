import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import type { CaseStatus, Locale } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { isStaff, requireAuth } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, notFound, parse } from '../lib/http.js';
import { applyMrzToProfile, langDataAvailable, mrzOf, OCR_IMAGE_MIME, ocrDocument, profileFromMrz } from '../lib/docsIntel/ocr.js';
import { buildPacket, packetFileName, type PacketItem } from '../lib/docsIntel/packet.js';
import { buildForm, FORM_KINDS, formFileName, loadFormData, missingFields, type FormKind } from '../lib/docsIntel/forms.js';

/**
 * Document intelligence: passport OCR results, the one-click embassy packet and pre-filled forms.
 * Staff (with 2FA, like /api/files) and the case owner may use these; the packet is open to the client
 * only once the case has reached the embassy step.
 */
export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const staffAccess = (req: Request) => isStaff(req.user) && !!req.user!.twoFactorEnabled;

const loadDoc = async (req: Request) => {
  const doc = await prisma.document.findUnique({
    where: { id: String(req.params.docId) },
    include: { requirement: { select: { key: true, title: true } }, case: { select: { id: true, clientId: true, number: true } } },
  });
  if (!doc || (!staffAccess(req) && doc.case.clientId !== req.user!.id)) throw notFound('DOCUMENT_NOT_FOUND');
  return doc;
};

const loadCase = async (req: Request) => {
  const c = await prisma.case.findUnique({
    where: { id: String(req.params.caseId) },
    include: {
      client: true,
      visaCategory: { select: { title: true, visaLabel: true } },
      requirements: { orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }], include: { documents: { where: { status: 'ACCEPTED' }, orderBy: { createdAt: 'desc' }, take: 1 } } },
      contract: true,
    },
  });
  if (!c || (!staffAccess(req) && c.clientId !== req.user!.id)) throw notFound('CASE_NOT_FOUND');
  return c;
};

/** Statuses from which the embassy packet makes sense (the case has reached the embassy step). */
export const PACKET_STATUSES: CaseStatus[] = ['EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED'];

const packetAllowedForClient = (c: { status: CaseStatus; requirements: { stage: string }[] }) =>
  PACKET_STATUSES.includes(c.status) || (c.status === 'CANCELLED' && c.requirements.some((r) => r.stage === 'EMBASSY'));

const l10n = (v: unknown, locale: Locale) => {
  const t = (v ?? {}) as Partial<Record<Locale, string>>;
  return t[locale] || t.az || t.en || '';
};

const profileOf = (u: { passportNumber: string | null; passportExpiry: Date | null; birthDate: Date | null; nationality: string | null }) => ({
  passportNumber: u.passportNumber,
  passportExpiry: u.passportExpiry ? u.passportExpiry.toISOString().slice(0, 10) : null,
  birthDate: u.birthDate ? u.birthDate.toISOString().slice(0, 10) : null,
  nationality: u.nationality,
});

const sendPdf = (res: Response, pdf: Buffer, name: string) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(pdf);
};

// ─── OCR ───────────────────────────────────────────────────────────────

documentsRouter.get('/:docId/ocr', async (req, res) => {
  const doc = await loadDoc(req);
  const client = await prisma.user.findUniqueOrThrow({ where: { id: doc.case.clientId } });
  res.json({ documentId: doc.id, ocr: doc.ocr, ocrAt: doc.ocrAt, requirementKey: doc.requirement?.key ?? null, profile: profileOf(client), available: langDataAvailable() });
});

/** Runs OCR now (synchronously, 30 s guard). Non-images are marked as skipped. */
documentsRouter.post('/:docId/ocr', async (req, res) => {
  const doc = await loadDoc(req);
  const record = await ocrDocument(doc.id, { timeoutMs: 30_000 });
  const client = await prisma.user.findUniqueOrThrow({ where: { id: doc.case.clientId } });
  await audit(req, 'DOCUMENT_OCR_RUN', doc.id, { caseId: doc.case.id, result: 'mrz' in record ? (record.mrz ? 'mrz' : 'none') : 'skipped' in record ? record.skipped : 'error' });
  res.json({ documentId: doc.id, ocr: record, ocrAt: new Date().toISOString(), requirementKey: doc.requirement?.key ?? null, profile: profileOf(client) });
});

/** Writes the extracted passport data into the client's profile (overwrites). */
documentsRouter.post('/:docId/ocr/apply', async (req, res) => {
  const doc = await loadDoc(req);
  const mrz = mrzOf(doc.ocr);
  if (!mrz) throw badRequest('NO_MRZ');
  const data = await applyMrzToProfile(doc.case.clientId, mrz);
  await prisma.caseEvent.create({
    data: { caseId: doc.case.id, type: 'PROFILE_UPDATED_FROM_OCR', note: `${mrz.documentNumber} · ${mrz.expiryDate}`, actorId: req.user!.id, visibleToClient: false },
  });
  await audit(req, 'DOCUMENT_OCR_APPLIED', doc.id, { caseId: doc.case.id, userId: doc.case.clientId });
  res.json({ profile: profileOf({ ...data }) });
});

// ─── Summary for the portal panel ──────────────────────────────────────

documentsRouter.get('/cases/:caseId/intel', async (req, res) => {
  const c = await loadCase(req);
  const passportReq = c.requirements.find((r) => r.key === 'PASSPORT');
  const passportDocs = passportReq
    ? await prisma.document.findMany({ where: { requirementId: passportReq.id }, orderBy: { createdAt: 'desc' }, select: { id: true, originalName: true, mimeType: true, status: true, ocr: true, ocrAt: true, createdAt: true } })
    : [];
  const passport = passportDocs.find((d) => mrzOf(d.ocr)?.valid) ?? passportDocs.find((d) => d.ocrAt) ?? passportDocs[0] ?? null;
  const formData = await loadFormData(c.id);
  res.json({
    caseId: c.id,
    status: c.status,
    passport: passport ? { ...passport, isImage: OCR_IMAGE_MIME.includes(passport.mimeType), extracted: mrzOf(passport.ocr) ? profileOf(profileFromMrz(mrzOf(passport.ocr)!)) : null } : null,
    profile: profileOf(c.client),
    ocrAvailable: langDataAvailable(),
    packet: { allowed: staffAccess(req) || packetAllowedForClient(c), accepted: c.requirements.filter((r) => r.documents.length > 0).length, total: c.requirements.length },
    forms: Object.fromEntries(FORM_KINDS.map((k) => [k, { missing: missingFields(k, formData) }])),
  });
});

// ─── Embassy packet ────────────────────────────────────────────────────

documentsRouter.get('/cases/:caseId/packet', async (req, res) => {
  const c = await loadCase(req);
  if (!staffAccess(req) && !packetAllowedForClient(c)) throw forbidden('PACKET_NOT_AVAILABLE');
  const locale = (req.user!.locale as Locale) ?? 'az';
  const stageLabel: Record<string, string> = {
    INITIAL: { az: 'İlkin sənədlər', de: 'Erste Unterlagen', en: 'Initial documents', ru: 'Первичные документы' }[locale]!,
    EMBASSY: { az: 'Səfirlik sənədləri', de: 'Botschaftsunterlagen', en: 'Embassy documents', ru: 'Документы для посольства' }[locale]!,
    CONTRACT: { az: 'Müqavilə', de: 'Arbeitsvertrag', en: 'Contract', ru: 'Договор' }[locale]!,
  };
  const read = async (storedName: string) => fs.readFile(path.join(config.uploads.privateDir, storedName)).catch(() => undefined);
  const items: PacketItem[] = [];
  for (const stage of ['INITIAL', 'EMBASSY'] as const) {
    for (const r of c.requirements.filter((x) => x.stage === stage)) {
      const d = r.documents[0];
      if (!d) continue;
      items.push({ title: l10n(r.title, locale), section: stageLabel[stage], originalName: d.originalName, mimeType: d.mimeType, bytes: await read(d.storedName) });
    }
  }
  if (c.contract?.signedDocumentId) {
    const signed = await prisma.document.findUnique({ where: { id: c.contract.signedDocumentId } });
    if (signed) items.push({ title: { az: 'İmzalanmış müqavilə', de: 'Unterschriebener Arbeitsvertrag', en: 'Signed contract', ru: 'Подписанный договор' }[locale]!, section: stageLabel.CONTRACT, originalName: signed.originalName, mimeType: signed.mimeType, bytes: await read(signed.storedName) });
  }
  const visaTitle = l10n(c.visaCategory?.title, locale);
  const { pdf, pages, entries } = await buildPacket({
    caseNumber: c.number,
    clientName: `${c.client.firstName} ${c.client.lastName}`,
    visaType: c.visaCategory ? `${c.visaCategory.visaLabel} ${visaTitle}`.trim() : '-',
    profession: c.profession,
    date: new Date(),
    items,
  });
  const name = packetFileName(c.number);
  await audit(req, 'EMBASSY_PACKET_BUILT', c.id, { pages, documents: items.length, store: req.query.store === '1' });

  if (req.query.store === '1') {
    const storedName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.pdf`;
    await fs.writeFile(path.join(config.uploads.privateDir, storedName), pdf);
    const doc = await prisma.document.create({
      data: { caseId: c.id, stage: 'OTHER', originalName: name, storedName, mimeType: 'application/pdf', size: pdf.length, status: 'ACCEPTED', uploadedById: req.user!.id },
    });
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'STAFF_DOCUMENT_UPLOADED', note: name, actorId: req.user!.id, visibleToClient: true } });
    res.status(201).json({ document: doc, pages, entries });
    return;
  }
  sendPdf(res, pdf, name);
});

// ─── Forms ─────────────────────────────────────────────────────────────

documentsRouter.get('/cases/:caseId/forms/:form', async (req, res) => {
  const { form } = parse(z.object({ form: z.enum(FORM_KINDS) }), req.params);
  const c = await loadCase(req);
  const data = await loadFormData(c.id);
  const { pdf, missing } = await buildForm(form as FormKind, data);
  res.setHeader('X-Missing-Fields', missing.join(','));
  res.setHeader('Access-Control-Expose-Headers', 'X-Missing-Fields');
  await audit(req, 'FORM_GENERATED', c.id, { form, missing });
  sendPdf(res, pdf, formFileName(form as FormKind, c.number));
});
