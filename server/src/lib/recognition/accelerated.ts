import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AcceleratedProcedure, Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { renderEmail, sendMail, type MailAttachment } from '../mailer.js';
import { notifyUser } from '../notifications.js';
import { invalidateMyWork } from '../myWork.js';
import { formatDay } from '../growthTexts.js';
import { contractValues, loadContractCase, triadParty } from '../contracts/values.js';
import { renderContract } from '../contracts/render.js';
import { renderContractPdf } from '../contracts/pdf.js';
import { createRequest, sendRequest, readStored } from '../esign/service.js';
import { copyDocumentToDrive } from '../drive/caseFolders.js';
import {
  ACCEL_CHANNELS,
  ACCEL_FEE_CENTS,
  ACCEL_FINAL,
  ACCEL_PATH,
  ACCEL_STATUSES,
  accelDeadlines,
  advanceTo,
  appointmentDeadlineFrom,
  decisionDeadlineFrom,
  employerTodos,
  pathIndex,
  type AccelStatus,
} from './rules.js';
import { DAY, atNoon, fullName, linkableDocuments, readDocument, storeCaseDocument } from './common.js';
import { recognitionTexts, submissionMail, VOLLMACHT_TEMPLATE, VOLLMACHT_TITLE } from './texts.js';

/**
 * Beschleunigtes Fachkräfteverfahren (§ 81a AufenthG), one per case: the employer (authorised by the worker
 * with a Vollmacht) concludes an agreement with the Ausländerbehörde, which obtains the approvals and issues
 * the Vorabzustimmung; the embassy then offers an appointment (usually within 3 weeks) and decides (usually
 * within 3 weeks of the complete application). Staff drive it with a guided stepper; every letter / e-mail
 * is logged as an AcceleratedMessage. Deadlines: lib/recognition/deadlines.ts.
 */

const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').refine((s) => !Number.isNaN(Date.parse(`${s}T12:00:00Z`)), 'INVALID_DATE');
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

export const startInput = z.object({
  authority: optText(200),
  authorityEmail: z.string().trim().toLowerCase().email().max(190).nullable().optional().or(z.literal('').transform(() => null)),
  reference: optText(120),
  note: optText(5000),
});

export const updateInput = startInput.extend({
  feeCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  appointmentDeadline: day.nullable().optional(),
  decisionDeadline: day.nullable().optional(),
});

/** Guided steps: each one records its date and moves the status forward (never backwards). */
export const stepInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('POWER_OF_ATTORNEY'), date: day.optional(), documentId: z.string().max(40).optional() }),
  z.object({ action: z.literal('AGREEMENT'), date: day.optional(), documentId: z.string().max(40).optional() }),
  z.object({ action: z.literal('SUBMITTED'), date: day.optional() }),
  z.object({ action: z.literal('FEE_REQUESTED'), date: day.optional(), feeCents: z.number().int().min(0).max(1_000_000).optional() }),
  z.object({ action: z.literal('FEE_PAID'), date: day.optional() }),
  z.object({ action: z.literal('IN_REVIEW'), date: day.optional() }),
  z.object({ action: z.literal('PRE_APPROVAL'), date: day.optional(), documentId: z.string().max(40).optional() }),
  z.object({ action: z.literal('EMBASSY_NOTIFIED'), date: day.optional(), note: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal('APPOINTMENT'), appointmentAt: z.coerce.date() }),
  z.object({ action: z.literal('DECIDED'), date: day.optional(), outcome: z.enum(['VISA_DECIDED', 'REJECTED']) }),
  z.object({ action: z.literal('CANCEL'), reason: z.string().trim().min(3).max(2000) }),
]);
export type StepInput = z.infer<typeof stepInput>;

export const messageInput = z.object({
  direction: z.enum(['IN', 'OUT']),
  channel: z.enum(ACCEL_CHANNELS),
  subject: optText(300),
  body: optText(20000),
  documentId: z.string().trim().max(40).nullable().optional(),
  dueAt: day.nullable().optional(),
  at: day.optional(),
});

export const mailInput = z.object({
  to: z.string().trim().toLowerCase().email().max(190),
  subject: z.string().trim().min(3).max(300),
  body: z.string().trim().min(10).max(20000),
  documentIds: z.array(z.string().trim().max(40)).max(20).default([]),
});

