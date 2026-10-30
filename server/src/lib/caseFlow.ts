import type { CaseStatus, DocStage, Prisma, VisaType } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, conflict, notFound } from './http.js';
import { formatDateTime, notifyClient, notifyStaff, type NotificationType, type NotifyParams } from './notifications.js';
import { createRequirements } from './docsIntel/requirementTemplates.js';
import { pickAssignee } from './ops/autoAssign.js';
import { emitWebhook } from './ops/webhooks.js';
import { awardCaseCommission } from './agents/commissions.js';
import { surveyOnCaseFinal } from './surveys/service.js';
import { syncCaseFolder } from './drive/caseFolders.js';
import { notifyPartnerCaseStatus } from './partnerPortal/notify.js';
import { syncSettlementsForCase } from './settlement/service.js';
import { emitAutomationEvent } from './automation/events.js'; // automation rules: domain events (never throws)

export const FINAL_STATUSES: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];

/** Which document stage a client may upload to, per case status. */
export const CLIENT_UPLOAD_STAGE: Partial<Record<CaseStatus, DocStage>> = {
  DOCUMENTS_PENDING: 'INITIAL',
  EMBASSY_DOCUMENTS: 'EMBASSY',
};

const nextCaseNumber = async (tx: Prisma.TransactionClient) => {
  const year = new Date().getFullYear();
  const prefix = `TV-${year}-`;
  // Compare the numeric part, not the string: as text "TV-2026-9999" sorts after "TV-2026-10000".
  const [row] = await tx.$queryRaw<{ n: bigint | number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(number, ${prefix.length + 1}) AS UNSIGNED)) AS n
    FROM \`Case\` WHERE number LIKE ${prefix + '%'}`;
  const n = Number(row?.n ?? 0) + 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
};

export const createCase = async (
  clientId: string,
  input: {
    profession: string;
    /** Kind of application (work visa, Ausbildung, tourist …); family members inherit the main case's. */
    visaType?: VisaType;
    visaCategoryId?: string | null;
    /** Family reunion: the main applicant's case this one belongs to (+ relation: spouse | child | parent). */
    parentCaseId?: string | null;
    relation?: string | null;
    /** Staff creating a case on someone's behalf (actor for the event / assignment). */
    actorId?: string;
    /** Skip the generic "case created" notices (the caller sends its own, e.g. a residence-title renewal). */
    quiet?: boolean;
    /** Referral partner of the case (e.g. a renewal keeps the old case's); default: the main case's, else the client's owner. */
    partnerId?: string | null;
  },
) => {
  // One active case per client — except family-member cases, which are separate applications.
  if (!input.parentCaseId) {
    const active = await prisma.case.count({ where: { clientId, status: { notIn: FINAL_STATUSES }, parentCaseId: null } });
    if (active > 0) throw conflict('ACTIVE_CASE_EXISTS');
  }

  // Retry on the (rare) race where two cases get the same number.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const number = await nextCaseNumber(tx);
        // A family member inherits the main case's staff; otherwise auto-assignment (if enabled) picks one.
        const parent = input.parentCaseId ? await tx.case.findUnique({ where: { id: input.parentCaseId }, select: { assignedStaffId: true, visaCategoryId: true, visaType: true, partnerId: true } }) : null;
        const visaCategoryId = input.visaCategoryId ?? parent?.visaCategoryId ?? null;
        const clientRow = await tx.user.findUnique({ where: { id: clientId }, select: { locale: true, ownerPartnerId: true } });
        const clientLocale = clientRow?.locale ?? null;
        // Partner-owned clients: every case belongs to the owning partner (lib/partners/owned.ts).
        const partnerId = input.partnerId ?? parent?.partnerId ?? clientRow?.ownerPartnerId ?? null;
        const assignedStaffId = parent?.assignedStaffId ?? (await pickAssignee(tx, { clientLocale, visaType: input.visaType ?? parent?.visaType ?? 'WORK', visaCategoryId }));
        const c = await tx.case.create({
          data: {
            clientId,
            number,
            profession: input.profession,
            visaType: input.visaType ?? parent?.visaType ?? 'WORK',
            visaCategoryId,
            assignedStaffId,
            parentCaseId: input.parentCaseId ?? null,
            relation: input.relation ?? null,
            partnerId,
          },
        });
        await createRequirements(tx, c.id, 'INITIAL', visaCategoryId);
        await tx.caseEvent.create({
          data: { caseId: c.id, type: 'CASE_CREATED', toStatus: c.status, actorId: input.actorId ?? clientId },
        });
        if (assignedStaffId) {
          await tx.caseEvent.create({ data: { caseId: c.id, type: 'CASE_UPDATED', note: 'auto-assigned', actorId: null, visibleToClient: false } });
        }
        return c;
      });
      if (!input.quiet) {
        await notifyClient(created.id, 'CASE_CREATED');
        await notifyStaff(
          `Yeni müraciət: ${created.number}`,
          `Yeni müştəri müraciəti yaradıldı.\n\nPeşə: ${created.profession}`,
          { caseId: created.id, link: `/admin/cases/${created.id}` },
        );
      }
      await awardCaseCommission(created.id, 'CASE_CREATED'); // agent programme (never throws)
      // Referral partner: automatic commission + message to the partner (never throws).
      if (created.partnerId) await import('./partners/owned.js').then((m) => m.onPartnerCaseCreated(created.id, input.actorId ?? clientId)).catch(() => undefined);
      void emitWebhook('case.created', { caseId: created.id, number: created.number, status: created.status, visaCategoryId: created.visaCategoryId }, created.companyId);
      void syncCaseFolder(created.id); // the client's folder in the shared drive
      // Documents uploaded with a vacancy application before this case existed join it (requirement + type folder).
      if (!input.parentCaseId) void import('./applicationUploads.js').then((m) => m.attachApplicationUploadsOnCaseCreated(created.id)).catch(() => undefined);
      void emitAutomationEvent({ type: 'CASE_CREATED', entityType: 'case', entityId: created.id, caseId: created.id, payload: { to: created.status } }); // automation hook
      return created;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') continue;
      throw err;
    }
  }
  throw conflict('CASE_NUMBER_RACE');
};

