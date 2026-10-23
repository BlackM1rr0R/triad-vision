import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { TARGETS, loadTargetContext } from '../../lib/clientData/targets.js';
import { FIELD_TYPES, fieldsSchema } from '../../lib/clientData/formSchema.js';
import { applyForm, cancelForm, listTemplates, reopenForm, remindForm, sendForm, staffForm, staffFormDto, templateDto } from '../../lib/clientData/forms.js';
import { confirmationState, currentConfirmFields, decideCorrections, latestConfirmation, remindConfirmation, requestConfirmation, SECTIONS, staffConfirmationDto } from '../../lib/clientData/confirmation.js';
import { getGuide, guideKey, guideSaveSchema, listGuides, resetGuide, saveGuide } from '../../lib/clientData/guides.js';

/**
 * Client data (mounted on the admin router — STAFF+, 2FA enforced there):
 *
 *   Smart questionnaires
 *   GET    /case-forms/templates                       templates (built-ins created on first read) + field types
 *   GET    /case-forms/targets                         mapping registry (profile.* / case.* / videx.*)
 *   POST   /case-forms/templates                       ADMIN: { title, description?, fields[], active? }
 *   PUT    /case-forms/templates/:id                   ADMIN
 *   DELETE /case-forms/templates/:id                   ADMIN (built-ins are switched off instead)
 *   GET    /cases/:id/forms                            forms of the case
 *   POST   /cases/:id/forms                            { templateId, note?, dueAt? } send to the client (notified)
 *   GET    /cases/:id/forms/:formId                    answers + diff against the current values
 *   POST   /cases/:id/forms/:formId/apply              { targets?[] } "Apply to profile" (field history)
 *   POST   /cases/:id/forms/:formId/reopen             { note? } back to the client for changes
 *   POST   /cases/:id/forms/:formId/remind
 *   DELETE /cases/:id/forms/:formId                    cancel
 *
 *   Client confirms their data
 *   GET    /cases/:id/data-confirmation                state + latest confirmation + the values that would be asked now
 *   POST   /cases/:id/data-confirmation                ask the client (notified) → { confirmation, requested }
 *   POST   /cases/:id/data-confirmation/:cid/decide    { decisions: [{ key, decision: ACCEPT|REJECT, value? }] }
 *   POST   /cases/:id/data-confirmation/:cid/remind
 *   DELETE /cases/:id/data-confirmation/:cid           cancel
 *
 *   Document guides ("Sənəd bələdçiləri")
 *   GET    /doc-guides                                 every requirement key with its guide (draft built-in or saved)
 *   PUT    /doc-guides/:key                            ADMIN
 *   DELETE /doc-guides/:key                            ADMIN: back to the built-in draft
 */
export const adminClientDataRouter = Router();

const ensureCase = async (id: string) => {
  const c = await prisma.case.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return c;
};

const l10n = (max: number) => z.object({ az: z.string().trim().max(max), de: z.string().trim().max(max), en: z.string().trim().max(max), ru: z.string().trim().max(max) });
const templateBody = z.object({
  title: l10n(200).refine((v) => Object.values(v).some(Boolean), { message: 'TITLE_REQUIRED' }),
  description: l10n(1000).nullable().optional(),
  fields: fieldsSchema,
  active: z.boolean().optional(),
});

// ─── Templates ─────────────────────────────────────────────────────

adminClientDataRouter.get('/case-forms/templates', async (_req, res) => {
  res.json({ templates: await listTemplates(), fieldTypes: FIELD_TYPES });
});

adminClientDataRouter.get('/case-forms/targets', (_req, res) => {
  res.json({ targets: TARGETS.map((t) => ({ target: t.target, entity: t.entity, kind: t.kind, label: t.label })) });
});

adminClientDataRouter.post('/case-forms/templates', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(templateBody, req.body ?? {});
  const max = await prisma.caseFormTemplate.aggregate({ _max: { sortOrder: true } });
  const t = await prisma.caseFormTemplate.create({
    data: {
      title: body.title,
      description: body.description ?? undefined,
      fields: body.fields as unknown as Prisma.InputJsonValue,
      active: body.active ?? true,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      createdById: req.user!.id,
    },
  });
  await audit(req, 'CASE_FORM_TEMPLATE_CREATED', t.id, { fields: body.fields.length });
  res.status(201).json({ template: templateDto(t) });
});

