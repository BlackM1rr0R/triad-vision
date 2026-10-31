import fsp from 'node:fs/promises';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { metaOf } from '../../lib/esign/http.js';
import { DEFAULT_EXPIRY_DAYS } from '../../lib/esign/service.js';
import {
  attachUpload,
  contractCreateSchema,
  contractData,
  contractUpdateSchema,
  contractUpload,
  contractView,
  createData,
  dayOf,
  detachFile,
  generateContract,
  generateSchema,
  listContracts,
  loadContract,
  applyLifecycle,
  removeStored,
  renderForOwner,
  sendContractFile,
  templatesForOwner,
  type FileSlot,
} from '../../lib/partnerRecords/contracts.js';
import {
  activityCreateSchema,
  activityUpdateSchema,
  assertActivityEditable,
  assertContactOfOwner,
  loadActivity,
  timeline,
  ACTIVITY_KINDS,
} from '../../lib/partnerRecords/activities.js';
import { contactCreateSchema, contactUpdateSchema, contactView, createContact, deleteContact, listContacts, loadContact, updateContact } from '../../lib/partnerRecords/contacts.js';
import { loadOwner, ownerData, ownerFrom, ownerOfRequest, ownerOfRow, ownerTarget, type Owner } from '../../lib/partnerRecords/owner.js';
import { auditDiff } from '../../lib/partnerRecords/legal.js';
import { sendContractForSignature } from '../../lib/partnerRecords/signature.js';

/**
 * Contracts, timeline and contact persons of employers AND referral partners — mounted at
 * /api/admin/partner-records (STAFF+). Owner: `companyId` or `referralPartnerId` (query for reads, body for
 * creates); item routes take the owner from the row. Every write is audited on the owner (company:<id> /
 * partner:<id>), so it also shows up in the owner's timeline.
 */
export const adminPartnerRecordsRouter = Router();
adminPartnerRecordsRouter.use(requireMinRole('STAFF'));

const id = (req: Request) => String(req.params.id);
const actorOf = (req: Request) => ({ id: req.user!.id, role: req.user!.role, firstName: req.user!.firstName, lastName: req.user!.lastName });
const auditOwner = (req: Request, owner: Owner, action: string, details: Prisma.InputJsonValue) => audit(req, action, ownerTarget(owner), details);

// ─── Contracts ─────────────────────────────────────────────────────────

adminPartnerRecordsRouter.get('/contracts', async (req, res) => {
  const owner = ownerOfRequest(req);
  const rows = await listContracts(owner);
  res.json({ items: rows.map((r) => contractView(r)) });
});

/** Active templates of kind EMPLOYER (companies) / PARTNER (referral partners), each with the owner data still missing. */
adminPartnerRecordsRouter.get('/contracts/templates', async (req, res) => {
  const owner = ownerOfRequest(req);
  res.json({ items: await templatesForOwner(owner) });
});

const termsSchema = generateSchema.pick({ templateId: true, title: true, startDate: true, endDate: true, valueCents: true, currency: true, noticePeriodDays: true });

/** Rendered text of a template for the owner with the given terms (missing / unknown placeholders listed). */
adminPartnerRecordsRouter.post('/contracts/preview', async (req, res) => {
  const owner = ownerFrom(req.body);
  const body = parse(termsSchema, req.body ?? {});
  await loadOwner(owner);
  const r = await renderForOwner(owner, body.templateId, body, actorOf(req));
  res.json({ text: r.rendered.text, segments: r.rendered.segments, missing: r.missing, unknown: r.rendered.unknown });
});

/**
 * Generates the contract PDF from a template (new contract, or `contractId` regenerated). Empty placeholders →
 * 422 { error: 'MISSING_FIELDS', missing: [{ key, group, field }] } unless `allowMissing: true`.
 */
adminPartnerRecordsRouter.post('/contracts/generate', async (req, res) => {
  const owner = ownerFrom(req.body);
  const body = parse(generateSchema, req.body ?? {});
  await loadOwner(owner);
  const r = await generateContract(owner, body, actorOf(req));
  if (!r.ok) {
    res.status(422).json({ error: 'MISSING_FIELDS', missing: r.missing });
    return;
  }
  await auditOwner(req, owner, body.contractId ? 'PARTNER_CONTRACT_REGENERATED' : 'PARTNER_CONTRACT_GENERATED', {
    contractId: r.contract.id,
    title: r.contract.title,
    templateId: body.templateId,
    missing: r.missing.map((m) => m.key),
  });
  res.status(body.contractId ? 200 : 201).json({ contract: contractView(r.contract), missing: r.missing, unknown: r.unknown });
});

