import type { Locale, OfficialFormFill, Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { cancelRequest, createRequest, sendRequest, type Actor } from '../esign/service.js';
import { contractView, saveContract, type ContractInput } from '../placement/employmentContract.js';
import { DATA_KEYS, DATA_KEY_MAP, type DataKeyDef } from './catalog.js';
import { deriveData, loadCaseData, saveCompanyExtras } from './resolve.js';
import { fillPdf } from './pdf.js';
import {
  EMPLOYER_FORM_KEY,
  activeTemplate,
  fillValuesOf,
  fillView,
  latestFillOfKey,
  readStoredForm,
  resolveForCase,
  removeStoredForm,
  syncSignedFill,
  writeStoredForm,
  type FillValues,
} from './service.js';

/**
 * "Erklärung zum Beschäftigungsverhältnis" with the employer: staff send it (prefilled from the employment contract,
 * the company and the client), the employer corrects the employer-side values in the company portal and signs it
 * with the e-signature module; the signed PDF is filed on the case (e-signature completion + onFormSigned) and the
 * corrections flow back into the employment contract (with field history entries) and the company's form details.
 */

/** Values the employer may correct (catalogue keys flagged `employer`). */
export const EMPLOYER_KEYS: DataKeyDef[] = DATA_KEYS.filter((d) => d.employer);
const EMPLOYER_KEY_SET = new Set(EMPLOYER_KEYS.map((d) => d.key));
/** Answers the employer has to give before signing. */
export const EMPLOYER_REQUIRED = ['company.name', 'company.street', 'company.postalCode', 'company.city', 'company.betriebsnummer', 'company.foundedRecently', 'contract.jobTitle', 'contract.startDate', 'contract.contractType', 'contract.weeklyHours', 'contract.grossMonthly', 'contract.vacationDays', 'employment.workplaceMode', 'employment.leasedToThirdParty', 'employment.overtime', 'employment.collectiveAgreement', 'employment.socialInsurance'];

const label = (title: string, worker: string) => `${title} – ${worker}`.slice(0, 200);

const companyUsers = (companyId: string) =>
  prisma.user.findMany({ where: { companyId, role: 'COMPANY', isActive: true }, select: { id: true, firstName: true, lastName: true, email: true, locale: true, phone: true }, orderBy: { createdAt: 'asc' } });

const NOTIFY: Record<Locale, { title: string; body: (worker: string) => string }> = {
  az: { title: 'İmzalanmalı forma', body: (w) => `${w} üçün "Erklärung zum Beschäftigungsverhältnis" formu hazırdır. Məlumatları yoxlayın və imzalayın.` },
  de: { title: 'Formular zur Unterschrift', body: (w) => `Die „Erklärung zum Beschäftigungsverhältnis“ für ${w} ist vorausgefüllt. Bitte prüfen, ergänzen und unterschreiben.` },
  en: { title: 'Form to sign', body: (w) => `The "Erklärung zum Beschäftigungsverhältnis" (employment declaration) for ${w} is prefilled. Please check, complete and sign it.` },
  ru: { title: 'Форма на подпись', body: (w) => `«Erklärung zum Beschäftigungsverhältnis» для ${w} предзаполнена. Проверьте, дополните и подпишите.` },
};

/** Staff: send the declaration to the employer of the case. */
export const sendToEmployer = async (caseId: string, userId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, companyId: true, client: { select: { firstName: true, lastName: true } } } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (!c.companyId) throw conflict('NO_EMPLOYER');
  const t = await activeTemplate(EMPLOYER_FORM_KEY);
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  const users = await companyUsers(c.companyId);
  if (!users.length) throw conflict('EMPLOYER_HAS_NO_ACCOUNT');
  const latest = await latestFillOfKey(c.id, EMPLOYER_FORM_KEY);
  if (latest?.status === 'SENT_TO_EMPLOYER') throw conflict('ALREADY_SENT');
  // Staff overrides of a not yet signed fill carry over.
  const prev = latest && (latest.status === 'DRAFT' || latest.status === 'GENERATED') ? fillValuesOf(latest) : {};
  const r = await resolveForCase(t, c.id, { fieldOverrides: prev.fieldOverrides ?? {} });
  const values: FillValues = { dataOverrides: {}, fieldOverrides: prev.fieldOverrides ?? {} };
  const data = {
    values: values as unknown as Prisma.InputJsonValue,
    missing: r.missing as unknown as Prisma.InputJsonValue,
    status: 'SENT_TO_EMPLOYER',
    companyId: c.companyId,
    signatureRequestId: null,
  };
  const fill =
    latest && (latest.status === 'DRAFT' || latest.status === 'GENERATED') && latest.templateId === t.id
      ? await prisma.officialFormFill.update({ where: { id: latest.id }, data })
      : await prisma.officialFormFill.create({ data: { ...data, templateId: t.id, caseId: c.id, createdById: userId } });
  const worker = `${c.client.firstName} ${c.client.lastName}`.trim();
  for (const u of users) {
    const n = NOTIFY[u.locale] ?? NOTIFY.de;
    await notifyUser(u.id, { type: 'OFFICIAL_FORM_REQUEST', title: n.title, body: n.body(worker), link: `/company/forms/${fill.id}` });
  }
  await prisma.caseEvent.create({ data: { caseId: c.id, type: 'OFFICIAL_FORM_SENT_TO_EMPLOYER', actorId: userId, note: `${t.title} → Arbeitgeber`, visibleToClient: false } });
  return fillView({ ...fill, template: t });
};