adminClientDataRouter.put('/case-forms/templates/:id', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(templateBody.partial(), req.body ?? {});
  const existing = await prisma.caseFormTemplate.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound('TEMPLATE_NOT_FOUND');
  const t = await prisma.caseFormTemplate.update({
    where: { id: existing.id },
    data: {
      ...(body.title ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description ?? undefined } : {}),
      ...(body.fields ? { fields: body.fields as unknown as Prisma.InputJsonValue } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
  });
  await audit(req, 'CASE_FORM_TEMPLATE_UPDATED', t.id, { changed: Object.keys(body) });
  res.json({ template: templateDto(t) });
});

adminClientDataRouter.delete('/case-forms/templates/:id', requireMinRole('ADMIN'), async (req, res) => {
  const existing = await prisma.caseFormTemplate.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound('TEMPLATE_NOT_FOUND');
  if (existing.builtIn) {
    await prisma.caseFormTemplate.update({ where: { id: existing.id }, data: { active: false } });
  } else {
    await prisma.caseFormTemplate.delete({ where: { id: existing.id } });
  }
  await audit(req, 'CASE_FORM_TEMPLATE_DELETED', existing.id, { builtIn: existing.builtIn });
  res.json({ ok: true, deactivated: existing.builtIn });
});

// ─── Forms of a case ───────────────────────────────────────────────

adminClientDataRouter.get('/cases/:id/forms', async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const [forms, templates] = await Promise.all([prisma.caseForm.findMany({ where: { caseId: c.id }, orderBy: { sentAt: 'desc' } }), listTemplates({ activeOnly: true })]);
  res.json({ forms: await Promise.all(forms.map((f) => staffFormDto(f))), templates: templates.map((t) => ({ id: t.id, key: t.key, title: t.title, description: t.description, fields: t.fields.length })) });
});

adminClientDataRouter.post('/cases/:id/forms', async (req, res) => {
  const body = parse(z.object({ templateId: z.string().trim().min(1).max(40), note: z.string().trim().max(1000).nullable().optional(), dueAt: z.coerce.date().nullable().optional() }), req.body ?? {});
  const c = await ensureCase(String(req.params.id));
  const form = await sendForm(c.id, body, req.user!.id);
  await audit(req, 'CASE_FORM_SENT', c.id, { formId: form.id, templateId: body.templateId });
  res.status(201).json({ form: await staffFormDto(form) });
});

adminClientDataRouter.get('/cases/:id/forms/:formId', async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const form = await staffForm(c.id, String(req.params.formId));
  res.json({ form: await staffFormDto(form, await loadTargetContext(c.id)) });
});

adminClientDataRouter.post('/cases/:id/forms/:formId/apply', async (req, res) => {
  const body = parse(z.object({ targets: z.array(z.string().max(60)).max(80).optional() }), req.body ?? {});
  const c = await ensureCase(String(req.params.id));
  const form = await staffForm(c.id, String(req.params.formId));
  const out = await applyForm(form, body.targets, req.user!.id);
  // Only target names in the audit (the values are in the field history, sealed where sensitive).
  await audit(req, 'CASE_FORM_APPLIED', c.id, { formId: form.id, targets: out.applied.map((a) => a.target) });
  res.json({ form: await staffFormDto(out.form, out.ctx), applied: out.applied });
});

adminClientDataRouter.post('/cases/:id/forms/:formId/reopen', async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().max(1000).nullable().optional() }), req.body ?? {});
  const c = await ensureCase(String(req.params.id));
  const form = await reopenForm(await staffForm(c.id, String(req.params.formId)), body.note ?? null, req.user!.id);
  await audit(req, 'CASE_FORM_REOPENED', c.id, { formId: form.id });
  res.json({ form: await staffFormDto(form) });
});

adminClientDataRouter.post('/cases/:id/forms/:formId/remind', async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const form = await remindForm(await staffForm(c.id, String(req.params.formId)));
  await audit(req, 'CASE_FORM_REMINDED', c.id, { formId: form.id });
  res.json({ form: await staffFormDto(form) });
});

