import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { CLIENT_UPLOAD_STAGE } from '../caseFlow.js';
import { getClientProcessSettings, type ClientProcessSettings, type Eta, type EtaStatus } from './settings.js';

/**
 * "Top kimdədir?" — who must act next on a case: the client, the team or the embassy. Derived
 * deterministically (never stored) from the case status, the documents of the open upload step, the
 * contract, open client tasks, unsigned signature requests, unanswered messages and the embassy appointment.
 * The ETA of the team / embassy comes from the configurable typical durations (lib/clientProcess/settings).
 * One batch of queries for any number of cases (cases list: no N+1).
 */

export type BallSide = 'CLIENT' | 'TEAM' | 'EMBASSY' | 'NONE';

export type BallReason =
  // client
  | 'UPLOAD_DOCS'
  | 'FIX_DOCS'
  | 'SUBMIT_DOCS'
  | 'SIGN_CONTRACT'
  | 'SIGN_DOCUMENTS'
  | 'CLIENT_TASKS'
  | 'ATTEND_APPOINTMENT'
  // team
  | 'REVIEW_DOCS'
  | 'CHECK_SIGNATURE'
  | 'LODGE_APPLICATION'
  | 'REPLY_MESSAGE'
  // embassy
  | 'DECISION'
  // closed
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface BallItem {
  side: Exclude<BallSide, 'NONE'>;
  reason: BallReason;
  count: number;
  dueAt: string | null;
  overdue: boolean;
}

export interface BallSegment {
  side: BallSide;
  from: string;
  to: string | null;
  days: number;
}

export interface BallInCourt {
  side: BallSide;
  reason: BallReason;
  count: number;
  /** Client deadline (nearest task due date / appointment) or, for the team / embassy, the expected end. */
  dueAt: string | null;
  overdue: boolean;
  /** Since when the ball is on this side. */
  since: string;
  days: number;
  /** Typical duration while the team / embassy holds the ball. */
  eta: (Eta & { expectedBy: string; late: boolean }) | null;
  /** Every open item, primary first (e.g. the client also has a task while the team reviews). */
  items: BallItem[];
  /** How long the ball was on each side (days, rounded to 0.1). */
  totals: Record<'CLIENT' | 'TEAM' | 'EMBASSY', number>;
  timeline?: BallSegment[];
}

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const round1 = (n: number) => Math.round(n * 10) / 10;

const STATUS_SIDE: Record<CaseStatus, BallSide> = {
  DOCUMENTS_PENDING: 'CLIENT',
  DOCUMENTS_REVIEW: 'TEAM',
  CONTRACT_SENT: 'CLIENT',
  CONTRACT_SIGNED: 'TEAM',
  EMBASSY_DOCUMENTS: 'CLIENT',
  EMBASSY_REVIEW: 'TEAM',
  APPOINTMENT_SCHEDULED: 'CLIENT', // until the appointment; the team after it
  DECISION_PENDING: 'EMBASSY',
  APPROVED: 'NONE',
  REJECTED: 'NONE',
  CANCELLED: 'NONE',
};

const CLIENT_ORDER: BallReason[] = ['FIX_DOCS', 'UPLOAD_DOCS', 'SUBMIT_DOCS', 'SIGN_CONTRACT', 'ATTEND_APPOINTMENT', 'SIGN_DOCUMENTS', 'CLIENT_TASKS'];
const TEAM_ORDER: BallReason[] = ['REVIEW_DOCS', 'CHECK_SIGNATURE', 'LODGE_APPLICATION', 'REPLY_MESSAGE'];

export interface BallFacts {
  id: string;
  status: CaseStatus;
  createdAt: Date;
  appointmentAt: Date | null;
  processing: { min: number | null; max: number | null };
  contract: { signedAt: Date | null; signatureRequestId: string | null } | null;
  /** Required requirements of the open upload stage with their documents' statuses (newest first). */
  uploadReqs: { docs: string[] }[];
  pendingDocs: number;
  tasks: { dueAt: Date | null }[];
  pendingSignatures: number;
  lastClientMsg: Date | null;
  lastStaffMsg: Date | null;
  statusEvents: { toStatus: CaseStatus; at: Date }[];
}