adminPartnerRecordsRouter.post('/contracts', async (req, res) => {
  const owner = ownerFrom(req.body);
  const body = parse(contractCreateSchema, req.body ?? {});
  await loadOwner(owner);
  const created = await prisma.partnerContract.create({ data: createData(owner, body, req.user!.id) });
  await applyLifecycle([created]);
  const contract = await loadContract(created.id);
  await auditOwner(req, owner, 'PARTNER_CONTRACT_CREATED', { contractId: contract.id, title: contract.title, kind: contract.kind, status: contract.status, startDate: dayOf(contract.startDate), endDate: dayOf(contract.endDate) });
  res.status(201).json({ contract: contractView(contract) });
});

adminPartnerRecordsRouter.get('/contracts/:id', async (req, res) => {
  res.json({ contract: contractView(await loadContract(id(req))) });
});

adminPartnerRecordsRouter.patch('/contracts/:id', async (req, res) => {
  const current = await loadContract(id(req));
  const body = parse(contractUpdateSchema, req.body ?? {});
  const data = contractData(body, current);
  const updated = await prisma.partnerContract.update({ where: { id: current.id }, data });
  await applyLifecycle([updated]);
  const contract = await loadContract(current.id);
  const diff = auditDiff(current as unknown as Record<string, unknown>, data as Record<string, unknown>, new Set(['note', 'reminderSentAt']));
  if (diff.fields.length) await auditOwner(req, ownerOfRow(current), 'PARTNER_CONTRACT_UPDATED', { contractId: current.id, title: contract.title, fields: diff.fields.filter((f) => f !== 'reminderSentAt'), changes: diff.changes as Prisma.InputJsonValue });
  res.json({ contract: contractView(contract) });
});

adminPartnerRecordsRouter.delete('/contracts/:id', async (req, res) => {
  const c = await loadContract(id(req));
  await prisma.partnerContract.delete({ where: { id: c.id } });
  await Promise.all([removeStored(c.filePath), removeStored(c.signedFilePath)]);
  await auditOwner(req, ownerOfRow(c), 'PARTNER_CONTRACT_DELETED', { contractId: c.id, title: c.title, status: c.status });
  res.json({ ok: true });
});

const slotOf = (s: string): FileSlot => (s === 'signed' ? 'signed' : 'file');

for (const slot of ['file', 'signed'] as const) {
  /** Upload (multipart field "file"): PDF, Word, JPEG / PNG / WebP, HEIC → JPEG; bytes checked; max 20 MB. */
  adminPartnerRecordsRouter.post(`/contracts/:id/${slot}`, contractUpload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('FILE_REQUIRED');
    let c;
    try {
      c = await loadContract(id(req));
    } catch (err) {
      await fsp.unlink(file.path).catch(() => undefined);
      throw err;
    }
    const contract = await attachUpload(c, slotOf(slot), file);
    await auditOwner(req, ownerOfRow(c), slot === 'file' ? 'PARTNER_CONTRACT_FILE_UPLOADED' : 'PARTNER_CONTRACT_SIGNED_UPLOADED', {
      contractId: c.id,
      title: c.title,
      fileName: slot === 'file' ? contract.fileName : contract.signedFileName,
    });
    res.status(201).json({ contract: contractView(contract) });
  });

  /** Download / inline view (?download=1 forces a download). STAFF+ only (router guard). */
  adminPartnerRecordsRouter.get(`/contracts/:id/${slot}`, async (req, res) => {
    const c = await loadContract(id(req));
    sendContractFile(res, c, slot, req.query.download === '1');
  });

  adminPartnerRecordsRouter.delete(`/contracts/:id/${slot}`, async (req, res) => {
    const c = await loadContract(id(req));
    const contract = await detachFile(c, slot);
    await auditOwner(req, ownerOfRow(c), slot === 'file' ? 'PARTNER_CONTRACT_FILE_REMOVED' : 'PARTNER_CONTRACT_SIGNED_REMOVED', { contractId: c.id, title: c.title });
    res.json({ contract: contractView(contract) });
  });
}

/** Sends the contract PDF for e-signature (company signatory / primary contact, then Triad Vision's countersigner). */
adminPartnerRecordsRouter.post('/contracts/:id/signature', async (req, res) => {
  const body = parse(
    z.object({
      signer: z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().toLowerCase().email().max(191) }).nullish(),
      message: z.string().trim().max(4000).nullish(),
      expiresInDays: z.number().int().min(1).max(90).default(DEFAULT_EXPIRY_DAYS),
    }),
    req.body ?? {},
  );
  const r = await sendContractForSignature(id(req), { signer: body.signer ?? null, message: body.message ?? null, expiresInDays: body.expiresInDays }, actorOf(req), { ...metaOf(req), actorId: req.user!.id });
  await auditOwner(req, ownerOfRow(r.contract), 'PARTNER_CONTRACT_SENT_FOR_SIGNATURE', { contractId: r.contract.id, title: r.contract.title, signatureRequestId: r.signatureRequestId });
  res.status(201).json({ contract: contractView(r.contract), signatureRequestId: r.signatureRequestId });
});

