import { VisaType as VisaTypes, type CaseStatus, type DocStage, type DocStatus, type Prisma, type VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { checkCaseDocument } from '../docCheck/index.js';
import { badRequest, conflict, notFound } from '../http.js';
import { CLIENT_UPLOAD_STAGE } from '../caseFlow.js';
import { clientUploadStageFor, notifyEarlyEmbassyUpload, notifyReplacement, resolveClientUploadTarget } from '../clientUploadTarget.js'; // same rules as the client's own upload
import { earlyEmbassyOpenFor } from '../earlyEmbassy/service.js';

import { emitAutomationEvent } from '../automation/events.js';
import { isRefused } from '../caseProcessing/index.js';
import { visaKeyOf } from '../partners/index.js';
import { loadContractTurns } from '../caseContracts/turn.js'; // whose turn a two-step contract is (Triad Vision signs first)
import type { ContractTurn } from '../caseContracts/flow.js';

/**
 * What a referral partner may see of "their" clients' cases (data minimisation):
 * client name, masked passport number, visa type / category, status + journey step, appointment and
 * decision dates, the next required action and the document checklist with statuses. Never staff
 * notes, event notes, other clients, staff names, contacts or files uploaded by other people.
 */

export const PORTAL_STEPS = ['DOCUMENTS', 'CONTRACT', 'EMBASSY', 'APPOINTMENT', 'DECISION', 'DONE'] as const;
export type PortalStep = (typeof PORTAL_STEPS)[number];

export const stepOf = (s: CaseStatus): PortalStep => {
  switch (s) {
    case 'DOCUMENTS_PENDING':
    case 'DOCUMENTS_REVIEW':
      return 'DOCUMENTS';
    case 'CONTRACT_SENT':
    case 'CONTRACT_SIGNED':
      return 'CONTRACT';
    case 'EMBASSY_DOCUMENTS':
    case 'EMBASSY_REVIEW':
      return 'EMBASSY';
    case 'APPOINTMENT_SCHEDULED':
      return 'APPOINTMENT';
    case 'DECISION_PENDING':
      return 'DECISION';
    default:
      return 'DONE';
  }
};

export type NextAction =
  | 'UPLOAD_DOCUMENTS'
  | 'SUBMIT_DOCUMENTS'
  | 'WAIT_REVIEW'
  | 'SIGN_CONTRACT'
  | 'WAIT_CONTRACT_CHECK'
  | 'ATTEND_APPOINTMENT'
  | 'WAIT_DECISION'
  | 'NONE';

/** `contractTurn`: in CONTRACT_SENT the client only signs when it is their turn (old flow: Triad Vision first; V2: the client first); in CONTRACT_SIGNED (V2) the İş müqaviləsi. */
export const nextActionOf = (s: CaseStatus, missingRequired: number, contractTurn?: ContractTurn | null): NextAction => {
  switch (s) {
    case 'DOCUMENTS_PENDING':
    case 'EMBASSY_DOCUMENTS':
      return missingRequired > 0 ? 'UPLOAD_DOCUMENTS' : 'SUBMIT_DOCUMENTS';
    case 'DOCUMENTS_REVIEW':
    case 'EMBASSY_REVIEW':
      return 'WAIT_REVIEW';
    case 'CONTRACT_SENT':
      return contractTurn && contractTurn !== 'CLIENT' ? 'WAIT_CONTRACT_CHECK' : 'SIGN_CONTRACT';
    case 'CONTRACT_SIGNED':
      // V2: İş müqaviləsi documents waiting for the client's signature (lib/caseContracts/turn).
      return contractTurn === 'CLIENT' ? 'SIGN_CONTRACT' : 'WAIT_CONTRACT_CHECK';
    case 'APPOINTMENT_SCHEDULED':
      return 'ATTEND_APPOINTMENT';
    case 'DECISION_PENDING':
      return 'WAIT_DECISION';
    default:
      return 'NONE';
  }
};

/** "C01234567" → "******567": only the last three characters stay readable. */
export const maskPassport = (p: string | null | undefined) => {
  const v = (p ?? '').trim();
  if (!v) return null;
  if (v.length <= 3) return '*'.repeat(v.length);
  return `${'*'.repeat(v.length - 3)}${v.slice(-3)}`;
};

export type DocState = 'MISSING' | 'UPLOADED' | 'ACCEPTED' | 'REJECTED';

const docState = (docs: { status: DocStatus }[]): DocState => {
  if (docs.some((d) => d.status === 'ACCEPTED')) return 'ACCEPTED';
  const latest = docs[0];
  if (!latest) return 'MISSING';
  return latest.status === 'REJECTED' ? 'REJECTED' : 'UPLOADED';
};

/** Required requirements of the stage the client is uploading to that have no usable document yet. */
const missingCount = (status: CaseStatus, reqs: { stage: string; required: boolean; documents: { status: DocStatus }[] }[]) => {
  const stage = CLIENT_UPLOAD_STAGE[status];
  if (!stage) return 0;
  return reqs.filter((r) => r.stage === stage && r.required && !r.documents.some((d) => d.status !== 'REJECTED')).length;
};

const LIST_SELECT = {
  id: true,
  number: true,
  visaType: true,
  visaCategoryId: true,
  status: true,
  processingStage: true,
  createdAt: true,
  updatedAt: true,
  appointmentAt: true,
  decisionAt: true,
  client: { select: { firstName: true, lastName: true, passportNumber: true } },
  visaCategory: { select: { title: true, visaLabel: true } },
  requirements: { select: { stage: true, required: true, documents: { select: { status: true } } } },
  contract: { select: { signedAt: true, signatureRequestId: true } },
} satisfies Prisma.CaseSelect;

type ListCase = Prisma.CaseGetPayload<{ select: typeof LIST_SELECT }>;

const listView = (c: ListCase, turns?: Map<string, ContractTurn | null>) => {
  const missing = missingCount(c.status, c.requirements);
  return {
    id: c.id,
    number: c.number,
    client: { firstName: c.client.firstName, lastName: c.client.lastName, passport: maskPassport(c.client.passportNumber) },
    visaType: c.visaType,
    visaCategory: c.visaCategory ? { title: c.visaCategory.title, visaLabel: c.visaCategory.visaLabel } : null,
    /** Visa kind for the filter: `cat:<visaCategoryId>` or `type:<VisaType>`. */
    visaKey: visaKeyOf(c),
    /** Visa refused (REJECTED, or marked "Ablehnung" by the team). */
    refused: isRefused(c),
    status: c.status,
    step: stepOf(c.status),
    nextAction: nextActionOf(c.status, missing, turns?.get(c.id)),
    missingDocuments: missing,
    appointmentAt: c.appointmentAt,
    decisionAt: c.decisionAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
};

/** List rows (newest first) with the client id, for the partner's client list (lib/partners/owned.ts). */
export const caseListView = async (where: Prisma.CaseWhereInput) => {
  const rows = await prisma.case.findMany({ where, orderBy: { createdAt: 'desc' }, take: 2000, select: { ...LIST_SELECT, clientId: true } });
  const turns = await loadContractTurns(rows);
  return rows.map((c) => ({ ...listView(c, turns), clientId: c.clientId }));
};

export const ACTIVE_FILTER = ['active', 'closed', 'all'] as const;

/** Visa key → where-clause (`cat:<id>` / `type:<VisaType>`; a type key means "that type without a category"). */
export const visaKeyWhere = (key: string | undefined): Prisma.CaseWhereInput => {
  if (!key) return {};
  if (key.startsWith('cat:')) return { visaCategoryId: key.slice(4) };
  const type = key.slice(5) as VisaType;
  if (key.startsWith('type:') && (Object.values(VisaTypes) as string[]).includes(type)) return { visaType: type, visaCategoryId: null };
  return { id: '__none__' };
};

export interface VisaFacet {
  key: string;
  visaType: string;
  visaCategory: { title: unknown; visaLabel: string } | null;
  count: number;
  active: number;
  approved: number;
  refused: number;
}

/** Counts per visa kind (category, else type) over the given cases — the filter chips of the partner views. */
export const visaFacets = async (where: Prisma.CaseWhereInput): Promise<VisaFacet[]> => {
  const rows = await prisma.case.findMany({ where, select: { visaType: true, visaCategoryId: true, status: true, processingStage: true, visaCategory: { select: { title: true, visaLabel: true } } } });
  const out = new Map<string, VisaFacet>();
  for (const r of rows) {
    const key = visaKeyOf(r);
    if (!out.has(key)) out.set(key, { key, visaType: r.visaType, visaCategory: r.visaCategory ? { title: r.visaCategory.title, visaLabel: r.visaCategory.visaLabel } : null, count: 0, active: 0, approved: 0, refused: 0 });
    const f = out.get(key)!;
    f.count++;
    if (isRefused(r)) f.refused++;
    else if (r.status === 'APPROVED') f.approved++;
    else if (r.status !== 'CANCELLED') f.active++;
  }
  return [...out.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

export const listPartnerCases = async (partnerId: string, q: { search?: string; filter: (typeof ACTIVE_FILTER)[number]; visa?: string }) => {
  const final: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];
  const where: Prisma.CaseWhereInput = {
    partnerId,
    ...visaKeyWhere(q.visa),
    ...(q.filter === 'active' ? { status: { notIn: final } } : q.filter === 'closed' ? { status: { in: final } } : {}),
    ...(q.search
      ? {
          OR: [
            { number: { contains: q.search } },
            { client: { firstName: { contains: q.search } } },
            { client: { lastName: { contains: q.search } } },
          ],
        }
      : {}),
  };
  const rows = await prisma.case.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500, select: LIST_SELECT });
  const turns = await loadContractTurns(rows);
  return rows.map((c) => listView(c, turns));
};

/** The partner's own case or 404 (another partner's case looks exactly like a missing one). */
export const partnerCaseOr404 = async (partnerId: string, caseId: string) => {
  const c = await prisma.case.findFirst({ where: { id: caseId, partnerId }, select: { id: true, status: true, clientId: true, number: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return c;
};

/** `partnerUserIds`: the logins whose uploads count as "ours" (the partner and its team members, lib/partnerAccess). */
export const partnerCaseDetail = async (partnerId: string, caseId: string, partnerUserIds: string | string[]) => {
  const ours = new Set(Array.isArray(partnerUserIds) ? partnerUserIds : [partnerUserIds]);
  const c = await prisma.case.findFirst({
    where: { id: caseId, partnerId },
    select: {
      ...LIST_SELECT,
      appointmentPlace: true,
      visaValidFrom: true,
      visaValidTo: true,
      requirements: {
        orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
        select: {
          id: true,
          stage: true,
          title: true,
          description: true,
          required: true,
          documents: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, status: true, reviewNote: true, originalName: true, createdAt: true, uploadedById: true },
          },
        },
      },
      events: {
        where: { visibleToClient: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
        // No notes and no actor: staff remarks stay internal.
        select: { id: true, type: true, fromStatus: true, toStatus: true, createdAt: true },
      },
    },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  // The same rules as the client's own upload (lib/clientUploadTarget): the open upload step, a replacement for a
  // rejected document after the hand-in, and embassy documents early while the case waits for the contract.
  const earlyEmbassy = await earlyEmbassyOpenFor(c);
  const uploadStage = CLIENT_UPLOAD_STAGE[c.status] ?? (earlyEmbassy ? 'EMBASSY' : null);
  return {
    ...listView(c, await loadContractTurns([c])),
    appointmentPlace: c.appointmentPlace,
    visaValidFrom: c.visaValidFrom,
    visaValidTo: c.visaValidTo,
    uploadStage,
    timeline: c.events,
    requirements: c.requirements
      .filter((r) => r.stage === 'INITIAL' || r.stage === 'EMBASSY')
      .map((r) => {
        const state = docState(r.documents);
        const latest = r.documents[0];
        return {
          id: r.id,
          stage: r.stage,
          title: r.title,
          description: r.description,
          required: r.required,
          state,
          // The client-facing reason of the latest rejection (shown to the client too).
          rejectionReason: state === 'REJECTED' ? (latest?.reviewNote ?? null) : null,
          canUpload: partnerCanUpload(c.status, r, { earlyEmbassy }),
          documentCount: r.documents.length,
          // File names only of what the partner uploaded themself.
          myUploads: r.documents
            .filter((d) => !!d.uploadedById && ours.has(d.uploadedById))
            .map((d) => ({ id: d.id, name: d.originalName, status: d.status, createdAt: d.createdAt })),
        };
      }),
  };
};

/**
 * Whether the partner may upload for this requirement right now: where the client could upload
 * (clientUploadStageFor) and the requirement is not accepted yet. Pure.
 */
export const partnerCanUpload = (
  status: CaseStatus,
  r: { stage: DocStage; documents: { status: DocStatus }[] },
  ctx: { earlyEmbassy?: boolean } = {},
) => docState(r.documents) !== 'ACCEPTED' && !!clientUploadStageFor(status, r, ctx);

/**
 * Stores a document a partner uploads on behalf of their client: the same rules as the client's own
 * upload (lib/clientUploadTarget: open upload step, replacement of a rejected document, early embassy documents;
 * content sniffing done by the caller, automatic quality checks), attributed to the partner user and left PENDING
 * for the normal staff review. Replacements and early embassy uploads tell the staff (no hand-in follows).
 */
export const storePartnerUpload = async (input: {
  partnerId: string;
  caseId: string;
  requirementId: string;
  userId: string;
  file: { originalName: string; storedName: string; mimeType: string; size: number };
}) => {
  const c = await partnerCaseOr404(input.partnerId, input.caseId);
  const target = await resolveClientUploadTarget(c, input.requirementId);
  if (!target && !CLIENT_UPLOAD_STAGE[c.status]) throw conflict('UPLOAD_NOT_ALLOWED');
  if (!target) throw badRequest('INVALID_REQUIREMENT');
  const { stage, requirement } = target;
  const doc = await prisma.document.create({
    data: {
      caseId: c.id,
      requirementId: requirement.id,
      stage,
      originalName: input.file.originalName.slice(0, 200),
      storedName: input.file.storedName,
      mimeType: input.file.mimeType,
      size: input.file.size,
      uploadedById: input.userId,
    },
  });
  await prisma.caseEvent.create({
    data: { caseId: c.id, type: 'DOCUMENT_UPLOADED', note: `${doc.originalName} (partnyor)`, actorId: input.userId, visibleToClient: false },
  });
  void emitAutomationEvent({ type: 'DOCUMENT_UPLOADED', entityType: 'document', entityId: doc.id, caseId: c.id }); // automation hook
  if (target.replacement) await notifyReplacement(c, requirement, `${doc.originalName} (partnyor)`);
  if (target.early) await notifyEarlyEmbassyUpload(c, requirement, `${doc.originalName} (partnyor)`);
  const checks = await checkCaseDocument(doc.id);
  return { document: { id: doc.id, name: doc.originalName, status: doc.status, createdAt: doc.createdAt }, checks, caseNumber: c.number };
};
