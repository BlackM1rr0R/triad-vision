import fs from 'node:fs/promises';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ContractKind, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { HttpError, badRequest, notFound, parse } from '../../lib/http.js';
import { requireMinRole } from '../../middleware/auth.js';
import { INPUT_KEYS, PLACEHOLDERS, renderContract, usedKeys } from '../../lib/contracts/render.js';
import { asContractLang, contractValues, loadContractCase, type ContractCase } from '../../lib/contracts/values.js';
import { renderContractPdf } from '../../lib/contracts/pdf.js';
import { DEFAULT_EXPIRY_DAYS, MAX_SIGNERS, createRequest, sendRequest, storedPath, type Actor, type SignerInput } from '../../lib/esign/service.js';
import { withCountersigner } from '../../lib/esign/countersign.js';
import { metaOf } from '../../lib/esign/http.js';

/**
 * Contract templates (Arbeitsvertrag, Ausbildungsvertrag, Dienstleistungsvertrag), mounted at
 * /api/admin/contract-templates. STAFF read and use them for their cases (preview / PDF / e-signature);
 * creating, editing and deleting templates is ADMIN+.
 */
export const adminContractTemplatesRouter = Router();

// EMPLOYER / PARTNER: contracts with an employer or a referral partner, generated in lib/partnerRecords (not per case).
const KINDS = ['WORK', 'AUSBILDUNG', 'SERVICE', 'EMPLOYER', 'PARTNER'] as const;
const PARTY_KINDS: ContractKind[] = ['EMPLOYER', 'PARTNER'];
const LANGS = ['de', 'en', 'az', 'ru'] as const;
const id = z.string().trim().min(1).max(40);
const MAX_BODY = 200_000;

const templateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  kind: z.enum(KINDS),
  language: z.enum(LANGS).default('de'),
  body: z.string().max(MAX_BODY).refine((s) => s.trim().length >= 10, 'BODY_TOO_SHORT'),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
});

const inputsSchema = z
  .object(Object.fromEntries(INPUT_KEYS.map((k) => [k, z.string().trim().max(500).optional()])) as Record<string, z.ZodOptional<z.ZodString>>)
  .strip()
  .default({});

const useSchema = z.object({ caseId: id, inputs: inputsSchema });

const signerSchema = z.object({
  role: z.enum(['CANDIDATE', 'COMPANY', 'STAFF', 'OTHER']),
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().max(191),
  phone: z.string().trim().max(32).nullish(),
  userId: id.nullish(),
  locale: z.enum(['az', 'de', 'en', 'ru']).nullish(),
  order: z.number().int().min(1).max(99).nullish(),
});

const sendSchema = useSchema.extend({
  signers: z.array(signerSchema).min(1).max(MAX_SIGNERS).optional(),
  message: z.string().trim().max(4000).nullish(),
  expiresInDays: z.number().int().min(1).max(90).default(DEFAULT_EXPIRY_DAYS),
});

const actorOf = (req: Request): Actor => ({ id: req.user!.id, role: req.user!.role, firstName: req.user!.firstName, lastName: req.user!.lastName });

const view = (t: { id: string; name: string; kind: ContractKind; language: string; body: string; isDefault: boolean; active: boolean; createdAt: Date; updatedAt: Date; createdBy?: { id: string; firstName: string; lastName: string } | null }) => ({
  ...t,
  placeholders: usedKeys(t.body),
});

const loadTemplate = async (templateId: string) => {
  const t = await prisma.contractTemplate.findUnique({ where: { id: templateId } });
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  return t;
};

/** Only one default per kind + language. */
const clearOtherDefaults = (tx: Prisma.TransactionClient, kind: ContractKind, language: string, keepId: string) =>
  tx.contractTemplate.updateMany({ where: { kind, language, isDefault: true, id: { not: keepId } }, data: { isDefault: false } });

// ─── Read ──────────────────────────────────────────────────────────────