const sideAt = (status: CaseStatus, at: number, appointmentAt: Date | null): BallSide =>
  status === 'APPOINTMENT_SCHEDULED' && appointmentAt && at >= appointmentAt.getTime() ? 'TEAM' : STATUS_SIDE[status];

/** Segments of consecutive sides from the status history (APPOINTMENT_SCHEDULED splits at the appointment). */
export const buildTimeline = (f: Pick<BallFacts, 'status' | 'createdAt' | 'appointmentAt' | 'statusEvents'>, now: Date): BallSegment[] => {
  const events = [...f.statusEvents].sort((a, b) => a.at.getTime() - b.at.getTime());
  if (!events.length || events[0].at.getTime() > f.createdAt.getTime() + 1000) events.unshift({ toStatus: events[0]?.toStatus ?? f.status, at: f.createdAt });
  const raw: { side: BallSide; from: number; to: number }[] = [];
  events.forEach((e, i) => {
    const end = i + 1 < events.length ? events[i + 1].at.getTime() : now.getTime();
    const start = e.at.getTime();
    if (end <= start && i + 1 < events.length) return;
    const appt = f.appointmentAt?.getTime();
    if (e.toStatus === 'APPOINTMENT_SCHEDULED' && appt && appt > start && appt < end) {
      raw.push({ side: 'CLIENT', from: start, to: appt }, { side: 'TEAM', from: appt, to: end });
    } else {
      raw.push({ side: sideAt(e.toStatus, start, f.appointmentAt), from: start, to: end });
    }
  });
  const merged: typeof raw = [];
  for (const s of raw) {
    const last = merged.at(-1);
    if (last && last.side === s.side) last.to = s.to;
    else merged.push({ ...s });
  }
  return merged.map((s, i) => ({
    side: s.side,
    from: new Date(s.from).toISOString(),
    to: i + 1 === merged.length ? null : new Date(s.to).toISOString(),
    days: round1((s.to - s.from) / DAY),
  }));
};

const minDate = (ds: (Date | null)[]) => ds.reduce<Date | null>((m, d) => (d && (!m || d < m) ? d : m), null);

