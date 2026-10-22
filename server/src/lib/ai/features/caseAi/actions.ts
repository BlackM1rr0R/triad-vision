import type { Locale, Prisma } from '@prisma/client';
import { prisma } from '../../../../db.js';
import { badRequest, notFound } from '../../../http.js';
import { notifyUser } from '../../../notifications.js';
import { createCaseMessage } from '../../../messaging/caseMessages.js';
import { activeStaff, activityRow, createNumbered, taskKey } from '../../../tasks/core.js';
import { notifyAssigned } from '../../../tasks/notify.js';
import { APPLY_FIELDS, displayValue, fieldData, normaliseFieldValue } from './fields.js';
import { caseEvent } from './runs.js';
import type { L10n } from './texts.js';

/**
 * The only writes of the case AI features — each one an explicit staff click on a proposal: apply a value to
 * the profile / case, request a document from the client, create a task, ask the client for VIDEX answers.
 * Callers audit them (AI_CASE_*); every one also leaves an internal case timeline entry.
 */

export const applyFieldValue = async (caseId: string, field: string, raw: unknown, actorId: string) => {
  const def = APPLY_FIELDS[field];
  if (!def) throw badRequest('FIELD_NOT_ALLOWED');
  const norm = normaliseFieldValue(field, raw);
  if (!norm.ok) throw badRequest('INVALID_VALUE');
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true, profession: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  let before: string;
  if (def.target === 'case') {
    before = c.profession;
    await prisma.case.update({ where: { id: c.id }, data: { profession: norm.value } });
  } else {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.clientId } });
    before = displayValue((u as unknown as Record<string, unknown>)[field]);
    await prisma.user.update({ where: { id: c.clientId }, data: fieldData(field, norm.value) as Prisma.UserUpdateInput });
  }
  await caseEvent(c.id, 'AI_CASE_VALUE_APPLIED', actorId, `${field}: ${before || '—'} → ${norm.value}`);
  return { field, before, after: norm.value };
};

const REQUEST_TEXT: Record<Locale, { title: string; body: (doc: string) => string; reminder: (doc: string) => string }> = {
  az: { title: 'Sənəd tələb olunur', body: (d) => `Zəhmət olmasa kabinetinizdə bu sənədi yükləyin: ${d}.`, reminder: (d) => `Xatırlatma: zəhmət olmasa bu sənədi yükləyin: ${d}.` },
  de: { title: 'Dokument angefordert', body: (d) => `Bitte laden Sie in Ihrem Kundenbereich folgendes Dokument hoch: ${d}.`, reminder: (d) => `Erinnerung: Bitte laden Sie folgendes Dokument hoch: ${d}.` },
  en: { title: 'Document requested', body: (d) => `Please upload this document in your account: ${d}.`, reminder: (d) => `Reminder: please upload this document: ${d}.` },
  ru: { title: 'Запрошен документ', body: (d) => `Пожалуйста, загрузите в личном кабинете документ: ${d}.`, reminder: (d) => `Напоминание: пожалуйста, загрузите документ: ${d}.` },
};

/**
 * Asks the client for a document: an existing requirement only gets a reminder; otherwise a new requirement
 * (stage INITIAL until the case reached the embassy stage) is created. The client is notified in their language.
 */