adminContractTemplatesRouter.get('/', async (req, res) => {
  const q = parse(z.object({ kind: z.enum(KINDS).optional(), active: z.enum(['true', 'false']).optional() }), req.query);
  const rows = await prisma.contractTemplate.findMany({
    where: { ...(q.kind ? { kind: q.kind } : {}), ...(q.active ? { active: q.active === 'true' } : {}) },
    orderBy: [{ kind: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  });
  res.json({ items: rows.map(view) });
});

/** The documented placeholder set (key, group, whether it is typed in at send time). */
adminContractTemplatesRouter.get('/placeholders', (_req, res) => {
  res.json({ items: PLACEHOLDERS });
});

adminContractTemplatesRouter.get('/:id', async (req, res) => {
  const t = await prisma.contractTemplate.findUnique({
    where: { id: String(req.params.id) },
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  res.json({ template: view(t) });
});

// ─── Write (ADMIN+) ────────────────────────────────────────────────────

adminContractTemplatesRouter.post('/', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(templateSchema, req.body ?? {});
  const t = await prisma.$transaction(async (tx) => {
    const created = await tx.contractTemplate.create({ data: { ...body, createdById: req.user!.id } });
    if (created.isDefault) await clearOtherDefaults(tx, created.kind, created.language, created.id);
    return created;
  });
  void audit(req, 'contractTemplate.create', t.id, { name: t.name, kind: t.kind });
  res.status(201).json({ template: view(t) });
});

adminContractTemplatesRouter.patch('/:id', requireMinRole('ADMIN'), async (req, res) => {
  const existing = await loadTemplate(String(req.params.id));
  const body = parse(templateSchema.partial(), req.body ?? {});
  const t = await prisma.$transaction(async (tx) => {
    const updated = await tx.contractTemplate.update({ where: { id: existing.id }, data: body });
    if (updated.isDefault) await clearOtherDefaults(tx, updated.kind, updated.language, updated.id);
    return updated;
  });
  void audit(req, 'contractTemplate.update', t.id, { fields: Object.keys(body) });
  res.json({ template: view(t) });
});

adminContractTemplatesRouter.delete('/:id', requireMinRole('ADMIN'), async (req, res) => {
  const t = await loadTemplate(String(req.params.id));
  await prisma.contractTemplate.delete({ where: { id: t.id } });
  void audit(req, 'contractTemplate.delete', t.id, { name: t.name });
  res.json({ ok: true });
});

// ─── Use: preview / PDF / e-signature (STAFF+) ─────────────────────────

const renderFor = async (req: Request, templateId: string, caseId: string, inputs: Record<string, string | undefined>) => {
  const t = await loadTemplate(templateId);
  if (PARTY_KINDS.includes(t.kind)) throw badRequest('TEMPLATE_NOT_FOR_CASE'); // employer / partner contracts: /api/admin/partner-records
  const c = await loadContractCase(caseId);
  const lang = asContractLang(t.language);
  const values = await contractValues(c, inputs, lang, req.user ? { firstName: req.user.firstName, lastName: req.user.lastName } : null);
  return { t, c, lang, values, rendered: renderContract(t.body, values) };
};

const fileNameOf = (name: string, number: string) =>
  `${name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'Vertrag'}-${number}.pdf`;

const partiesOf = (kind: ContractKind, values: Record<string, string>): [string, string] =>
  kind === 'SERVICE' ? [values['triad.name'], values['client.fullName']] : [values['company.name'], values['client.fullName']];

adminContractTemplatesRouter.post('/:id/preview', async (req, res) => {
  const body = parse(useSchema, req.body ?? {});
  const { rendered } = await renderFor(req, String(req.params.id), body.caseId, body.inputs);
  res.json(rendered);
});

adminContractTemplatesRouter.post('/:id/pdf', async (req, res) => {
  const body = parse(useSchema, req.body ?? {});
  const { t, c, lang, values, rendered } = await renderFor(req, String(req.params.id), body.caseId, body.inputs);
  const pdf = await renderContractPdf({ title: t.name, text: rendered.text, kind: t.kind, language: lang, parties: partiesOf(t.kind, values) });
  void audit(req, 'contractTemplate.pdf', t.id, { caseId: c.id });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileNameOf(t.name, c.number))}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Missing-Placeholders', String(rendered.missing.length));
  res.send(pdf);
});

/** Client as CANDIDATE; the company contact for work / training contracts; the acting staff member for service contracts. */
const defaultSigners = async (kind: ContractKind, c: ContractCase, req: Request): Promise<SignerInput[]> => {
  const signers: SignerInput[] = [
    { role: 'CANDIDATE', name: `${c.client.firstName} ${c.client.lastName}`.trim(), email: c.client.email, phone: c.client.phone, userId: c.client.id, locale: c.client.locale, order: 1 },
  ];
  if ((kind === 'WORK' || kind === 'AUSBILDUNG') && c.company) {
    const u = c.company.users[0];
    if (u) signers.push({ role: 'COMPANY', name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, phone: u.phone, userId: u.id, locale: u.locale, order: 2 });
    else if (c.company.email) signers.push({ role: 'COMPANY', name: c.company.contactName?.trim() || c.company.name, email: c.company.email.toLowerCase(), phone: c.company.phone, locale: 'de', order: 2 });
  }
  if (kind === 'SERVICE') {
    // Countersignature configured: the default authorised signatory signs for Triad Vision after the client.
    const withCs = await withCountersigner(signers, 'CASE_CONTRACT');
    if (withCs.length > signers.length) return withCs;
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, firstName: true, lastName: true, email: true, locale: true } });
    signers.push({ role: 'STAFF', name: `${me.firstName} ${me.lastName}`.trim(), email: me.email, userId: me.id, locale: me.locale, order: 2 });
  }
  return signers;
};