export const UPLOAD_KINDS = ['POWER_OF_ATTORNEY', 'AGREEMENT', 'PRE_APPROVAL', 'LETTER_IN', 'LETTER_OUT'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];
/** Attachments of one submission e-mail, in total. */
export const MAX_MAIL_BYTES = 18 * 1024 * 1024;

// ─── Reads ────────────────────────────────────────────────────────────

export const loadProcedure = async (id: string) => {
  const p = await prisma.acceleratedProcedure.findUnique({ where: { id } });
  if (!p) throw notFound('ACCELERATED_NOT_FOUND');
  return p;
};

const openReplyDue = async (procedureId: string) => {
  const m = await prisma.acceleratedMessage.findFirst({ where: { procedureId, direction: 'IN', dueAt: { not: null } }, orderBy: { at: 'desc' }, select: { dueAt: true, at: true } });
  // Answered when an outgoing message followed the latest incoming one with a due date.
  if (!m?.dueAt) return null;
  const answered = await prisma.acceleratedMessage.count({ where: { procedureId, direction: 'OUT', at: { gt: m.at } } });
  return answered ? null : m.dueAt;
};

/** The guided stepper: per step its date and whether it is done / current. */
export const stepsOf = (p: AcceleratedProcedure) => {
  const at: Record<string, Date | null> = {
    PREPARING: p.createdAt,
    POWER_OF_ATTORNEY: p.powerOfAttorneyAt,
    AGREEMENT_SIGNED: p.agreementSignedAt,
    SUBMITTED: p.submittedAt,
    FEE_REQUESTED: p.feeRequestedAt,
    FEE_PAID: p.feePaidAt,
    IN_REVIEW: null,
    PRE_APPROVAL: p.preApprovalAt,
    SENT_TO_EMBASSY: p.embassyNotifiedAt,
    APPOINTMENT_BOOKED: p.appointmentAt,
    VISA_DECIDED: p.decidedAt,
  };
  const cur = pathIndex(p.status);
  return ACCEL_PATH.map((s, i) => ({ status: s, at: at[s] ?? null, done: cur >= 0 ? i <= cur : !!at[s], current: i === cur }));
};

/** Admin case card. */
export const caseAccelerated = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, companyId: true, company: { select: { id: true, name: true, email: true } } } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  let p = await prisma.acceleratedProcedure.findUnique({ where: { caseId } });
  if (p) p = await syncPowerOfAttorney(p);
  const [messages, documents, signature] = await Promise.all([
    p ? prisma.acceleratedMessage.findMany({ where: { procedureId: p.id }, orderBy: [{ at: 'desc' }, { id: 'desc' }], take: 300 }) : [],
    linkableDocuments(caseId),
    p ? vollmachtRequest(caseId) : null,
  ]);
  const actorIds = [...new Set(messages.map((m) => m.actorId).filter((x): x is string => !!x))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const actorOf = new Map(actors.map((a) => [a.id, fullName(a)]));
  const replyDue = p ? await openReplyDue(p.id) : null;
  return {
    case: { id: c.id, number: c.number },
    company: c.company,
    canStart: !!c.companyId,
    procedure: p
      ? {
          ...p,
          steps: stepsOf(p),
          final: (ACCEL_FINAL as readonly string[]).includes(p.status),
          deadlines: accelDeadlines(p, replyDue),
          employerTodos: employerTodos(p),
          vollmacht: signature ? { id: signature.id, status: signature.status, sentAt: signature.sentAt, completedAt: signature.completedAt } : null,
        }
      : null,
    messages: messages.map((m) => ({ ...m, actor: m.actorId ? (actorOf.get(m.actorId) ?? null) : null })),
    documents: documents.map((d) => ({ id: d.id, name: d.originalName, stage: d.stage, status: d.status, requirementKey: d.requirement?.key ?? null, size: d.size, createdAt: d.createdAt })),
    defaults: { feeCents: ACCEL_FEE_CENTS },
  };
};

// ─── Notifications ────────────────────────────────────────────────────