// ─── Company portal ────────────────────────────────────────────────────

const companyFillOr404 = async (companyId: string, fillId: string) => {
  const f = await prisma.officialFormFill.findUnique({ where: { id: fillId } });
  if (!f || f.companyId !== companyId) throw notFound('FILL_NOT_FOUND');
  const c = await prisma.case.findUnique({ where: { id: f.caseId }, select: { companyId: true } });
  if (c?.companyId !== companyId) throw notFound('FILL_NOT_FOUND');
  return f;
};

const VISIBLE = ['SENT_TO_EMPLOYER', 'SIGNED', 'SUBMITTED'];

const signerFor = async (f: Pick<OfficialFormFill, 'signatureRequestId'>, userId: string) => {
  if (!f.signatureRequestId) return null;
  const s = await prisma.signatureSigner.findFirst({ where: { requestId: f.signatureRequestId, userId }, select: { id: true, status: true } });
  const r = await prisma.signatureRequest.findUnique({ where: { id: f.signatureRequestId }, select: { status: true } });
  return { signerId: s?.id ?? null, signerStatus: s?.status ?? null, requestStatus: r?.status ?? null };
};

export const listCompanyForms = async (companyId: string, userId: string) => {
  const rows = await prisma.officialFormFill.findMany({ where: { companyId, status: { in: VISIBLE } }, orderBy: { updatedAt: 'desc' }, take: 200 });
  for (const f of rows) await syncSignedFill(f).catch(() => undefined);
  const fresh = await prisma.officialFormFill.findMany({ where: { id: { in: rows.map((r) => r.id) } }, orderBy: { updatedAt: 'desc' } });
  const cases = await prisma.case.findMany({ where: { id: { in: fresh.map((f) => f.caseId) }, companyId }, select: { id: true, number: true, profession: true, client: { select: { firstName: true, lastName: true } } } });
  const templates = await prisma.officialFormTemplate.findMany({ where: { id: { in: fresh.map((f) => f.templateId) } }, select: { id: true, title: true, key: true, version: true } });
  const byCase = new Map(cases.map((c) => [c.id, c]));
  const byTpl = new Map(templates.map((t) => [t.id, t]));
  const items = [];
  for (const f of fresh) {
    const c = byCase.get(f.caseId);
    if (!c) continue;
    items.push({
      id: f.id,
      status: f.status,
      title: byTpl.get(f.templateId)?.title ?? 'Formular',
      worker: `${c.client.firstName} ${c.client.lastName}`.trim(),
      profession: c.profession,
      caseNumber: c.number,
      updatedAt: f.updatedAt,
      signature: await signerFor(f, userId),
    });
  }
  return { items, open: items.filter((i) => i.status === 'SENT_TO_EMPLOYER').length };
};