/**
 * Atomically move a case from one of `from` to `to`. Uses a conditional update so two
 * concurrent actions can never both succeed (the loser gets 409 INVALID_TRANSITION).
 */
const transition = async (
  caseId: string,
  from: CaseStatus[],
  to: CaseStatus,
  actorId: string,
  opts: {
    data?: Prisma.CaseUncheckedUpdateManyInput;
    note?: string | null;
    eventType?: string;
    extra?: (tx: Prisma.TransactionClient) => Promise<unknown>;
  } = {},
) => {
  const current = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true } });
  if (!current) throw notFound('CASE_NOT_FOUND');

  await prisma.$transaction(async (tx) => {
    const res = await tx.case.updateMany({
      where: { id: caseId, status: { in: from } },
      // DSGVO retention clock: closedAt is set when a case reaches a final status and cleared on reopen.
      data: { ...opts.data, status: to, closedAt: FINAL_STATUSES.includes(to) ? new Date() : null },
    });
    if (res.count === 0) throw conflict('INVALID_TRANSITION', `Cannot move case from ${current.status} to ${to}`);
    await tx.caseEvent.create({
      data: {
        caseId,
        type: opts.eventType ?? 'STATUS_CHANGED',
        fromStatus: current.status,
        toStatus: to,
        note: opts.note ?? null,
        actorId,
      },
    });
    if (opts.extra) await opts.extra(tx);
  });
  const after = await prisma.case.findUnique({ where: { id: caseId }, select: { number: true, companyId: true } });
  if (after) void emitWebhook(FINAL_STATUSES.includes(to) && to !== 'CANCELLED' ? 'case.decided' : 'case.status_changed', { caseId, number: after.number, from: current.status, to }, after.companyId);
  if (FINAL_STATUSES.includes(to)) void surveyOnCaseFinal(caseId, to); // satisfaction survey (never throws)
  void notifyPartnerCaseStatus(caseId, to, opts.eventType); // referral partner portal (never throws)
  void import('./partners/owned.js').then((m) => m.partnerCommissionOnStatus(caseId, to)).catch(() => undefined); // partner commission trigger (never throws)
  void syncSettlementsForCase(caseId); // settlement ledger rows follow the case (never throws)
  // Payment plans: instalments whose trigger is this status (or ON_SIGN on the contract signature) get their invoice (lazy import: no cycle; never throws).
  void import('./billing/plans.js').then((m) => m.fireCaseStatusInstallments(caseId, to)).catch(() => undefined);
  // ── Automation hook: one central place for every status change, contract signature and appointment ──
  const eventType = opts.eventType ?? 'STATUS_CHANGED';
  void emitAutomationEvent({ type: 'CASE_STATUS_CHANGED', entityType: 'case', entityId: caseId, caseId, payload: { from: current.status, to, eventType } });
  if (eventType === 'CONTRACT_SIGNED') void emitAutomationEvent({ type: 'CONTRACT_SIGNED', entityType: 'case', entityId: caseId, caseId, payload: { to } });
  if (eventType === 'APPOINTMENT_SCHEDULED' || eventType === 'APPOINTMENT_RESCHEDULED') {
    const at = opts.data?.appointmentAt instanceof Date ? opts.data.appointmentAt.toISOString() : null;
    void emitAutomationEvent({ type: 'APPOINTMENT_SET', entityType: 'case', entityId: caseId, caseId, payload: { at, rescheduled: eventType === 'APPOINTMENT_RESCHEDULED' } });
  }
};