/** Pure: the ball of one case from its facts. Exported for unit tests. */
export const computeBall = (f: BallFacts, settings: ClientProcessSettings, now = new Date(), withTimeline = false): BallInCourt => {
  const items: BallItem[] = [];
  const add = (side: BallItem['side'], reason: BallReason, count: number, dueAt: Date | null = null) => {
    if (count > 0) items.push({ side, reason, count, dueAt: dueAt?.toISOString() ?? null, overdue: !!dueAt && dueAt < now });
  };

  // Client: documents of the open upload step.
  if (CLIENT_UPLOAD_STAGE[f.status]) {
    const missing = f.uploadReqs.filter((r) => r.docs.length === 0).length;
    const rejected = f.uploadReqs.filter((r) => r.docs.length > 0 && r.docs.every((d) => d === 'REJECTED')).length;
    add('CLIENT', 'FIX_DOCS', rejected);
    add('CLIENT', 'UPLOAD_DOCS', missing);
    if (!missing && !rejected) add('CLIENT', 'SUBMIT_DOCS', 1);
  }
  if (f.status === 'CONTRACT_SENT' && f.contract && !f.contract.signedAt) add('CLIENT', 'SIGN_CONTRACT', 1);
  const apptFuture = f.status === 'APPOINTMENT_SCHEDULED' && !!f.appointmentAt && f.appointmentAt > now;
  if (apptFuture) add('CLIENT', 'ATTEND_APPOINTMENT', 1, f.appointmentAt);
  // A case contract signed through the e-signature module is already counted as SIGN_CONTRACT.
  add('CLIENT', 'SIGN_DOCUMENTS', f.pendingSignatures);
  add('CLIENT', 'CLIENT_TASKS', f.tasks.length, minDate(f.tasks.map((t) => t.dueAt)));

  // Team.
  if (f.status === 'DOCUMENTS_REVIEW' || f.status === 'EMBASSY_REVIEW') add('TEAM', 'REVIEW_DOCS', Math.max(1, f.pendingDocs));
  if (f.status === 'CONTRACT_SIGNED') add('TEAM', 'CHECK_SIGNATURE', 1);
  if (f.status === 'APPOINTMENT_SCHEDULED' && !apptFuture) add('TEAM', 'LODGE_APPLICATION', 1);
  const unanswered = !!f.lastClientMsg && (!f.lastStaffMsg || f.lastClientMsg > f.lastStaffMsg);
  if (unanswered && STATUS_SIDE[f.status] !== 'NONE') add('TEAM', 'REPLY_MESSAGE', 1, new Date(f.lastClientMsg!.getTime() + 24 * HOUR));

  // Embassy.
  if (f.status === 'DECISION_PENDING') add('EMBASSY', 'DECISION', 1);

  const timeline = buildTimeline(f, now);
  const totals = { CLIENT: 0, TEAM: 0, EMBASSY: 0 };
  for (const s of timeline) if (s.side !== 'NONE') totals[s.side] = round1(totals[s.side] + s.days);
  const current = timeline.at(-1);
  const since = current ? new Date(current.from) : f.createdAt;
  const days = Math.floor((now.getTime() - since.getTime()) / DAY);

  const statusSide = sideAt(f.status, now.getTime(), f.appointmentAt);
  if (statusSide === 'NONE') {
    return {
      side: 'NONE',
      reason: f.status as 'APPROVED' | 'REJECTED' | 'CANCELLED',
      count: 0,
      dueAt: null,
      overdue: false,
      since: since.toISOString(),
      days,
      eta: null,
      items: [],
      totals,
      ...(withTimeline ? { timeline } : {}),
    };
  }

  const order = (i: BallItem) =>
    (i.side === statusSide ? 0 : 100) + (i.side === 'CLIENT' ? CLIENT_ORDER.indexOf(i.reason) : i.side === 'TEAM' ? 10 + TEAM_ORDER.indexOf(i.reason) : 20);
  items.sort((a, b) => order(a) - order(b));
  const primary = items.find((i) => i.side === statusSide) ?? { side: statusSide, reason: statusSide === 'TEAM' ? 'REVIEW_DOCS' : 'DECISION', count: 1, dueAt: null, overdue: false };

  let eta: BallInCourt['eta'] = null;
  if (statusSide === 'TEAM' || statusSide === 'EMBASSY') {
    const key = f.status as EtaStatus;
    let e: Eta = settings.eta[key] ?? settings.eta.DOCUMENTS_REVIEW;
    if (f.status === 'DECISION_PENDING' && settings.useCategoryProcessing && f.processing.max) {
      e = { minHours: (f.processing.min ?? f.processing.max) * 7 * 24, maxHours: f.processing.max * 7 * 24 };
    }
    const expectedBy = new Date(since.getTime() + e.maxHours * HOUR);
    eta = { ...e, expectedBy: expectedBy.toISOString(), late: expectedBy < now };
  }

  // Client deadline: the nearest due date among the client's items.
  const clientDue = statusSide === 'CLIENT' ? minDate(items.filter((i) => i.side === 'CLIENT' && i.dueAt).map((i) => new Date(i.dueAt!))) : null;
  const dueAt = statusSide === 'CLIENT' ? clientDue : eta ? new Date(eta.expectedBy) : null;
  return {
    side: statusSide,
    reason: primary.reason,
    count: primary.count,
    dueAt: dueAt?.toISOString() ?? null,
    overdue: statusSide === 'CLIENT' ? items.some((i) => i.side === 'CLIENT' && i.overdue) : !!eta?.late,
    since: since.toISOString(),
    days,
    eta,
    items,
    totals,
    ...(withTimeline ? { timeline } : {}),
  };
};