/** Case statuses in which a service contract becomes the case's contract step (like the e-sign prefill). */
const CONTRACT_STEP = ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'];
/** Errors from the case flow that mean "this case cannot take a contract right now". */
const CONTRACT_REFUSALS = ['REQUIRED_DOCUMENTS_NOT_ACCEPTED', 'INVALID_TRANSITION'];

adminContractTemplatesRouter.post('/:id/send', async (req, res) => {
  const body = parse(sendSchema, req.body ?? {});
  const { t, c, lang, values, rendered } = await renderFor(req, String(req.params.id), body.caseId, body.inputs);
  if (!t.active) throw badRequest('TEMPLATE_INACTIVE');
  const pdf = await renderContractPdf({ title: t.name, text: rendered.text, kind: t.kind, language: lang, parties: partiesOf(t.kind, values) });
  const signers = body.signers ?? (await defaultSigners(t.kind, c, req));
  const actor = actorOf(req);
  const meta = { ...metaOf(req), actorId: actor.id };
  const base = {
    title: `${t.name} · ${c.number}`.slice(0, 200),
    caseId: c.id,
    message: body.message ?? null,
    expiresAt: new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000),
    order: 'SEQUENTIAL' as const,
    signers,
    pdf,
    fileName: fileNameOf(t.name, c.number),
  };

  const createAndSend = async (caseContract: boolean) => {
    const created = await createRequest({ ...base, caseContract }, actor, meta);
    try {
      await sendRequest(created.id, actor, meta);
    } catch (err) {
      // Nothing was sent: do not leave a draft behind.
      await prisma.signatureRequest.delete({ where: { id: created.id } }).catch(() => undefined);
      await fs.unlink(storedPath(created.originalKey)).catch(() => undefined);
      throw err;
    }
    return created;
  };

  let caseContract = t.kind === 'SERVICE' && CONTRACT_STEP.includes(c.status);
  let created;
  try {
    created = await createAndSend(caseContract);
  } catch (err) {
    if (!caseContract || !(err instanceof HttpError) || !CONTRACT_REFUSALS.includes(err.code)) throw err;
    caseContract = false; // the case cannot take its contract now: send as an ordinary signature request
    created = await createAndSend(false);
  }
  void audit(req, 'contractTemplate.send', t.id, { caseId: c.id, signatureRequestId: created.id, caseContract, missing: rendered.missing });
  res.status(201).json({ signatureRequestId: created.id, caseContract, missing: rendered.missing });
});