/** What the employer sees: the worker, the employer-side values (current) and the signing state. */
export const companyFormDetail = async (companyId: string, fillId: string, userId: string) => {
  let f = await companyFillOr404(companyId, fillId);
  await syncSignedFill(f).catch(() => undefined);
  f = await companyFillOr404(companyId, fillId);
  const t = await prisma.officialFormTemplate.findUnique({ where: { id: f.templateId } });
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  const values = fillValuesOf(f);
  const data = deriveData(await loadCaseData(f.caseId), values.dataOverrides ?? {});
  const c = await prisma.case.findUniqueOrThrow({ where: { id: f.caseId }, select: { number: true, profession: true, visaType: true } });
  return {
    id: f.id,
    status: f.status,
    title: t.title,
    version: t.version,
    caseNumber: c.number,
    worker: {
      name: data['client.fullName'] ?? '',
      birthDate: data['client.birthDate'] ?? '',
      nationality: data['client.nationality'] ?? '',
      profession: data['client.profession'] || c.profession,
    },
    fields: EMPLOYER_KEYS.map((d) => ({ key: d.key, group: d.group, kind: d.kind, codes: d.codes ?? null, label: d.label, value: data[d.key] ?? '', required: EMPLOYER_REQUIRED.includes(d.key) })),
    editable: f.status === 'SENT_TO_EMPLOYER',
    submittedAt: values.dataOverrides && Object.keys(values.dataOverrides).length ? f.updatedAt : null,
    signature: await signerFor(f, userId),
  };
};

const valueSchema = z.union([z.string().max(1000), z.number(), z.null()]).transform((v) => (v === null ? '' : String(v).trim()));

/** Checks and normalises the employer's values: dates YYYY-MM-DD, numbers, codes of the catalogue. */
export const parseEmployerValues = (raw: unknown) => {
  const obj = z.record(z.string().max(80), valueSchema).parse(raw ?? {});
  const out: Record<string, string> = {};
  const errors: { key: string; code: string }[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (!EMPLOYER_KEY_SET.has(key)) continue;
    const d = DATA_KEY_MAP.get(key)!;
    if (!value) {
      out[key] = '';
      continue;
    }
    if (d.kind === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) errors.push({ key, code: 'INVALID_DATE' });
      else out[key] = value;
    } else if (d.kind === 'money' || d.kind === 'number') {
      const n = Number(value.replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 10_000_000) errors.push({ key, code: 'INVALID_NUMBER' });
      else out[key] = String(n);
    } else if (d.kind === 'code') {
      if (!d.codes?.includes(value)) errors.push({ key, code: 'INVALID_OPTION' });
      else out[key] = value;
    } else out[key] = value.slice(0, key === 'employment.jobDescription' ? 1000 : 300);
  }
  return { values: out, errors };
};

const CONTRACT_FIELD: Record<string, keyof ContractInput> = {
  'contract.jobTitle': 'jobTitle',
  'contract.contractType': 'contractType',
  'contract.grossMonthly': 'grossMonthly',
  'contract.weeklyHours': 'weeklyHours',
  'contract.startDate': 'startDate',
  'contract.endDate': 'endDate',
  'contract.probationMonths': 'probationMonths',
  'contract.vacationDays': 'vacationDays',
};

const comparable = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === undefined ? null : v);