const requirementsSatisfied = async (caseId: string, stage: DocStage, mode: 'uploaded' | 'accepted') => {
  const reqs = await prisma.documentRequirement.findMany({
    where: { caseId, stage, required: true },
    include: { documents: { select: { status: true } } },
  });
  const missing = reqs.filter((r) =>
    mode === 'uploaded'
      ? !r.documents.some((d) => d.status !== 'REJECTED')
      : !r.documents.some((d) => d.status === 'ACCEPTED'),
  );
  return { ok: missing.length === 0, missing: missing.map((r) => r.id) };
};

// ─── Client actions ────────────────────────────────────────────────────

export const clientSubmitDocuments = async (caseId: string, clientId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId } });
  if (!c || c.clientId !== clientId) throw notFound('CASE_NOT_FOUND');

  const stage = CLIENT_UPLOAD_STAGE[c.status];
  if (!stage) throw conflict('INVALID_TRANSITION');
  const check = await requirementsSatisfied(caseId, stage, 'uploaded');
  if (!check.ok) throw badRequest('REQUIRED_DOCUMENTS_MISSING', check.missing.join(','));

  const to: CaseStatus = stage === 'INITIAL' ? 'DOCUMENTS_REVIEW' : 'EMBASSY_REVIEW';
  await transition(caseId, [c.status], to, clientId, { eventType: 'DOCUMENTS_SUBMITTED', data: { staffNote: null } });
  await notifyStaff(
    `${c.number}: sənədlər yoxlamaya göndərildi`,
    stage === 'INITIAL'
      ? 'Müştəri ilkin sənədləri yükləyib yoxlamaya göndərdi.'
      : 'Müştəri səfirlik sənədlərini yükləyib yoxlamaya göndərdi.',
    { caseId, link: `/admin/cases/${caseId}` },
  );
};

// ─── Staff actions ─────────────────────────────────────────────────────

const loadCase = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return c;
};

const after = (caseId: string, type: NotificationType, params?: NotifyParams) => notifyClient(caseId, type, params);

export const staffRequestChanges = async (caseId: string, actorId: string, note: string) => {
  const c = await loadCase(caseId);
  if (c.status === 'DOCUMENTS_REVIEW') {
    await transition(caseId, ['DOCUMENTS_REVIEW'], 'DOCUMENTS_PENDING', actorId, { note, data: { staffNote: note } });
    await after(caseId, 'DOCS_CHANGES_REQUESTED', { note });
  } else if (c.status === 'EMBASSY_REVIEW') {
    await transition(caseId, ['EMBASSY_REVIEW'], 'EMBASSY_DOCUMENTS', actorId, { note, data: { staffNote: note } });
    await after(caseId, 'EMBASSY_CHANGES_REQUESTED', { note });
  } else {
    throw conflict('INVALID_TRANSITION');
  }
};

/**
 * Contract file must already be stored as a Document with stage CONTRACT.
 * `opts.signatureRequestId`: the contract is signed through the multi-party e-signature module
 * (lib/esign); the module sends its own invitations, so `opts.notify` is false there.
 */