adminClientDataRouter.delete('/cases/:id/forms/:formId', async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const form = await cancelForm(await staffForm(c.id, String(req.params.formId)), req.user!.id);
  await audit(req, 'CASE_FORM_CANCELLED', c.id, { formId: form.id });
  res.json({ form: await staffFormDto(form) });
});

// ─── Data confirmation ─────────────────────────────────────────────

const confirmationView = async (caseId: string) => {
  const [state, conf] = await Promise.all([confirmationState(caseId), latestConfirmation(caseId)]);
  return { state, confirmation: conf ? await staffConfirmationDto(conf) : null, sections: SECTIONS };
};

adminClientDataRouter.get('/cases/:id/data-confirmation', async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const view = await confirmationView(c.id);
  // The values that a new request would show the client (preview before asking).
  const preview = req.query.preview === '1' ? await currentConfirmFields(c.id) : undefined;
  res.json({ ...view, ...(preview ? { preview } : {}) });
});

adminClientDataRouter.post('/cases/:id/data-confirmation', async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const conf = await requestConfirmation(c.id, req.user!.id);
  await audit(req, 'DATA_CONFIRM_REQUESTED', c.id, { confirmationId: conf.id });
  res.status(201).json({ ...(await confirmationView(c.id)), requested: [conf.id] });
});

const confOf = async (req: Request) => {
  const c = await ensureCase(String(req.params.id));
  const conf = await prisma.dataConfirmation.findUnique({ where: { id: String(req.params.cid) } });
  if (!conf || conf.caseId !== c.id) throw notFound('CONFIRMATION_NOT_FOUND');
  return { c, conf };
};

adminClientDataRouter.post('/cases/:id/data-confirmation/:cid/decide', async (req, res) => {
  const body = parse(
    z.object({ decisions: z.array(z.object({ key: z.string().trim().min(1).max(40), decision: z.enum(['ACCEPT', 'REJECT']), value: z.string().trim().min(1).max(300).optional() })).min(1).max(40) }),
    req.body ?? {},
  );
  const { c, conf } = await confOf(req);
  if (new Set(body.decisions.map((d) => d.key)).size !== body.decisions.length) throw badRequest('DUPLICATE_KEY');
  await decideCorrections(conf, body.decisions, req.user!.id);
  await audit(req, 'DATA_CONFIRM_REVIEWED', c.id, { confirmationId: conf.id, decisions: body.decisions.map((d) => `${d.key}:${d.decision}`) });
  res.json(await confirmationView(c.id));
});

adminClientDataRouter.post('/cases/:id/data-confirmation/:cid/remind', async (req, res) => {
  const { c, conf } = await confOf(req);
  await remindConfirmation(conf);
  await audit(req, 'DATA_CONFIRM_REMINDED', c.id, { confirmationId: conf.id });
  res.json(await confirmationView(c.id));
});

adminClientDataRouter.delete('/cases/:id/data-confirmation/:cid', async (req, res) => {
  const { c, conf } = await confOf(req);
  if (conf.status === 'CONFIRMED') throw conflict('ALREADY_CONFIRMED');
  await prisma.dataConfirmation.update({ where: { id: conf.id }, data: { status: 'CANCELLED' } });
  await audit(req, 'DATA_CONFIRM_CANCELLED', c.id, { confirmationId: conf.id });
  res.json(await confirmationView(c.id));
});

// ─── Document guides ───────────────────────────────────────────────

adminClientDataRouter.get('/doc-guides', async (_req, res) => {
  res.json({ guides: await listGuides() });
});

adminClientDataRouter.put('/doc-guides/:key', requireMinRole('ADMIN'), async (req, res) => {
  const key = parse(guideKey, String(req.params.key));
  const body = parse(guideSaveSchema, req.body ?? {});
  const guide = await saveGuide(key, body, req.user!.id);
  await audit(req, 'DOC_GUIDE_SAVED', key, { verified: body.verified, published: body.published, sampleImage: !!body.sampleImage });
  res.json({ guide });
});

adminClientDataRouter.delete('/doc-guides/:key', requireMinRole('ADMIN'), async (req, res) => {
  const key = parse(guideKey, String(req.params.key));
  const before = await getGuide(key);
  if (!before) throw notFound('GUIDE_NOT_FOUND');
  const guide = await resetGuide(key);
  await audit(req, 'DOC_GUIDE_RESET', key, {});
  res.json({ guide });
});
