import type { CaseStatus, DocStage, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, conflict, notFound } from './http.js';
import { formatDateTime, notifyClient, notifyStaff, type NotificationType, type NotifyParams } from './notifications.js';

type L10n = { az: string; de: string; en: string; ru: string };

export const FINAL_STATUSES: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];

/** Which document stage a client may upload to, per case status. */
export const CLIENT_UPLOAD_STAGE: Partial<Record<CaseStatus, DocStage>> = {
  DOCUMENTS_PENDING: 'INITIAL',
  EMBASSY_DOCUMENTS: 'EMBASSY',
};

const DEFAULT_REQUIREMENTS: Record<'INITIAL' | 'EMBASSY', { title: L10n; description?: L10n; required: boolean }[]> = {
  INITIAL: [
    { required: true, title: { az: 'Pasport (bütün səhifələr)', de: 'Reisepass (alle Seiten)', en: 'Passport (all pages)', ru: 'Паспорт (все страницы)' }, description: { az: 'Etibarlılıq müddəti ən azı 12 ay olmalıdır.', de: 'Mindestens 12 Monate gültig.', en: 'Must be valid for at least 12 months.', ru: 'Срок действия не менее 12 месяцев.' } },
    { required: true, title: { az: 'Biometrik foto', de: 'Biometrisches Passfoto', en: 'Biometric photo', ru: 'Биометрическое фото' } },
    { required: true, title: { az: 'CV (tərcümeyi-hal)', de: 'Lebenslauf (CV)', en: 'CV / résumé', ru: 'Резюме (CV)' } },
    { required: true, title: { az: 'Diplom və sertifikatlar', de: 'Diplome und Zertifikate', en: 'Diplomas and certificates', ru: 'Дипломы и сертификаты' } },
    { required: false, title: { az: 'İş təcrübəsi arayışları', de: 'Arbeitszeugnisse', en: 'Employment references', ru: 'Справки о стаже работы' } },
    { required: false, title: { az: 'Sürücülük vəsiqəsi (sürücülər üçün)', de: 'Führerschein (für Fahrer)', en: 'Driving licence (for drivers)', ru: 'Водительское удостоверение (для водителей)' } },
    { required: false, title: { az: 'Dil sertifikatı (varsa)', de: 'Sprachzertifikat (falls vorhanden)', en: 'Language certificate (if any)', ru: 'Языковой сертификат (если есть)' } },
  ],
  EMBASSY: [
    { required: true, title: { az: 'Doldurulmuş viza ərizəsi (VIDEX)', de: 'Ausgefüllter Visumantrag (VIDEX)', en: 'Completed visa application form (VIDEX)', ru: 'Заполненная визовая анкета (VIDEX)' } },
    { required: true, title: { az: '2 ədəd biometrik foto', de: '2 biometrische Passfotos', en: '2 biometric photos', ru: '2 биометрических фото' } },
    { required: true, title: { az: 'Tibbi sığorta', de: 'Krankenversicherungsnachweis', en: 'Health insurance', ru: 'Медицинская страховка' } },
    { required: true, title: { az: 'İmzalanmış iş təklifi / əmək müqaviləsi', de: 'Unterschriebenes Arbeitsangebot / Arbeitsvertrag', en: 'Signed job offer / employment contract', ru: 'Подписанное предложение о работе / трудовой договор' } },
    { required: false, title: { az: 'Diplomun tanınması (Anerkennung)', de: 'Anerkennungsbescheid', en: 'Recognition of qualification (Anerkennung)', ru: 'Признание квалификации (Anerkennung)' } },
    { required: false, title: { az: 'Alman dili sertifikatı', de: 'Deutsch-Sprachzertifikat', en: 'German language certificate', ru: 'Сертификат по немецкому языку' } },
    { required: false, title: { az: 'Yaşayış yeri sübutu', de: 'Nachweis über Unterkunft', en: 'Proof of accommodation', ru: 'Подтверждение жилья' } },
  ],
};

const createDefaultRequirements = (tx: Prisma.TransactionClient, caseId: string, stage: 'INITIAL' | 'EMBASSY') =>
  tx.documentRequirement.createMany({
    data: DEFAULT_REQUIREMENTS[stage].map((r, i) => ({
      caseId,
      stage,
      title: r.title,
      description: r.description,
      required: r.required,
      sortOrder: i,
    })),
  });

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
  input: { profession: string; visaCategoryId?: string | null },
) => {
  const active = await prisma.case.count({ where: { clientId, status: { notIn: FINAL_STATUSES } } });
  if (active > 0) throw conflict('ACTIVE_CASE_EXISTS');

  // Retry on the (rare) race where two cases get the same number.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const number = await nextCaseNumber(tx);
        const c = await tx.case.create({
          data: { clientId, number, profession: input.profession, visaCategoryId: input.visaCategoryId ?? null },
        });
        await createDefaultRequirements(tx, c.id, 'INITIAL');
        await tx.caseEvent.create({
          data: { caseId: c.id, type: 'CASE_CREATED', toStatus: c.status, actorId: clientId },
        });
        return c;
      });
      await notifyClient(created.id, 'CASE_CREATED');
      await notifyStaff(
        `Yeni müraciət: ${created.number}`,
        `Yeni müştəri müraciəti yaradıldı.\n\nPeşə: ${created.profession}`,
        { caseId: created.id, link: `/admin/cases/${created.id}` },
      );
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
      data: { ...opts.data, status: to },
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

/** Contract file must already be stored as a Document with stage CONTRACT. */
export const staffSendContract = async (caseId: string, actorId: string, contractDocumentId: string) => {
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
          },
        });
      } else {
        await tx.contract.create({ data: { caseId, fileDocumentId: contractDocumentId } });
      }
    },
  });
  await after(caseId, 'CONTRACT_SENT');
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
      if (!has) await createDefaultRequirements(tx, caseId, 'EMBASSY');
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
        if (!has) await createDefaultRequirements(tx, caseId, 'EMBASSY');
      }
    },
  });
  await after(caseId, 'REOPENED', { note });
};
