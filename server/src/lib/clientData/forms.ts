import type { CaseForm, CaseFormTemplate, Locale, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { caseEvent } from '../ai/features/caseAi/runs.js';
import type { L10n } from '../ai/features/caseAi/texts.js';
import { BUILT_IN_FORMS } from './builtInForms.js';
import { cleanAnswers, missingRequired, valueForTarget, type FormField } from './formSchema.js';
import { currentValue, loadTargetContext, writeTargets, type TargetContext } from './targets.js';
import { FORM_REMINDER, FORM_REOPENED, FORM_SENT, STAFF_FORM_SUBMITTED } from './texts.js';

/**
 * Case forms: a questionnaire template sent to the client of one case (fields copied at send time, so a later
 * template change never alters a form the client is filling). Client: save draft / submit. Staff: review the
 * answers next to the current profile values and "apply" the mapped ones (diff first, writes through
 * lib/clientData/targets.ts → field history), send it back for changes, remind, cancel.
 */

export const OPEN_FORM = ['SENT', 'DRAFT'] as const;

const fb = (t: L10n, l: Locale) => t[l] || t.de || t.az || t.en || t.ru || '';
const asFields = (v: unknown) => (Array.isArray(v) ? (v as FormField[]) : []);
const asAnswers = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

// ─── Templates ─────────────────────────────────────────────────────

/** Creates the built-in templates that do not exist yet (idempotent; one small query when they all exist). */
export const ensureBuiltInTemplates = async () => {
  const have = new Set((await prisma.caseFormTemplate.findMany({ where: { key: { not: null } }, select: { key: true } })).map((t) => t.key));
  for (const [i, b] of BUILT_IN_FORMS.entries()) {
    if (have.has(b.key)) continue;
    try {
      await prisma.caseFormTemplate.create({ data: { key: b.key, title: b.title, description: b.description, fields: b.fields as unknown as Prisma.InputJsonValue, builtIn: true, sortOrder: i } });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }
};

export const templateDto = (t: CaseFormTemplate) => ({
  id: t.id,
  key: t.key,
  title: t.title as L10n,
  description: (t.description as L10n | null) ?? null,
  fields: asFields(t.fields),
  active: t.active,
  builtIn: t.builtIn,
  sortOrder: t.sortOrder,
  updatedAt: t.updatedAt,
});

export const listTemplates = async (opts: { activeOnly?: boolean } = {}) => {
  await ensureBuiltInTemplates();
  const rows = await prisma.caseFormTemplate.findMany({ where: opts.activeOnly ? { active: true } : {}, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return rows.map(templateDto);
};

// ─── Sending / client side ─────────────────────────────────────────

const caseOf = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, clientId: true, assignedStaffId: true, client: { select: { locale: true } } } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return c;
};

export const sendForm = async (caseId: string, input: { templateId: string; note?: string | null; dueAt?: Date | null }, actorId: string) => {
  const c = await caseOf(caseId);
  const t = await prisma.caseFormTemplate.findUnique({ where: { id: input.templateId } });
  if (!t || !t.active) throw notFound('TEMPLATE_NOT_FOUND');
  const open = await prisma.caseForm.findFirst({ where: { caseId: c.id, templateId: t.id, status: { in: [...OPEN_FORM] } } });
  if (open) throw conflict('FORM_ALREADY_OPEN');
  const form = await prisma.caseForm.create({
    data: { caseId: c.id, templateId: t.id, title: t.title as Prisma.InputJsonValue, fields: t.fields as Prisma.InputJsonValue, note: input.note?.trim() || null, dueAt: input.dueAt ?? null, sentById: actorId },
  });
  const title = fb(t.title as L10n, c.client.locale);
  await notifyUser(c.clientId, { type: 'CASE_FORM_SENT', ...FORM_SENT[c.client.locale](title), link: `/account/cases/${c.id}/forms/${form.id}`, caseId: c.id });
  await caseEvent(c.id, 'CASE_FORM_SENT', actorId, (t.title as L10n).de || title);
  return form;
};

/** The client's documents of the case that a file answer may reference. */
const ownDocIds = async (caseId: string, clientId: string, ids: string[]) => {
  if (!ids.length) return new Set<string>();
  const docs = await prisma.document.findMany({ where: { id: { in: ids }, caseId, uploadedById: clientId }, select: { id: true } });
  return new Set(docs.map((d) => d.id));
};

const keepOwnFiles = async (form: CaseForm, clientId: string, answers: Record<string, unknown>) => {
  const fileFields = asFields(form.fields).filter((f) => f.type === 'file');
  if (!fileFields.length) return answers;
  const ids = fileFields.flatMap((f) => (Array.isArray(answers[f.key]) ? (answers[f.key] as string[]) : []));
  const ok = await ownDocIds(form.caseId, clientId, ids);
  for (const f of fileFields) {
    if (!Array.isArray(answers[f.key])) continue;
    const kept = (answers[f.key] as string[]).filter((id) => ok.has(id));
    if (kept.length) answers[f.key] = kept;
    else delete answers[f.key];
  }
  return answers;
};

export const clientForm = async (caseId: string, formId: string) => {
  const form = await prisma.caseForm.findUnique({ where: { id: formId } });
  if (!form || form.caseId !== caseId || form.status === 'CANCELLED') throw notFound('FORM_NOT_FOUND');
  return form;
};

export const saveDraft = async (form: CaseForm, clientId: string, raw: unknown) => {
  if (!(OPEN_FORM as readonly string[]).includes(form.status)) throw conflict('FORM_NOT_EDITABLE');
  const answers = await keepOwnFiles(form, clientId, cleanAnswers(asFields(form.fields), raw));
  return prisma.caseForm.update({ where: { id: form.id }, data: { answers: answers as Prisma.InputJsonValue, status: 'DRAFT', draftAt: new Date() } });
};

export const submitForm = async (form: CaseForm, clientId: string, raw: unknown, ip: string | null) => {
  if (!(OPEN_FORM as readonly string[]).includes(form.status)) throw conflict('FORM_NOT_EDITABLE');
  const fields = asFields(form.fields);
  const answers = await keepOwnFiles(form, clientId, cleanAnswers(fields, raw));
  const missing = missingRequired(fields, answers);
  if (missing.length) return { ok: false as const, missing };
  const updated = await prisma.caseForm.update({
    where: { id: form.id },
    data: { answers: answers as Prisma.InputJsonValue, status: 'SUBMITTED', submittedAt: new Date(), submitIp: ip?.slice(0, 64) ?? null },
  });
  const c = await caseOf(form.caseId);
  const title = (form.title as L10n).de || fb(form.title as L10n, 'az');
  await caseEvent(c.id, 'CASE_FORM_SUBMITTED', clientId, title);
  const staffId = c.assignedStaffId ?? form.sentById;
  if (staffId) await notifyUser(staffId, { type: 'CASE_FORM_SUBMITTED', ...STAFF_FORM_SUBMITTED(title, c.number), link: `/admin/cases/${c.id}#case-forms`, caseId: c.id });
  return { ok: true as const, form: updated };
};

/** Form for the client: no staff-only data (who sent it, applied diff, IP). */
export const clientFormDto = (f: CaseForm) => ({
  id: f.id,
  title: f.title as L10n,
  fields: asFields(f.fields),
  answers: asAnswers(f.answers),
  status: f.status,
  note: f.note,
  sentAt: f.sentAt,
  draftAt: f.draftAt,
  submittedAt: f.submittedAt,
  dueAt: f.dueAt,
  editable: (OPEN_FORM as readonly string[]).includes(f.status),
});

// ─── Staff review / apply ──────────────────────────────────────────

export interface DiffRow {
  fieldKey: string;
  target: string;
  /** Leaf name (column / VIDEX key) — lets the response masking recognise sensitive values. */
  field: string;
  label: L10n;
  targetLabel: L10n;
  before: { field: string; value: string };
  after: { field: string; value: string };
  changed: boolean;
}

export const formDiff = (form: CaseForm, ctx: TargetContext): DiffRow[] => {
  const answers = asAnswers(form.answers);
  const rows: DiffRow[] = [];
  for (const f of asFields(form.fields)) {
    if (!f.target) continue;
    const v = valueForTarget(f, answers);
    if (!v || (ctx.familyMember && v.def.entity === 'profile')) continue;
    const before = currentValue(ctx, v.def);
    rows.push({ fieldKey: f.key, target: v.def.target, field: v.def.field, label: f.label, targetLabel: v.def.label, before: { field: v.def.field, value: before }, after: { field: v.def.field, value: v.value }, changed: before !== v.value });
  }
  return rows;
};

const fileNames = async (form: CaseForm) => {
  const answers = asAnswers(form.answers);
  const ids = asFields(form.fields)
    .filter((f) => f.type === 'file')
    .flatMap((f) => (Array.isArray(answers[f.key]) ? (answers[f.key] as string[]) : []));
  if (!ids.length) return {};
  const docs = await prisma.document.findMany({ where: { id: { in: ids }, caseId: form.caseId }, select: { id: true, originalName: true, mimeType: true } });
  return Object.fromEntries(docs.map((d) => [d.id, { name: d.originalName, mimeType: d.mimeType }]));
};

export const staffFormDto = async (f: CaseForm, ctx?: TargetContext) => ({
  ...clientFormDto(f),
  templateId: f.templateId,
  sentById: f.sentById,
  appliedAt: f.appliedAt,
  appliedById: f.appliedById,
  applied: (f.applied as unknown[] | null) ?? null,
  remindedAt: f.remindedAt,
  reminders: f.reminders,
  submitIp: f.submitIp,
  files: await fileNames(f),
  diff: ctx && (f.status === 'SUBMITTED' || f.status === 'APPLIED') ? formDiff(f, ctx) : [],
});

export const staffForm = async (caseId: string, formId: string) => {
  const form = await prisma.caseForm.findUnique({ where: { id: formId } });
  if (!form || form.caseId !== caseId) throw notFound('FORM_NOT_FOUND');
  return form;
};

export const applyForm = async (form: CaseForm, targets: string[] | undefined, actorId: string) => {
  if (form.status !== 'SUBMITTED' && form.status !== 'APPLIED') throw conflict('FORM_NOT_SUBMITTED');
  const ctx = await loadTargetContext(form.caseId);
  const diff = formDiff(form, ctx).filter((d) => d.changed && (!targets || targets.includes(d.target)));
  if (targets && targets.some((t) => !formDiff(form, ctx).some((d) => d.target === t))) throw badRequest('UNKNOWN_TARGET');
  const answers = asAnswers(form.answers);
  const writes = asFields(form.fields)
    .map((f) => valueForTarget(f, answers))
    .filter((w): w is NonNullable<typeof w> => !!w && diff.some((d) => d.target === w.def.target));
  await writeTargets(ctx, writes, { actorId, source: 'form', sourceId: form.id });
  const applied = diff.map((d) => ({ target: d.target, field: d.field, before: d.before, after: d.after }));
  const prev = (form.applied as unknown[] | null) ?? [];
  const updated = await prisma.caseForm.update({
    where: { id: form.id },
    data: { status: 'APPLIED', appliedAt: new Date(), appliedById: actorId, applied: [...prev, ...applied].slice(-200) as unknown as Prisma.InputJsonValue },
  });
  if (applied.length) await caseEvent(form.caseId, 'CASE_FORM_APPLIED', actorId, `${(form.title as L10n).de}: ${applied.map((a) => a.target).join(', ')}`.slice(0, 1900));
  return { form: updated, applied, ctx };
};

export const reopenForm = async (form: CaseForm, note: string | null, actorId: string) => {
  if (form.status !== 'SUBMITTED' && form.status !== 'APPLIED') throw conflict('FORM_NOT_SUBMITTED');
  const c = await caseOf(form.caseId);
  const updated = await prisma.caseForm.update({ where: { id: form.id }, data: { status: 'DRAFT', note: note?.trim() || form.note } });
  await notifyUser(c.clientId, { type: 'CASE_FORM_REOPENED', ...FORM_REOPENED[c.client.locale](fb(form.title as L10n, c.client.locale)), link: `/account/cases/${c.id}/forms/${form.id}`, caseId: c.id });
  await caseEvent(c.id, 'CASE_FORM_REOPENED', actorId, (form.title as L10n).de);
  return updated;
};

export const remindForm = async (form: CaseForm) => {
  if (!(OPEN_FORM as readonly string[]).includes(form.status)) throw conflict('FORM_NOT_OPEN');
  const c = await caseOf(form.caseId);
  await notifyUser(c.clientId, { type: 'CASE_FORM_REMINDER', ...FORM_REMINDER[c.client.locale](fb(form.title as L10n, c.client.locale)), link: `/account/cases/${c.id}/forms/${form.id}`, caseId: c.id });
  return prisma.caseForm.update({ where: { id: form.id }, data: { remindedAt: new Date(), reminders: { increment: 1 } } });
};

export const cancelForm = async (form: CaseForm, actorId: string) => {
  if (form.status === 'CANCELLED') return form;
  const updated = await prisma.caseForm.update({ where: { id: form.id }, data: { status: 'CANCELLED' } });
  await caseEvent(form.caseId, 'CASE_FORM_CANCELLED', actorId, (form.title as L10n).de);
  return updated;
};