/** Facts of several cases with a fixed number of queries. */
export const loadBallFacts = async (caseIds: string[]): Promise<BallFacts[]> => {
  const ids = [...new Set(caseIds)];
  if (!ids.length) return [];
  const [cases, events, msgs, tasks, signers] = await Promise.all([
    prisma.case.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, status: true, createdAt: true, clientId: true, appointmentAt: true,
        visaCategory: { select: { processingMin: true, processingMax: true } },
        contract: { select: { signedAt: true, signatureRequestId: true } },
        requirements: { select: { stage: true, required: true, documents: { orderBy: { createdAt: 'desc' }, select: { status: true } } } },
        documents: { where: { status: 'PENDING', stage: { in: ['INITIAL', 'EMBASSY'] } }, select: { id: true } },
      },
    }),
    prisma.caseEvent.findMany({ where: { caseId: { in: ids }, toStatus: { not: null } }, orderBy: { createdAt: 'asc' }, select: { caseId: true, toStatus: true, createdAt: true } }),
    prisma.caseMessage.groupBy({ by: ['caseId', 'authorId'], where: { caseId: { in: ids } }, _max: { createdAt: true } }),
    prisma.clientTask.findMany({ where: { caseId: { in: ids }, status: 'OPEN' }, select: { caseId: true, dueAt: true } }),
    prisma.signatureSigner.findMany({
      where: { role: 'CANDIDATE', status: { in: ['PENDING', 'VIEWED'] }, invitedAt: { not: null }, request: { caseId: { in: ids }, status: 'SENT' } },
      select: { userId: true, request: { select: { caseId: true, isCaseContract: true } } },
    }),
  ]);
  return cases.map((c) => {
    const stage = CLIENT_UPLOAD_STAGE[c.status];
    const clientMsgs = msgs.filter((m) => m.caseId === c.id && m.authorId === c.clientId).map((m) => m._max.createdAt);
    const staffMsgs = msgs.filter((m) => m.caseId === c.id && m.authorId !== c.clientId).map((m) => m._max.createdAt);
    const max = (ds: (Date | null)[]) => ds.reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null);
    return {
      id: c.id,
      status: c.status,
      createdAt: c.createdAt,
      appointmentAt: c.appointmentAt,
      processing: { min: c.visaCategory?.processingMin ?? null, max: c.visaCategory?.processingMax ?? null },
      contract: c.contract,
      uploadReqs: stage ? c.requirements.filter((r) => r.stage === stage && r.required).map((r) => ({ docs: r.documents.map((d) => d.status) })) : [],
      pendingDocs: c.documents.length,
      tasks: tasks.filter((t) => t.caseId === c.id),
      // The case contract is counted by SIGN_CONTRACT while the case waits for it.
      pendingSignatures: signers.filter((s) => s.request.caseId === c.id && (!s.userId || s.userId === c.clientId) && !(s.request.isCaseContract && c.status === 'CONTRACT_SENT')).length,
      lastClientMsg: max(clientMsgs),
      lastStaffMsg: max(staffMsgs),
      statusEvents: events.filter((e) => e.caseId === c.id).map((e) => ({ toStatus: e.toStatus as CaseStatus, at: e.createdAt })),
    };
  });
};

/** Ball of several cases (cases list, my-work): a fixed number of queries. */
export const ballInCourtMany = async (caseIds: string[], opts: { timeline?: boolean; now?: Date } = {}) => {
  const [facts, settings] = await Promise.all([loadBallFacts(caseIds), getClientProcessSettings()]);
  const now = opts.now ?? new Date();
  return new Map(facts.map((f) => [f.id, computeBall(f, settings, now, opts.timeline)]));
};

/** Ball of one case, with the timeline (case detail payloads). Never throws (null on failure). */
export const ballInCourtFor = async (caseId: string) => {
  try {
    return (await ballInCourtMany([caseId], { timeline: true })).get(caseId) ?? null;
  } catch (err) {
    console.error('[ball-in-court] failed', caseId, err);
    return null;
  }
};