export const staffSendContract = async (
  caseId: string,
  actorId: string,
  contractDocumentId: string,
  opts: { notify?: boolean; signatureRequestId?: string } = {},
) => {
  const c = await loadCase(caseId);
  if (c.status === 'DOCUMENTS_REVIEW') {
    const check = await requirementsSatisfied(caseId, 'INITIAL', 'accepted');
    if (!check.ok) throw badRequest('REQUIRED_DOCUMENTS_NOT_ACCEPTED', check.missing.join(','));
  } else if (c.status !== 'CONTRACT_SENT' && c.status !== 'CONTRACT_SIGNED') {
    throw conflict('INVALID_TRANSITION');
  }

  await transition(caseId, ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'], 'CONTRACT_SENT', actorId, {
    eventType: 'CONTRACT_SENT',
    data: { staffNote: null },
    extra: async (tx) => {
      const existing = await tx.contract.findUnique({ where: { caseId } });
      if (existing) {
        await tx.contract.update({
          where: { caseId },
          data: {
            fileDocumentId: contractDocumentId,
            signedDocumentId: null,
            signerName: null,
            signedAt: null,
            signerIp: null,
            signerUserAgent: null,
            sentAt: new Date(),
            version: existing.version + 1,
            signatureRequestId: opts.signatureRequestId ?? null,
          },
        });
      } else {
        await tx.contract.create({ data: { caseId, fileDocumentId: contractDocumentId, ...(opts.signatureRequestId ? { signatureRequestId: opts.signatureRequestId } : {}) } });
      }
    },
  });
  if (opts.notify !== false) await after(caseId, 'CONTRACT_SENT');
};

export const clientSignContract = async (
  caseId: string,
  clientId: string,
  signed: { signerName: string; signedDocumentId: string; ip: string; userAgent: string },
) => {
  const c = await loadCase(caseId);
  if (c.clientId !== clientId) throw notFound('CASE_NOT_FOUND');
  await transition(caseId, ['CONTRACT_SENT'], 'CONTRACT_SIGNED', clientId, {
    eventType: 'CONTRACT_SIGNED',
    extra: (tx) =>
      tx.contract.update({
        where: { caseId },
        data: {
          signedDocumentId: signed.signedDocumentId,
          signerName: signed.signerName,
          signedAt: new Date(),
          signerIp: signed.ip,
          signerUserAgent: signed.userAgent,
        },
      }),
  });
  await awardCaseCommission(caseId, 'CONTRACT_SIGNED'); // agent programme (never throws)
  await notifyStaff(`${c.number}: müqavilə imzalandı`, `Müştəri müqaviləni elektron imzaladı (${signed.signerName}).`, {
    caseId,
    link: `/admin/cases/${caseId}`,
  });
};

export const staffRejectSignature = async (caseId: string, actorId: string, note: string) => {
  await transition(caseId, ['CONTRACT_SIGNED'], 'CONTRACT_SENT', actorId, {
    note,
    eventType: 'SIGNATURE_REJECTED',
    data: { staffNote: note },
    extra: (tx) =>
      tx.contract.update({
        where: { caseId },
        data: { signedDocumentId: null, signerName: null, signedAt: null, signerIp: null, signerUserAgent: null },
      }),
  });
  await after(caseId, 'CONTRACT_RESIGN_REQUESTED', { note });
};

export const staffConfirmContract = async (caseId: string, actorId: string) => {
  await transition(caseId, ['CONTRACT_SIGNED'], 'EMBASSY_DOCUMENTS', actorId, {
    eventType: 'CONTRACT_CONFIRMED',
    data: { staffNote: null },
    extra: async (tx) => {
      const has = await tx.documentRequirement.count({ where: { caseId, stage: 'EMBASSY' } });
      if (!has) await createRequirements(tx, caseId, 'EMBASSY', (await tx.case.findUniqueOrThrow({ where: { id: caseId }, select: { visaCategoryId: true } })).visaCategoryId);
    },
  });
  await after(caseId, 'EMBASSY_DOCS_REQUESTED');
};