const companyUsers = (companyId: string | null) =>
  companyId ? prisma.user.findMany({ where: { companyId, role: 'COMPANY', isActive: true }, select: { id: true, locale: true } }) : Promise.resolve([]);

const notifyEmployer = async (p: AcceleratedProcedure, kind: 'AGREEMENT' | 'FEE' | 'PRE_APPROVAL') => {
  const c = await prisma.case.findUnique({ where: { id: p.caseId }, select: { number: true, client: { select: { firstName: true, lastName: true } } } });
  if (!c) return;
  for (const u of await companyUsers(p.companyId)) {
    const t = recognitionTexts(u.locale);
    const params = { worker: fullName(c.client), number: c.number, fee: p.feeCents != null ? `${(p.feeCents / 100).toFixed(2).replace('.', u.locale === 'en' ? '.' : ',')} €` : undefined };
    const title = kind === 'AGREEMENT' ? t.employerAgreementTitle(params) : kind === 'FEE' ? t.employerFeeTitle(params) : t.employerPreApprovalTitle(params);
    const body = kind === 'AGREEMENT' ? t.employerAgreementBody(params) : kind === 'FEE' ? t.employerFeeBody(params) : t.employerPreApprovalBody(params);
    await notifyUser(u.id, { type: 'ACCELERATED_PROCEDURE', title, body, link: `/company/workers?worker=${p.caseId}`, ctaLabel: t.employerCta }).catch(() => undefined);
  }
};

const notifyClientPreApproval = async (p: AcceleratedProcedure) => {
  const c = await prisma.case.findUnique({ where: { id: p.caseId }, select: { client: { select: { id: true, firstName: true, locale: true, isActive: true } } } });
  if (!c?.client.isActive || !p.appointmentDeadline) return;
  const t = recognitionTexts(c.client.locale);
  await notifyUser(c.client.id, {
    type: 'ACCELERATED_PRE_APPROVAL',
    title: t.clientPreApprovalTitle,
    body: t.clientPreApprovalBody({ firstName: c.client.firstName, date: formatDay(p.appointmentDeadline, c.client.locale) }),
    link: `/account/cases/${p.caseId}`,
    caseId: p.caseId,
    ctaLabel: t.clientCta,
  }).catch(() => undefined);
};

// ─── Writes ───────────────────────────────────────────────────────────