export const requestDocument = async (
  caseId: string,
  input: { requirementId?: string; requirementKey?: string; title?: L10n },
  actorId: string,
  /** notify: false — the caller sends one combined notification for several requests (embassy package, next step). */
  opts: { notify?: boolean } = {},
) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, status: true, clientId: true, client: { select: { locale: true } } } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  let requirement = input.requirementId ? await prisma.documentRequirement.findUnique({ where: { id: input.requirementId } }) : null;
  if (input.requirementId && (!requirement || requirement.caseId !== c.id)) throw notFound('REQUIREMENT_NOT_FOUND');
  let created = false;
  if (!requirement && input.requirementKey) requirement = await prisma.documentRequirement.findFirst({ where: { caseId: c.id, key: input.requirementKey } });
  if (!requirement) {
    if (!input.title || !Object.values(input.title).some((s) => s?.trim())) throw badRequest('TITLE_REQUIRED');
    const stage = ['EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'].includes(c.status) ? 'EMBASSY' : 'INITIAL';
    const max = await prisma.documentRequirement.aggregate({ where: { caseId: c.id, stage }, _max: { sortOrder: true } });
    const t = input.title;
    const fb = t.de || t.en || t.az || t.ru;
    requirement = await prisma.documentRequirement.create({
      data: {
        caseId: c.id,
        stage,
        key: input.requirementKey ?? null,
        title: { az: (t.az || fb).slice(0, 200), de: (t.de || fb).slice(0, 200), en: (t.en || fb).slice(0, 200), ru: (t.ru || fb).slice(0, 200) },
        required: true,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    created = true;
  }
  const title = (requirement.title as Record<string, string>)[c.client.locale] || (requirement.title as Record<string, string>).de || '';
  const tx = REQUEST_TEXT[c.client.locale];
  if (opts.notify !== false) await notifyUser(c.clientId, { type: 'DOCUMENT_REQUESTED', title: tx.title, body: created ? tx.body(title) : tx.reminder(title), link: `/account/cases/${c.id}`, caseId: c.id });
  await caseEvent(c.id, 'AI_CASE_DOCUMENT_REQUESTED', actorId, `${created ? 'neu' : 'Erinnerung'}: ${(requirement.title as Record<string, string>).de ?? title}`);
  return { requirement, created };
};

/** Task linked to the case, assigned to the case manager (else the staff member who clicked). */
export const createCaseTask = async (caseId: string, input: { title: string; description: string | null; dueAt?: Date | null }, actor: { id: string; firstName: string; lastName: string }) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, assignedStaffId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const assignees = await activeStaff([c.assignedStaffId ?? actor.id]);
  const task = await createNumbered(async (tx, number) => {
    const min = await tx.task.aggregate({ where: { status: 'TODO' }, _min: { sortOrder: true } });
    const t = await tx.task.create({
      data: {
        number,
        title: input.title.slice(0, 200),
        description: input.description?.slice(0, 8000) ?? null,
        status: 'TODO',
        priority: 'NORMAL',
        dueAt: input.dueAt ?? null,
        sortOrder: min._min.sortOrder === null ? 0 : min._min.sortOrder - 1024,
        caseId: c.id,
        createdById: actor.id,
        assignees: { create: assignees.map((a) => ({ userId: a.id })) },
      },
    });
    await tx.taskComment.create({ data: activityRow(t.id, actor.id, { type: 'created' }) });
    return t;
  });
  await notifyAssigned(task, assignees.map((a) => a.id), actor);
  await caseEvent(c.id, 'AI_CASE_TASK_CREATED', actor.id, `${taskKey(task.number)}: ${task.title}`);
  return { id: task.id, number: task.number, key: taskKey(task.number), title: task.title };
};

const ASK_INTRO: Record<Locale, string> = {
  az: 'Viza ərizəsini (VIDEX) doldurmaq üçün bizə bu məlumatlar lazımdır. Zəhmət olmasa cavab yazın:',
  de: 'Für den Visumantrag (VIDEX) benötigen wir noch folgende Angaben. Bitte antworten Sie uns hier:',
  en: 'To fill in your visa application (VIDEX) we still need the following. Please reply here:',
  ru: 'Для заполнения визовой анкеты (VIDEX) нам нужны следующие данные. Пожалуйста, ответьте здесь:',
};

/** Case message to the client listing the VIDEX answers still missing (client's language). */
export const askClientForFields = async (caseId: string, labels: L10n[], actorId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, client: { select: { locale: true } } } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const l = c.client.locale;
  const body = [ASK_INTRO[l], '', ...labels.map((x) => `• ${x[l] || x.de}`)].join('\n');
  const message = await createCaseMessage({ caseId: c.id, authorId: actorId, body, side: 'staff' });
  await caseEvent(c.id, 'AI_CASE_INFO_REQUESTED', actorId, labels.map((x) => x.de).join(', '));
  return message;
};