export const staffScheduleAppointment = async (
  caseId: string,
  actorId: string,
  input: { at: Date; place: string; note?: string | null },
) => {
  const c = await loadCase(caseId);
  if (c.status === 'EMBASSY_REVIEW') {
    const check = await requirementsSatisfied(caseId, 'EMBASSY', 'accepted');
    if (!check.ok) throw badRequest('REQUIRED_DOCUMENTS_NOT_ACCEPTED', check.missing.join(','));
  } else if (c.status !== 'APPOINTMENT_SCHEDULED') {
    throw conflict('INVALID_TRANSITION');
  }
  await transition(caseId, ['EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED'], 'APPOINTMENT_SCHEDULED', actorId, {
    eventType: c.status === 'APPOINTMENT_SCHEDULED' ? 'APPOINTMENT_RESCHEDULED' : 'APPOINTMENT_SCHEDULED',
    note: input.note,
    data: { appointmentAt: input.at, appointmentPlace: input.place, staffNote: input.note ?? null },
  });
  const client = await prisma.user.findFirstOrThrow({ where: { cases: { some: { id: caseId } } } });
  await after(caseId, 'APPOINTMENT_SCHEDULED', {
    date: formatDateTime(input.at, client.locale),
    place: input.place,
    note: input.note,
  });
};

export const staffMarkLodged = async (caseId: string, actorId: string) => {
  // Four-eyes gate: an approved review of the current embassy package (lazy import: no import cycle).
  if ((await loadCase(caseId)).status === 'APPOINTMENT_SCHEDULED') await (await import('./caseNext/fourEyes.js')).assertFourEyes(caseId);
  await transition(caseId, ['APPOINTMENT_SCHEDULED'], 'DECISION_PENDING', actorId, {
    eventType: 'LODGED_AT_EMBASSY',
    data: { staffNote: null },
  });
  await after(caseId, 'DECISION_PENDING');
};

export const staffDecide = async (
  caseId: string,
  actorId: string,
  input: { decision: 'APPROVED' | 'REJECTED'; reason?: string | null; validFrom?: Date | null; validTo?: Date | null },
) => {
  if (input.decision === 'REJECTED' && !input.reason?.trim()) throw badRequest('REASON_REQUIRED');
  await transition(caseId, ['DECISION_PENDING'], input.decision, actorId, {
    eventType: 'DECISION',
    note: input.reason,
    data: {
      decisionAt: new Date(),
      decisionReason: input.reason ?? null,
      visaValidFrom: input.decision === 'APPROVED' ? input.validFrom ?? null : null,
      visaValidTo: input.decision === 'APPROVED' ? input.validTo ?? null : null,
    },
  });
  if (input.decision === 'APPROVED') await awardCaseCommission(caseId, 'VISA_APPROVED'); // agent programme (never throws)
  await after(caseId, input.decision, { reason: input.reason ?? undefined });
};

export const staffCancel = async (caseId: string, actorId: string, reason: string) => {
  const nonFinal: CaseStatus[] = [
    'DOCUMENTS_PENDING',
    'DOCUMENTS_REVIEW',
    'CONTRACT_SENT',
    'CONTRACT_SIGNED',
    'EMBASSY_DOCUMENTS',
    'EMBASSY_REVIEW',
    'APPOINTMENT_SCHEDULED',
    'DECISION_PENDING',
  ];
  await transition(caseId, nonFinal, 'CANCELLED', actorId, { note: reason, data: { cancelReason: reason } });
  await after(caseId, 'CANCELLED', { reason });
};

/** Reopen a refused/cancelled case at a chosen step, e.g. to re-apply at the embassy. */
export const staffReopen = async (
  caseId: string,
  actorId: string,
  to: 'DOCUMENTS_PENDING' | 'EMBASSY_DOCUMENTS',
  note?: string | null,
) => {
  const c = await loadCase(caseId);
  const others = await prisma.case.count({
    where: { clientId: c.clientId, id: { not: caseId }, status: { notIn: FINAL_STATUSES } },
  });
  if (others > 0) throw conflict('ACTIVE_CASE_EXISTS');
  await transition(caseId, ['REJECTED', 'CANCELLED'], to, actorId, {
    eventType: 'REOPENED',
    note,
    data: { staffNote: note ?? null, decisionAt: null, decisionReason: null, cancelReason: null },
    extra: async (tx) => {
      if (to === 'EMBASSY_DOCUMENTS') {
        const has = await tx.documentRequirement.count({ where: { caseId, stage: 'EMBASSY' } });
        if (!has) await createRequirements(tx, caseId, 'EMBASSY', (await tx.case.findUniqueOrThrow({ where: { id: caseId }, select: { visaCategoryId: true } })).visaCategoryId);
      }
    },
  });
  await after(caseId, 'REOPENED', { note });
};