export const startProcedure = async (caseId: string, input: z.infer<typeof startInput>, actorId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, companyId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (!c.companyId) throw badRequest('COMPANY_REQUIRED');
  if (await prisma.acceleratedProcedure.count({ where: { caseId } })) throw conflict('ACCELERATED_EXISTS');
  let p: AcceleratedProcedure;
  try {
    p = await prisma.acceleratedProcedure.create({
      data: { caseId, companyId: c.companyId, authority: input.authority || null, authorityEmail: input.authorityEmail || null, reference: input.reference || null, note: input.note || null, feeCents: ACCEL_FEE_CENTS, createdById: actorId },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('ACCELERATED_EXISTS');
    throw err;
  }
  await prisma.caseEvent.create({ data: { caseId, type: 'ACCELERATED_STARTED', note: input.authority ?? null, actorId, visibleToClient: false } });
  await notifyEmployer(p, 'AGREEMENT');
  invalidateMyWork();
  return p;
};

export const updateProcedure = async (id: string, input: z.infer<typeof updateInput>) => {
  const p = await loadProcedure(id);
  const data: Prisma.AcceleratedProcedureUncheckedUpdateInput = {};
  if (input.authority !== undefined) data.authority = input.authority || null;
  if (input.authorityEmail !== undefined) data.authorityEmail = input.authorityEmail || null;
  if (input.reference !== undefined) data.reference = input.reference || null;
  if (input.note !== undefined) data.note = input.note || null;
  if (input.feeCents !== undefined) data.feeCents = input.feeCents;
  if (input.appointmentDeadline !== undefined) data.appointmentDeadline = input.appointmentDeadline ? atNoon(input.appointmentDeadline) : null;
  if (input.decisionDeadline !== undefined) data.decisionDeadline = input.decisionDeadline ? atNoon(input.decisionDeadline) : null;
  const updated = await prisma.acceleratedProcedure.update({ where: { id: p.id }, data });
  invalidateMyWork();
  return updated;
};

const checkDoc = async (caseId: string, documentId: string | undefined | null) => {
  if (documentId && !(await prisma.document.count({ where: { id: documentId, caseId } }))) throw badRequest('DOCUMENT_NOT_IN_CASE');
};

/** One guided step. Returns the updated procedure. */
export const applyStep = async (id: string, input: StepInput, actorId: string) => {
  const p = await loadProcedure(id);
  if ((ACCEL_FINAL as readonly string[]).includes(p.status)) throw conflict('ACCELERATED_CLOSED');
  const when = 'date' in input && input.date ? atNoon(input.date) : new Date();
  const data: Prisma.AcceleratedProcedureUncheckedUpdateInput = {};
  let target: AccelStatus = p.status as AccelStatus;
  let log: { subject: string; body?: string | null; documentId?: string | null; direction: 'IN' | 'OUT'; channel: 'EMAIL' | 'LETTER' | 'PORTAL' } | null = null;
  switch (input.action) {
    case 'POWER_OF_ATTORNEY':
      await checkDoc(p.caseId, input.documentId);
      data.powerOfAttorneyAt = when;
      target = 'POWER_OF_ATTORNEY';
      break;
    case 'AGREEMENT':
      await checkDoc(p.caseId, input.documentId);
      data.agreementSignedAt = when;
      target = 'AGREEMENT_SIGNED';
      break;
    case 'SUBMITTED':
      data.submittedAt = when;
      target = 'SUBMITTED';
      break;
    case 'FEE_REQUESTED':
      data.feeRequestedAt = when;
      if (input.feeCents !== undefined) data.feeCents = input.feeCents;
      target = 'FEE_REQUESTED';
      break;
    case 'FEE_PAID':
      data.feePaidAt = when;
      if (!p.feeRequestedAt) data.feeRequestedAt = when;
      target = 'FEE_PAID';
      break;
    case 'IN_REVIEW':
      target = 'IN_REVIEW';
      break;
    case 'PRE_APPROVAL':
      await checkDoc(p.caseId, input.documentId);
      data.preApprovalAt = when;
      if (input.documentId) data.preApprovalDocId = input.documentId;
      data.appointmentDeadline = appointmentDeadlineFrom(when);
      target = 'PRE_APPROVAL';
      log = { subject: 'Vorabzustimmung', direction: 'IN', channel: 'LETTER', documentId: input.documentId ?? p.preApprovalDocId };
      break;
    case 'EMBASSY_NOTIFIED':
      if (!p.preApprovalAt) throw conflict('PRE_APPROVAL_REQUIRED');
      data.embassyNotifiedAt = when;
      target = 'SENT_TO_EMBASSY';
      log = { subject: 'Botschaft informiert (Vorabzustimmung)', body: input.note || null, direction: 'OUT', channel: 'EMAIL', documentId: p.preApprovalDocId };
      break;
    case 'APPOINTMENT':
      data.appointmentAt = input.appointmentAt;
      data.decisionDeadline = decisionDeadlineFrom(input.appointmentAt);
      target = 'APPOINTMENT_BOOKED';
      break;
    case 'DECIDED':
      data.decidedAt = when;
      target = input.outcome;
      break;
    case 'CANCEL':
      target = 'CANCELLED';
      data.note = [p.note, `Abgebrochen: ${input.reason}`].filter(Boolean).join('\n').slice(0, 60000);
      break;
  }
  data.status = advanceTo(p.status, target);
  const updated = await prisma.acceleratedProcedure.update({ where: { id: p.id }, data });
  if (log) await prisma.acceleratedMessage.create({ data: { procedureId: p.id, direction: log.direction, channel: log.channel, subject: log.subject, body: log.body ?? null, documentId: log.documentId ?? null, actorId, at: when } });
  if (updated.status !== p.status) {
    await prisma.caseEvent.create({ data: { caseId: p.caseId, type: 'ACCELERATED_STATUS', note: `${p.status} → ${updated.status}`, actorId, visibleToClient: false } });
  }
  if (input.action === 'FEE_REQUESTED') await notifyEmployer(updated, 'FEE');
  if (input.action === 'PRE_APPROVAL') {
    await notifyEmployer(updated, 'PRE_APPROVAL');
    await notifyClientPreApproval(updated);
  }
  invalidateMyWork();
  return updated;
};

/** Upload of a step document or a letter: stored in the case drive, then the step / message is recorded. */
export const uploadProcedureDocument = async (
  id: string,
  file: Express.Multer.File,
  o: { kind: UploadKind; date?: string; channel?: string; subject?: string; dueAt?: string },
  actorId: string,
) => {
  const p = await loadProcedure(id);
  const label = { POWER_OF_ATTORNEY: 'Vollmacht § 81a', AGREEMENT: 'Vereinbarung § 81a', PRE_APPROVAL: 'Vorabzustimmung', LETTER_IN: '§ 81a: Schreiben der Behörde', LETTER_OUT: '§ 81a: Schreiben an die Behörde' }[o.kind];
  const doc = await storeCaseDocument(p.caseId, file, actorId, label);
  const date = o.date && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : undefined;
  if (o.kind === 'LETTER_IN' || o.kind === 'LETTER_OUT') {
    const channel = (ACCEL_CHANNELS as readonly string[]).includes(o.channel ?? '') ? (o.channel as (typeof ACCEL_CHANNELS)[number]) : 'LETTER';
    const dueAt = o.dueAt && /^\d{4}-\d{2}-\d{2}$/.test(o.dueAt) ? atNoon(o.dueAt) : null;
    const message = await prisma.acceleratedMessage.create({
      data: { procedureId: p.id, direction: o.kind === 'LETTER_IN' ? 'IN' : 'OUT', channel, subject: (o.subject?.trim() || doc.originalName).slice(0, 300), documentId: doc.id, dueAt, actorId, at: date ? atNoon(date) : new Date() },
    });
    invalidateMyWork();
    return { document: doc, message, procedure: await loadProcedure(p.id) };
  }
  if ((ACCEL_FINAL as readonly string[]).includes(p.status)) return { document: doc, message: null, procedure: p };
  const procedure = await applyStep(p.id, { action: o.kind === 'AGREEMENT' ? 'AGREEMENT' : o.kind, date, documentId: doc.id } as StepInput, actorId);
  if (o.kind === 'AGREEMENT' || o.kind === 'POWER_OF_ATTORNEY') {
    await prisma.acceleratedMessage.create({ data: { procedureId: p.id, direction: 'IN', channel: 'LETTER', subject: label, documentId: doc.id, actorId, at: date ? atNoon(date) : new Date() } });
  }
  return { document: doc, message: null, procedure };
};

export const logMessage = async (id: string, input: z.infer<typeof messageInput>, actorId: string) => {
  const p = await loadProcedure(id);
  await checkDoc(p.caseId, input.documentId);
  if (!input.subject && !input.body && !input.documentId) throw badRequest('MESSAGE_EMPTY');
  const m = await prisma.acceleratedMessage.create({
    data: {
      procedureId: p.id,
      direction: input.direction,
      channel: input.channel,
      subject: input.subject || null,
      body: input.body || null,
      documentId: input.documentId ?? null,
      dueAt: input.dueAt ? atNoon(input.dueAt) : null,
      actorId,
      at: input.at ? atNoon(input.at) : new Date(),
    },
  });
  invalidateMyWork();
  return m;
};

// ─── Submission e-mail ────────────────────────────────────────────────

/** Proposal for the submission e-mail: German text and the case documents suggested as attachments. */
export const submissionDraft = async (id: string, actor: { firstName: string; lastName: string }) => {
  const p = await loadProcedure(id);
  const c = await loadContractCase(p.caseId);
  const docs = await linkableDocuments(p.caseId);
  // Suggested: the step documents + the client's core documents (accepted).
  const coreKeys = ['PASSPORT', 'DIPLOMA', 'ANERKENNUNG', 'CV', 'EMPLOYMENT_REF', 'SIGNED_CONTRACT', 'GERMAN_CERT', 'LANGUAGE_CERT'];
  const stepDocIds = (await prisma.acceleratedMessage.findMany({ where: { procedureId: p.id, documentId: { not: null } }, select: { documentId: true } })).map((m) => m.documentId!);
  const suggested = docs.filter((d) => stepDocIds.includes(d.id) || (d.status === 'ACCEPTED' && d.requirement?.key && coreKeys.includes(d.requirement.key)));
  const values = await contractValues(c, {}, 'de', null);
  const triad = await triadParty();
  const mail = submissionMail({
    authority: p.authority,
    reference: p.reference,
    worker: { name: values['client.fullName'], birthDate: values['client.birthDate'], nationality: values['client.nationality'] },
    company: { name: values['company.name'] || '—', contact: values['company.contactPerson'] },
    profession: c.profession,
    caseNumber: c.number,
    attachments: suggested.map((d) => d.originalName),
    sender: fullName(actor),
    agency: triad.name,
  });
  return { to: p.authorityEmail ?? '', ...mail, documentIds: suggested.map((d) => d.id) };
};

/** Sends the submission e-mail (attachments read from the case), logs it as OUT and marks the procedure submitted. */
export const sendSubmission = async (id: string, input: z.infer<typeof mailInput>, actorId: string) => {
  const p = await loadProcedure(id);
  if ((ACCEL_FINAL as readonly string[]).includes(p.status)) throw conflict('ACCELERATED_CLOSED');
  const docs = input.documentIds.length ? await prisma.document.findMany({ where: { id: { in: input.documentIds }, caseId: p.caseId }, select: { id: true, originalName: true, storedName: true, mimeType: true, size: true } }) : [];
  if (docs.length !== new Set(input.documentIds).size) throw badRequest('DOCUMENT_NOT_IN_CASE');
  if (docs.reduce((a, d) => a + d.size, 0) > MAX_MAIL_BYTES) throw badRequest('ATTACHMENTS_TOO_LARGE');
  const attachments: MailAttachment[] = [];
  for (const d of docs) {
    try {
      attachments.push({ filename: d.originalName, content: await readDocument(d.storedName), contentType: d.mimeType });
    } catch {
      throw badRequest('ATTACHMENT_MISSING');
    }
  }
  const html = renderEmail(input.subject, input.body);
  await sendMail(input.to, input.subject, html, attachments);
  const list = docs.map((d) => `• ${d.originalName}`).join('\n');
  const message = await prisma.acceleratedMessage.create({
    data: { procedureId: p.id, direction: 'OUT', channel: 'EMAIL', subject: input.subject, body: `An: ${input.to}\n\n${input.body}${list ? `\n\nAnlagen:\n${list}` : ''}`.slice(0, 60000), actorId },
  });
  const data: Prisma.AcceleratedProcedureUncheckedUpdateInput = { status: advanceTo(p.status, 'SUBMITTED') };
  if (!p.submittedAt) data.submittedAt = new Date();
  if (!p.authorityEmail) data.authorityEmail = input.to;
  const procedure = await prisma.acceleratedProcedure.update({ where: { id: p.id }, data });
  invalidateMyWork();
  return { message, procedure };
};

// ─── Vollmacht (worker → employer) via e-signature ─────────────────────

const vollmachtRequest = (caseId: string) =>
  prisma.signatureRequest.findFirst({ where: { caseId, title: { startsWith: VOLLMACHT_TITLE }, status: { notIn: ['CANCELLED', 'DECLINED', 'EXPIRED'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, sentAt: true, completedAt: true, finalKey: true } });

/**
 * Generates the power of attorney from the built-in German template (case data filled in) and sends it to
 * the worker for e-signature (lib/esign). Completion is picked up by syncPowerOfAttorney.
 */
export const sendVollmacht = async (id: string, actor: { id: string; role: Role; firstName: string; lastName: string }) => {
  const p = await loadProcedure(id);
  if (p.powerOfAttorneyAt) throw conflict('POWER_OF_ATTORNEY_DONE');
  const open = await vollmachtRequest(p.caseId);
  if (open && open.status !== 'COMPLETED') throw conflict('SIGNATURE_PENDING');
  const c = await loadContractCase(p.caseId);
  if (!c.company) throw badRequest('COMPANY_REQUIRED');
  const values = await contractValues(c, {}, 'de', actor);
  const text = renderContract(VOLLMACHT_TEMPLATE, values).text;
  const pdf = await renderContractPdf({ title: VOLLMACHT_TITLE, text, kind: 'WORK', language: 'de', parties: [values['company.name'], values['client.fullName']] });
  const created = await createRequest(
    {
      title: `${VOLLMACHT_TITLE} – ${values['client.fullName']}`,
      caseId: p.caseId,
      companyId: c.companyId,
      order: 'SEQUENTIAL',
      signers: [{ role: 'CANDIDATE', name: values['client.fullName'], email: c.client.email, userId: c.client.id, locale: c.client.locale }],
      pdf,
      fileName: `Vollmacht_81a_${c.number}.pdf`,
    },
    actor,
  );
  await sendRequest(created.id, actor);
  await prisma.acceleratedMessage.create({ data: { procedureId: p.id, direction: 'OUT', channel: 'PORTAL', subject: `${VOLLMACHT_TITLE}: zur Unterschrift an ${values['client.fullName']}`, actorId: actor.id } });
  return created;
};

/** When the worker has signed the Vollmacht: date + status follow, the signed PDF becomes a case document (once). */
export const syncPowerOfAttorney = async (p: AcceleratedProcedure) => {
  if (p.powerOfAttorneyAt) return p;
  const r = await vollmachtRequest(p.caseId);
  if (!r || r.status !== 'COMPLETED' || !r.completedAt) return p;
  const claim = await prisma.acceleratedProcedure.updateMany({ where: { id: p.id, powerOfAttorneyAt: null }, data: { powerOfAttorneyAt: r.completedAt, status: advanceTo(p.status, 'POWER_OF_ATTORNEY') } });
  if (claim.count && r.finalKey) {
    try {
      const buf = await readStored(r.finalKey);
      const storedName = `vollmacht-${crypto.randomBytes(12).toString('hex')}.pdf`;
      await fs.writeFile(path.join(config.uploads.privateDir, storedName), buf);
      const uploader = (await prisma.acceleratedProcedure.findUnique({ where: { id: p.id }, select: { createdById: true } }))?.createdById;
      const kase = await prisma.case.findUnique({ where: { id: p.caseId }, select: { number: true, clientId: true } });
      const doc = await prisma.document.create({
        data: { caseId: p.caseId, stage: 'OTHER', originalName: `Vollmacht_81a_${kase?.number ?? ''}_signiert.pdf`, storedName, mimeType: 'application/pdf', size: buf.length, status: 'ACCEPTED', uploadedById: uploader ?? kase!.clientId },
      });
      void copyDocumentToDrive(doc.id).catch(() => undefined);
      await prisma.acceleratedMessage.create({ data: { procedureId: p.id, direction: 'IN', channel: 'PORTAL', subject: `${VOLLMACHT_TITLE}: unterschrieben`, documentId: doc.id, at: r.completedAt } });
    } catch (err) {
      console.error('[accelerated] could not copy the signed Vollmacht', err);
    }
  }
  return loadProcedure(p.id);
};

// ─── Employer portal ──────────────────────────────────────────────────

/** Read-only view for the company: steps with dates, what the employer has to do, deadlines (no correspondence). */
export const employerAccelerated = async (companyId: string, caseId: string) => {
  const p = await prisma.acceleratedProcedure.findFirst({ where: { caseId, companyId } });
  if (!p) return null;
  return {
    status: p.status,
    authority: p.authority,
    reference: p.reference,
    feeCents: p.feeCents,
    feeRequestedAt: p.feeRequestedAt,
    feePaidAt: p.feePaidAt,
    appointmentDeadline: p.appointmentAt ? null : p.appointmentDeadline,
    appointmentAt: p.appointmentAt,
    decisionDeadline: p.decidedAt ? null : p.decisionDeadline,
    steps: stepsOf(p).map((s) => ({ status: s.status, at: s.at, done: s.done, current: s.current })),
    todos: employerTodos(p),
    final: (ACCEL_FINAL as readonly string[]).includes(p.status),
  };
};

/** Open items of the employer per case (panel rows): one per todo. */
export const employerAcceleratedTodos = async (companyId: string, caseIds: string[]) => {
  if (!caseIds.length) return new Map<string, { todo: 'SIGN_AGREEMENT' | 'PAY_FEE'; since: Date }[]>();
  const rows = await prisma.acceleratedProcedure.findMany({ where: { companyId, caseId: { in: caseIds }, status: { notIn: [...ACCEL_FINAL] } } });
  return new Map(rows.map((p) => [p.caseId, employerTodos(p).map((todo) => ({ todo, since: todo === 'PAY_FEE' ? (p.feeRequestedAt ?? p.createdAt) : p.createdAt }))]));
};

// ─── List ─────────────────────────────────────────────────────────────

export const listQuery = z.object({
  status: z.enum([...ACCEL_STATUSES, 'open', 'all']).default('open'),
  soon: z.coerce.number().int().min(1).max(120).optional(),
  companyId: z.string().trim().max(40).optional(),
});

/** /admin/accelerated: procedures with their nearest deadline. */
export const listProcedures = async (q: z.infer<typeof listQuery>, now = new Date()) => {
  const where: Prisma.AcceleratedProcedureWhereInput = {};
  if (q.status === 'open') where.status = { notIn: [...ACCEL_FINAL] };
  else if (q.status !== 'all') where.status = q.status;
  if (q.companyId) where.companyId = q.companyId;
  const [rows, byStatus] = await Promise.all([
    prisma.acceleratedProcedure.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 500 }),
    prisma.acceleratedProcedure.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const [cases, companies, replies] = await Promise.all([
    rows.length
      ? prisma.case.findMany({ where: { id: { in: rows.map((r) => r.caseId) } }, select: { id: true, number: true, status: true, client: { select: { id: true, firstName: true, lastName: true } }, assignedStaff: { select: { id: true, firstName: true, lastName: true } } } })
      : [],
    rows.length ? prisma.company.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }) : [],
    Promise.all(rows.map(async (r) => [r.id, await openReplyDue(r.id)] as const)),
  ]);
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const companyOf = new Map(companies.map((c) => [c.id, c.name]));
  const replyOf = new Map(replies);
  let items = rows
    .filter((r) => caseOf.has(r.caseId))
    .map((r) => {
      const c = caseOf.get(r.caseId)!;
      const deadlines = accelDeadlines(r, replyOf.get(r.id) ?? null);
      const next = deadlines[0] ?? null;
      return {
        id: r.id,
        status: r.status,
        authority: r.authority,
        reference: r.reference,
        feeCents: r.feeCents,
        feeRequestedAt: r.feeRequestedAt,
        feePaidAt: r.feePaidAt,
        preApprovalAt: r.preApprovalAt,
        appointmentDeadline: r.appointmentDeadline,
        appointmentAt: r.appointmentAt,
        decisionDeadline: r.decisionDeadline,
        next,
        daysLeft: next ? Math.ceil((next.at.getTime() - now.getTime()) / DAY) : null,
        todos: employerTodos(r),
        updatedAt: r.updatedAt,
        company: r.companyId ? { id: r.companyId, name: companyOf.get(r.companyId) ?? '—' } : null,
        case: { id: c.id, number: c.number, status: c.status },
        client: { id: c.client.id, name: fullName(c.client) },
        staff: c.assignedStaff ? { id: c.assignedStaff.id, name: fullName(c.assignedStaff) } : null,
      };
    });
  if (q.soon) items = items.filter((i) => i.next && i.next.at.getTime() <= now.getTime() + q.soon! * DAY);
  items.sort((a, b) => (a.next ? a.next.at.getTime() : Infinity) - (b.next ? b.next.at.getTime() : Infinity) || b.updatedAt.getTime() - a.updatedAt.getTime());
  const open = items.filter((i) => !(ACCEL_FINAL as readonly string[]).includes(i.status));
  return {
    items,
    counts: {
      byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      overdue: open.filter((i) => i.next && i.next.at < now).length,
      soon: open.filter((i) => i.next && i.next.at >= now && i.next.at.getTime() <= now.getTime() + 7 * DAY).length,
      feeOpen: open.filter((i) => i.feeRequestedAt && !i.feePaidAt).length,
    },
  };
};

export { openReplyDue };
