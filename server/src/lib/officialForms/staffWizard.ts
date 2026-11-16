import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { checkEmployerValues, employerFieldsView, ezbDataSheet, parseEmployerValues, wizardMeta } from './employer.js';
import { deriveData, loadCaseData } from './resolve.js';
import { EMPLOYER_FORM_KEY, activeTemplate, fillForCase, fillValuesOf, fillView, latestFillOfKey, type FillValues } from './service.js';

/**
 * Staff version of the "Erklärung zum Beschäftigungsverhältnis" wizard on the case (e.g. the employer answers on
 * the phone): the same steps, rules and prefill as the company portal. Values are stored as the fill's employer
 * corrections (DRAFT / GENERATED), "generate" fills the official PDF (case drive folder, as the case panel does);
 * without an installed official PDF only the data sheet is available.
 */

const editableFill = async (caseId: string) => {
  const latest = await latestFillOfKey(caseId, EMPLOYER_FORM_KEY);
  return latest && (latest.status === 'DRAFT' || latest.status === 'GENERATED') ? latest : null;
};

const caseOr404 = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, companyId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return c;
};

export const staffWizardDetail = async (caseId: string) => {
  const c = await caseOr404(caseId);
  const [t, latest] = await Promise.all([activeTemplate(EMPLOYER_FORM_KEY), latestFillOfKey(caseId, EMPLOYER_FORM_KEY)]);
  const editable = !latest || latest.status === 'DRAFT' || latest.status === 'GENERATED';
  const overrides = latest && latest.status !== 'SUBMITTED' ? (fillValuesOf(latest).dataOverrides ?? {}) : {};
  const data = deriveData(await loadCaseData(caseId), overrides);
  return {
    caseNumber: c.number,
    hasEmployer: !!c.companyId,
    templateInstalled: !!t,
    editable,
    latest: latest ? fillView(latest) : null,
    fields: employerFieldsView(data),
    ...wizardMeta(data),
  };
};

/**
 * Saves the staff answers (only real changes against the prefilled data are kept as overrides). `generate`
 * validates like the employer submit and fills the official PDF; a draft save only checks formats.
 */
export const staffWizardSave = async (caseId: string, raw: unknown, opts: { userId: string; generate: boolean }) => {
  await caseOr404(caseId);
  const { values: incoming, errors } = parseEmployerValues(raw);
  if (errors.length) throw badRequest('INVALID_VALUES', errors.map((e) => e.key).join(','));
  const t = await activeTemplate(EMPLOYER_FORM_KEY);
  if (!t) throw conflict('TEMPLATE_NOT_FOUND');
  const latest = await latestFillOfKey(caseId, EMPLOYER_FORM_KEY);
  if (latest && (latest.status === 'SENT_TO_EMPLOYER' || latest.status === 'SIGNED')) throw conflict(latest.status === 'SIGNED' ? 'ALREADY_SIGNED' : 'SENT_TO_EMPLOYER');
  const fill = await editableFill(caseId);
  const base = await loadCaseData(caseId);
  const stored = fillValuesOf(fill);
  const merged: Record<string, string> = { ...(stored.dataOverrides ?? {}) };
  for (const [k, v] of Object.entries(incoming)) {
    if ((base[k] ?? '') === v) delete merged[k];
    else merged[k] = v;
  }
  if (opts.generate) {
    const { missing, invalid } = checkEmployerValues(deriveData(base, merged));
    if (missing.length) throw badRequest('REQUIRED_MISSING', missing.join(','));
    if (invalid.length) throw badRequest('INVALID_VALUES', invalid.join(','));
  }
  const values: FillValues = { ...stored, dataOverrides: merged };
  if (fill && fill.templateId === t.id) {
    await prisma.officialFormFill.update({ where: { id: fill.id }, data: { values: values as unknown as Prisma.InputJsonValue } });
  } else {
    const c = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { companyId: true } });
    await prisma.officialFormFill.create({ data: { templateId: t.id, caseId, companyId: c.companyId, status: 'DRAFT', values: values as unknown as Prisma.InputJsonValue, createdById: opts.userId } });
  }
  if (!opts.generate) return { saved: true, generated: null };
  const out = await fillForCase(caseId, EMPLOYER_FORM_KEY, { userId: opts.userId });
  return { saved: true, generated: out.fill };
};

/** Data sheet with the given (unsaved) staff values — works without the official PDF. */
export const staffWizardDataSheet = async (caseId: string, raw: unknown) => {
  const c = await caseOr404(caseId);
  const fill = await editableFill(caseId);
  const { values: incoming } = parseEmployerValues(raw);
  const data = deriveData(await loadCaseData(caseId), { ...(fillValuesOf(fill).dataOverrides ?? {}), ...incoming });
  const pdf = await ezbDataSheet(data, `${c.number} · ${data['client.fullName'] ?? ''}`);
  return { pdf, name: `ezb-datenblatt-${c.number}.pdf` };
};
