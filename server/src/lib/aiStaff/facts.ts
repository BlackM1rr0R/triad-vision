import type { Locale } from '@prisma/client';
import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import { l10nTitle } from '../expiry/index.js';
import { evaluateRisks, loadRiskFacts } from './risk.js';

/**
 * Compact, structured facts of one case for the AI (summary, reply draft): status and since when, the
 * document picture, last messages (trimmed), open tasks, appointment, expiring documents, signatures,
 * translations and the deterministic risks. Absolute dates only, so the same case state gives the same
 * facts (and the same cache hash) on another day.
 */

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const minute = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') : null);
const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const DAY = 24 * 60 * 60 * 1000;

export interface CaseFacts {
  case: {
    number: string;
    status: string;
    visaType: string;
    profession: string;
    category: string | null;
    openedAt: string | null;
    statusSince: string | null;
    staff: string | null;
    partner: string | null;
    appointment: { at: string | null; place: string | null } | null;
    decision: { at: string | null; reason: string } | null;
    visaValidTo: string | null;
    noteToClient: string | null;
  };
  client: { name: string; firstName: string; locale: Locale };
  documents: {
    accepted: number;
    missing: string[];
    waitingReview: string[];
    rejected: { doc: string; note: string }[];
  };
  expiring: { doc: string; date: string | null }[];
  messages: { from: 'client' | 'staff'; at: string | null; text: string }[];
  clientWaitingForReply: boolean;
  lastClientContact: string | null;
  tasks: { title: string; due: string | null; status: string }[];
  signatures: { title: string; status: string; expires: string | null }[];
  translations: { number: string; status: string; due: string | null }[];
  recentEvents: { type: string; to: string | null; at: string | null; note?: string }[];
  risks: { code: string; severity: string; date?: string; detail?: string }[];
}

export const buildCaseFacts = async (caseId: string, locale: Locale, opts: { messages?: number; now?: Date } = {}): Promise<CaseFacts> => {
  const now = opts.now ?? new Date();
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, locale: true } },
      assignedStaff: { select: { firstName: true, lastName: true } },
      partner: { select: { name: true } },
      visaCategory: { select: { title: true } },
      requirements: {
        where: { stage: { in: ['INITIAL', 'EMBASSY'] } },
        orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
        select: { stage: true, title: true, required: true, documents: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, reviewNote: true } } },
      },
      documents: { where: { expiresAt: { not: null, lte: new Date(now.getTime() + 180 * DAY) } }, select: { originalName: true, expiresAt: true, status: true, requirement: { select: { title: true } } } },
      events: { orderBy: { createdAt: 'desc' }, take: 8, select: { type: true, toStatus: true, createdAt: true, note: true, visibleToClient: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: opts.messages ?? 6, select: { authorId: true, body: true, createdAt: true } },
      tasks: { where: { status: { notIn: ['DONE', 'CANCELLED'] } }, orderBy: { dueAt: 'asc' }, take: 5, select: { title: true, dueAt: true, status: true } },
      signatureRequests: { where: { status: { in: ['SENT', 'DECLINED', 'EXPIRED'] } }, orderBy: { createdAt: 'desc' }, take: 3, select: { title: true, status: true, expiresAt: true } },
      translationOrders: { where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } }, take: 3, select: { number: true, status: true, dueAt: true } },
    },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');

  const [riskFacts] = await loadRiskFacts({ id: c.id });
  const risks = riskFacts ? evaluateRisks(riskFacts, now) : [];
  const statusSince = await prisma.caseEvent.findFirst({ where: { caseId: c.id, toStatus: c.status }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });

  const title = (t: unknown, fallback = '') => l10nTitle(t, locale) || fallback;
  // Embassy documents matter once the case reached that stage (or the client already uploaded some).
  const early = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'].includes(c.status);
  const reqs = c.requirements.filter((r) => r.stage === 'INITIAL' || r.documents.length || !early);
  const latest = (r: (typeof reqs)[number]) => r.documents[0];
  const messages = [...c.messages].reverse();
  const last = c.messages[0];
  const lastClient = c.messages.find((m) => m.authorId === c.clientId);

  return {
    case: {
      number: c.number,
      status: c.status,
      visaType: c.visaType,
      profession: clip(c.profession, 80),
      category: c.visaCategory ? title(c.visaCategory.title) || null : null,
      openedAt: day(c.createdAt),
      statusSince: day(statusSince?.createdAt ?? c.updatedAt),
      staff: c.assignedStaff ? `${c.assignedStaff.firstName} ${c.assignedStaff.lastName}`.trim() : null,
      partner: c.partner?.name ?? null,
      appointment: c.appointmentAt ? { at: minute(c.appointmentAt), place: c.appointmentPlace ? clip(c.appointmentPlace, 100) : null } : null,
      decision: c.decisionAt ? { at: day(c.decisionAt), reason: clip(c.decisionReason, 200) } : null,
      visaValidTo: day(c.visaValidTo),
      noteToClient: c.staffNote ? clip(c.staffNote, 200) : null,
    },
    client: { name: `${c.client.firstName} ${c.client.lastName}`.trim(), firstName: c.client.firstName, locale: c.client.locale },
    documents: {
      accepted: reqs.filter((r) => latest(r)?.status === 'ACCEPTED').length,
      missing: reqs.filter((r) => r.required && !latest(r)).map((r) => clip(title(r.title), 60)).slice(0, 12),
      waitingReview: reqs.filter((r) => latest(r)?.status === 'PENDING').map((r) => clip(title(r.title), 60)).slice(0, 12),
      rejected: reqs
        .filter((r) => latest(r)?.status === 'REJECTED')
        .map((r) => ({ doc: clip(title(r.title), 60), note: clip(latest(r)?.reviewNote, 120) }))
        .slice(0, 8),
    },
    expiring: c.documents
      .filter((d) => d.status !== 'REJECTED')
      .map((d) => ({ doc: clip(title(d.requirement?.title, d.originalName), 60), date: day(d.expiresAt) }))
      .slice(0, 5),
    messages: messages.map((m) => ({ from: m.authorId === c.clientId ? ('client' as const) : ('staff' as const), at: minute(m.createdAt), text: clip(m.body, 400) })),
    clientWaitingForReply: !!last && last.authorId === c.clientId,
    lastClientContact: minute(lastClient?.createdAt ?? null),
    tasks: c.tasks.map((t) => ({ title: clip(t.title, 80), due: day(t.dueAt), status: t.status })),
    signatures: c.signatureRequests.map((s) => ({ title: clip(s.title, 60), status: s.status, expires: day(s.expiresAt) })),
    translations: c.translationOrders.map((t) => ({ number: `TR-${String(t.number).padStart(4, '0')}`, status: t.status, due: day(t.dueAt) })),
    recentEvents: c.events.map((e) => ({ type: e.type, to: e.toStatus, at: day(e.createdAt), ...(e.note ? { note: clip(e.note, 100) } : {}) })),
    risks: risks.map((r) => ({ code: r.code, severity: r.severity, ...(r.date ? { date: r.date } : {}), ...(r.detail ? { detail: r.detail } : {}) })),
  };
};