// ─── Activities + timeline ─────────────────────────────────────────────

/** Merged timeline (activities + audit changes), newest first. ?audit=0 → activities only; ?kind=CHANGE → audit only. */
adminPartnerRecordsRouter.get('/activities', async (req, res) => {
  const owner = ownerOfRequest(req);
  const q = parse(
    z.object({
      page: z.coerce.number().int().min(1).max(1000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(30),
      audit: z.enum(['0', '1']).default('1'),
      kind: z.enum([...ACTIVITY_KINDS, 'CHANGE']).optional(),
    }),
    req.query,
  );
  await loadOwner(owner);
  res.json(await timeline(owner, { page: q.page, pageSize: q.pageSize, audit: q.audit === '1', kind: q.kind }, req.user!));
});

adminPartnerRecordsRouter.post('/activities', async (req, res) => {
  const owner = ownerFrom(req.body);
  const body = parse(activityCreateSchema, req.body ?? {});
  await loadOwner(owner);
  await assertContactOfOwner(owner, body.contactId);
  const a = await prisma.partnerActivity.create({
    data: { ...ownerData(owner), kind: body.kind, body: body.body, at: body.at ?? new Date(), contactId: body.contactId ?? null, createdById: req.user!.id },
  });
  await auditOwner(req, owner, 'PARTNER_ACTIVITY_CREATED', { activityId: a.id, kind: a.kind });
  res.status(201).json({ activity: a });
});

adminPartnerRecordsRouter.patch('/activities/:id', async (req, res) => {
  const a = await loadActivity(id(req));
  assertActivityEditable(a, req.user!);
  const body = parse(activityUpdateSchema, req.body ?? {});
  const owner = ownerOfRow(a);
  if (body.contactId !== undefined) await assertContactOfOwner(owner, body.contactId);
  const updated = await prisma.partnerActivity.update({ where: { id: a.id }, data: body });
  await auditOwner(req, owner, 'PARTNER_ACTIVITY_UPDATED', { activityId: a.id, fields: Object.keys(body) });
  res.json({ activity: updated });
});

adminPartnerRecordsRouter.delete('/activities/:id', async (req, res) => {
  const a = await loadActivity(id(req));
  assertActivityEditable(a, req.user!);
  await prisma.partnerActivity.delete({ where: { id: a.id } });
  await auditOwner(req, ownerOfRow(a), 'PARTNER_ACTIVITY_DELETED', { activityId: a.id, kind: a.kind });
  res.json({ ok: true });
});

// ─── Contact persons ───────────────────────────────────────────────────

adminPartnerRecordsRouter.get('/contacts', async (req, res) => {
  const owner = ownerOfRequest(req);
  res.json({ items: (await listContacts(owner)).map(contactView) });
});

adminPartnerRecordsRouter.post('/contacts', async (req, res) => {
  const owner = ownerFrom(req.body);
  const body = parse(contactCreateSchema, req.body ?? {});
  const c = await createContact(owner, body, req.user!.id);
  await auditOwner(req, owner, 'PARTNER_CONTACT_CREATED', { contactId: c.id, name: `${c.firstName} ${c.lastName ?? ''}`.trim(), isPrimary: c.isPrimary });
  res.status(201).json({ contact: contactView(c) });
});

adminPartnerRecordsRouter.patch('/contacts/:id', async (req, res) => {
  const current = await loadContact(id(req));
  const body = parse(contactUpdateSchema, req.body ?? {});
  const c = await updateContact(current, body);
  const diff = auditDiff(current as unknown as Record<string, unknown>, body as Record<string, unknown>, new Set(['notes']));
  if (diff.fields.length) await auditOwner(req, ownerOfRow(current), 'PARTNER_CONTACT_UPDATED', { contactId: c.id, name: `${c.firstName} ${c.lastName ?? ''}`.trim(), fields: diff.fields, changes: diff.changes as Prisma.InputJsonValue });
  res.json({ contact: contactView(c) });
});

adminPartnerRecordsRouter.delete('/contacts/:id', async (req, res) => {
  const c = await loadContact(id(req));
  await deleteContact(c);
  await auditOwner(req, ownerOfRow(c), 'PARTNER_CONTACT_DELETED', { contactId: c.id, name: `${c.firstName} ${c.lastName ?? ''}`.trim() });
  res.json({ ok: true });
});