/** Employer corrections → employment contract (+ FieldChange rows on the case, source "client"). */
const writeBackContract = async (caseId: string, before: Record<string, string>, after: Record<string, string>, actor: { id: string; role: Role }) => {
  const input: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(CONTRACT_FIELD)) {
    if (!(key in after) || (after[key] ?? '') === (before[key] ?? '')) continue;
    const v = after[key];
    if (field === 'jobTitle') input[field] = v || null;
    else if (field === 'contractType') input[field] = v || undefined;
    else if (field === 'startDate' || field === 'endDate') input[field] = v ? new Date(`${v}T00:00:00.000Z`) : null;
    else if (field === 'vacationDays' || field === 'probationMonths') input[field] = v ? Math.round(Number(v)) : null;
    else input[field] = v ? Number(v) : null;
  }
  if (!Object.keys(input).length) return [];
  const old = await prisma.employmentContract.findUnique({ where: { caseId } });
  const prev = old ? contractView(old) : null;
  const saved = await saveContract(caseId, input as ContractInput, actor.id);
  const changes = Object.keys(input)
    .map((field) => ({ field, oldValue: comparable(prev?.[field as keyof typeof prev]), newValue: comparable(saved.contract[field as keyof typeof saved.contract]) }))
    .filter((c) => JSON.stringify(c.oldValue) !== JSON.stringify(c.newValue));
  if (changes.length) {
    const requestId = `oform-${Date.now().toString(36)}`;
    await prisma.fieldChange.createMany({
      data: changes.map((c) => ({
        entity: 'CASE',
        entityId: caseId,
        field: `employmentContract.${c.field}`,
        oldValue: (c.oldValue ?? null) as Prisma.InputJsonValue,
        newValue: (c.newValue ?? null) as Prisma.InputJsonValue,
        actorId: actor.id,
        actorRole: actor.role,
        source: 'client',
        requestId,
      })),
    });
  }
  return changes.map((c) => c.field);
};

/**
 * The employer confirms the values: stored as the fill's employer corrections, the PDF is generated (flattened —
 * the signature covers exactly these values), a signature request for the employer's account is created and
 * sent, the corrections flow back into the contract / company details. Returns the signer id for /company/contracts/:id.
 */
