import { prisma } from '../db.js';
import { notFound } from './http.js';

type DetailForStats = {
  status: string;
  createdAt: Date;
  decisionAt: Date | null;
  clientId: string;
  events: { type: string; toStatus: string | null; createdAt: Date; actor: { role: string } | null }[];
  messages: { authorId: string; createdAt: Date }[];
  requirements: { stage: string; required: boolean; documents: { status: string; createdAt: Date; size: number }[] }[];
  otherDocuments: { size: number }[];
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Figures derived from a loaded case (never stored): how long each step took, document and message
 * balance, who acted last. Used by the admin case page and the super-admin oversight views.
 */
export const caseStats = (c: DetailForStats) => {
  const now = Date.now();
  // Status history oldest → newest from status-changing events, then durations between them.
  const changes = [...c.events].filter((e) => e.toStatus).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const statusHistory = changes.map((e, i) => {
    const end = i + 1 < changes.length ? changes[i + 1].createdAt.getTime() : now;
    return { status: e.toStatus as string, enteredAt: e.createdAt, days: Math.round(((end - e.createdAt.getTime()) / DAY) * 10) / 10, current: i + 1 === changes.length };
  });
  const docs = c.requirements.flatMap((r) => r.documents);
  const requiredReqs = c.requirements.filter((r) => r.required);
  const clientMsgs = c.messages.filter((m) => m.authorId === c.clientId);
  const staffMsgs = c.messages.filter((m) => m.authorId !== c.clientId);
  const lastClientMsg = clientMsgs.at(-1)?.createdAt ?? null;
  const lastStaffMsg = staffMsgs.at(-1)?.createdAt ?? null;
  const lastEvent = c.events.reduce<DetailForStats['events'][number] | null>((m, e) => (!m || e.createdAt > m.createdAt ? e : m), null);
  const currentSince = statusHistory.at(-1)?.enteredAt ?? c.createdAt;
  return {
    ageDays: Math.floor((now - c.createdAt.getTime()) / DAY),
    daysInStatus: Math.floor((now - currentSince.getTime()) / DAY),
    statusSince: currentSince,
    statusHistory,
    statusChanges: changes.length,
    daysToDecision: c.decisionAt ? Math.round(((c.decisionAt.getTime() - c.createdAt.getTime()) / DAY) * 10) / 10 : null,
    documents: {
      total: docs.length + c.otherDocuments.length,
      pending: docs.filter((d) => d.status === 'PENDING').length,
      accepted: docs.filter((d) => d.status === 'ACCEPTED').length,
      rejected: docs.filter((d) => d.status === 'REJECTED').length,
      bytes: docs.reduce((a, d) => a + d.size, 0) + c.otherDocuments.reduce((a, d) => a + d.size, 0),
      requiredTotal: requiredReqs.length,
      requiredAccepted: requiredReqs.filter((r) => r.documents.some((d) => d.status === 'ACCEPTED')).length,
      lastUploadAt: docs.reduce<Date | null>((m, d) => (!m || d.createdAt > m ? d.createdAt : m), null),
    },
    messages: {
      total: c.messages.length,
      fromClient: clientMsgs.length,
      fromStaff: staffMsgs.length,
      lastClientAt: lastClientMsg,
      lastStaffAt: lastStaffMsg,
      awaitingStaffReply: !!lastClientMsg && (!lastStaffMsg || lastClientMsg > lastStaffMsg),
    },
    lastActivity: lastEvent ? { type: lastEvent.type, at: lastEvent.createdAt, byRole: lastEvent.actor?.role ?? null } : null,
    eventsTotal: c.events.length,
  };
};

/** Full case detail used by both the client portal and the admin panel. */
export const loadCaseDetail = async (caseId: string, opts: { forStaff: boolean }) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, locale: true } },
      assignedStaff: { select: { id: true, firstName: true, lastName: true } },
      visaCategory: { select: { id: true, slug: true, title: true, visaLabel: true } },
      requirements: {
        orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
        include: { documents: { orderBy: { createdAt: 'desc' } } },
      },
      documents: { where: { requirementId: null }, orderBy: { createdAt: 'desc' } },
      contract: true,
      events: {
        where: opts.forStaff ? {} : { visibleToClient: true },
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { firstName: true, lastName: true, role: true } } },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
      },
    },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');

  const docIds = [c.contract?.fileDocumentId, c.contract?.signedDocumentId].filter(Boolean) as string[];
  const contractDocs = docIds.length ? await prisma.document.findMany({ where: { id: { in: docIds } } }) : [];
  const byId = new Map(contractDocs.map((d) => [d.id, d]));

  return {
    ...c,
    contract: c.contract && {
      ...c.contract,
      file: byId.get(c.contract.fileDocumentId) ?? null,
      signedFile: c.contract.signedDocumentId ? byId.get(c.contract.signedDocumentId) ?? null : null,
      signerIp: opts.forStaff ? c.contract.signerIp : undefined,
      signerUserAgent: opts.forStaff ? c.contract.signerUserAgent : undefined,
    },
    // Documents not tied to a requirement (contract, visa scan, other files uploaded by staff, embassy packages)
    otherDocuments: c.documents.filter((d) => d.stage === 'VISA' || d.stage === 'OTHER' || d.stage === 'EMBASSY'),
    documents: undefined,
  };
};