export const submitEmployerForm = async (companyId: string, fillId: string, user: { id: string; role: Role; firstName: string; lastName: string; email: string; locale: Locale; phone?: string | null }, raw: unknown) => {
  const f = await companyFillOr404(companyId, fillId);
  if (f.status !== 'SENT_TO_EMPLOYER') throw conflict('INVALID_STATUS');
  const { values: incoming, errors } = parseEmployerValues(raw);
  if (errors.length) throw badRequest('INVALID_VALUES', errors.map((e) => e.key).join(','));
  const t = await prisma.officialFormTemplate.findUnique({ where: { id: f.templateId } });
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  const stored = fillValuesOf(f);
  const base = await loadCaseData(f.caseId);
  const before = deriveData(base, stored.dataOverrides ?? {});
  // Keep only real changes against the prefilled data as overrides.
  const merged: Record<string, string> = { ...(stored.dataOverrides ?? {}) };
  for (const [k, v] of Object.entries(incoming)) {
    if ((base[k] ?? '') === v) delete merged[k];
    else merged[k] = v;
  }
  const after = deriveData(base, merged);
  const missing = EMPLOYER_REQUIRED.filter((k) => !(after[k] ?? '').trim());
  if (missing.length) throw badRequest('REQUIRED_MISSING', missing.join(','));

  const values: FillValues = { ...stored, dataOverrides: merged };
  const r = await resolveForCase(t, f.caseId, values);
  const out = await fillPdf(await readStoredForm(t.fileKey), r.values, { flatten: true });
  values.fields = Object.fromEntries(r.rows.map((x) => [x.field, x.value]));

  // Replace an earlier, not yet signed request.
  const staffCreator = f.createdById ? await prisma.user.findUnique({ where: { id: f.createdById }, select: { id: true, role: true, firstName: true, lastName: true, isActive: true } }) : null;
  const actor: Actor = staffCreator?.isActive ? staffCreator : { id: user.id, role: user.role, firstName: user.firstName, lastName: user.lastName };
  if (f.signatureRequestId) {
    const old = await prisma.signatureRequest.findUnique({ where: { id: f.signatureRequestId }, select: { status: true } });
    if (old?.status === 'COMPLETED') throw conflict('ALREADY_SIGNED');
    if (old && (old.status === 'SENT' || old.status === 'DRAFT')) await cancelRequest(f.signatureRequestId, actor, 'Replaced by new employer values').catch(() => undefined);
  }
  const worker = r.data['client.fullName'] || 'Arbeitnehmer';
  const req = await createRequest(
    {
      title: label(t.title, worker),
      caseId: f.caseId,
      companyId,
      message: null,
      order: 'PARALLEL',
      signers: [{ role: 'COMPANY', name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, userId: user.id, locale: user.locale, phone: user.phone ?? null }],
      pdf: out.pdf,
      fileName: `${t.key.toLowerCase()}-${r.case.number}.pdf`,
    },
    actor,
  );
  await sendRequest(req.id, actor);
  const signer = await prisma.signatureSigner.findFirst({ where: { requestId: req.id, userId: user.id }, select: { id: true } });

  const fileKey = await writeStoredForm('fill', out.pdf);
  await prisma.officialFormFill.update({
    where: { id: f.id },
    data: { values: values as unknown as Prisma.InputJsonValue, missing: r.missing as unknown as Prisma.InputJsonValue, signatureRequestId: req.id, fileKey, generatedAt: new Date() },
  });
  if (f.fileKey && f.fileKey !== fileKey) await removeStoredForm(f.fileKey);

  // Corrections flow back: contract terms (with history) and the company's form details.
  const contractChanged = await writeBackContract(f.caseId, before, after, user).catch((err) => {
    console.error('[officialForms] contract write-back failed', err);
    return [] as string[];
  });
  await saveCompanyExtras(companyId, { betriebsnummer: after['company.betriebsnummer'] ?? undefined, handelsregister: after['company.handelsregister'] ?? undefined, fax: after['company.fax'] ?? undefined });
  await prisma.caseEvent.create({
    data: { caseId: f.caseId, type: 'OFFICIAL_FORM_EMPLOYER_SUBMITTED', actorId: user.id, note: `${t.title}: Angaben bestätigt${contractChanged.length ? ` · Vertrag geändert: ${contractChanged.join(', ')}` : ''}`, visibleToClient: false },
  });
  return { signerId: signer?.id ?? null, signatureRequestId: req.id, contractChanged };
};

/** The PDF the employer would sign with the given (unsaved) values — "Preview". */
export const employerPreview = async (companyId: string, fillId: string, raw: unknown) => {
  const f = await companyFillOr404(companyId, fillId);
  const t = await prisma.officialFormTemplate.findUnique({ where: { id: f.templateId } });
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  const stored = fillValuesOf(f);
  const { values: incoming } = parseEmployerValues(raw);
  const r = await resolveForCase(t, f.caseId, { ...stored, dataOverrides: { ...(stored.dataOverrides ?? {}), ...incoming } });
  const out = await fillPdf(await readStoredForm(t.fileKey), r.values, { flatten: true });
  return { pdf: out.pdf, name: `${t.key.toLowerCase()}-${r.case.number}.pdf` };
};

export const assertCompanyUser = async (userId: string) => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, firstName: true, lastName: true, email: true, locale: true, phone: true, companyId: true, company: { select: { status: true } } } });
  if (!u?.companyId) throw forbidden('NO_COMPANY');
  if (u.company?.status === 'SUSPENDED') throw forbidden('COMPANY_SUSPENDED');
  return { ...u, companyId: u.companyId };
};
