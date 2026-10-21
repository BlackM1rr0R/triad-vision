import type { OriginalStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { ACT_ACTIONS, ACTION_LABEL, ACTION_RULES, OVERDUE_DAYS, canApply, trackingUrl, type OriginalAction } from './constants.js';
import { createAct, emailAct, rerenderAct, type Signatures } from './acts.js';

/** Originals register: create, move (events with the state machine), acts, overview and overdue items. */

const DAY = 24 * 60 * 60 * 1000;

export const originalInclude = {
  events: { orderBy: { at: 'desc' }, take: 30 },
  case: {
    select: {
      id: true,
      number: true,
      visaType: true,
      driveFolderId: true,
      assignedStaffId: true,
      assignedStaff: { select: { id: true, firstName: true, lastName: true } },
      client: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.OriginalDocumentInclude;

type OriginalRow = Prisma.OriginalDocumentGetPayload<{ include: typeof originalInclude }>;

/** When the original entered its current status (the latest event that was not a mere shelf change). */
const statusSince = (o: Pick<OriginalRow, 'events' | 'receivedAt' | 'status'>) =>
  o.events.find((e) => e.action !== 'STORED' && e.status === o.status)?.at ?? o.events[0]?.at ?? o.receivedAt;

export const overdueInfo = (o: Pick<OriginalRow, 'events' | 'receivedAt' | 'status'>, now = new Date()) => {
  const since = statusSince(o);
  const days = Math.floor((now.getTime() - since.getTime()) / DAY);
  const limit = OVERDUE_DAYS[o.status];
  return { since, days, limit: limit ?? null, overdue: limit !== undefined && days > limit };
};

const eventDto = (e: OriginalRow['events'][number]) => ({
  id: e.id,
  action: e.action,
  status: e.status,
  location: e.location,
  holder: e.holder,
  carrier: e.carrier,
  trackingNo: e.trackingNo,
  trackingUrl: trackingUrl(e.carrier, e.trackingNo),
  note: e.note,
  actNodeId: e.actNodeId,
  actorId: e.actorId,
  at: e.at,
});

export const originalDto = (o: OriginalRow, now = new Date()) => {
  const od = overdueInfo(o, now);
  return {
    id: o.id,
    caseId: o.caseId,
    title: o.title,
    kind: o.kind,
    status: o.status,
    location: o.location,
    holder: o.holder,
    carrier: o.carrier,
    trackingNo: o.trackingNo,
    trackingUrl: trackingUrl(o.carrier, o.trackingNo),
    note: o.note,
    receivedAt: o.receivedAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    statusSince: od.since,
    daysInStatus: od.days,
    overdue: od.overdue,
    overdueLimit: od.limit,
    case: {
      id: o.case.id,
      number: o.case.number,
      visaType: o.case.visaType,
      driveFolderId: o.case.driveFolderId,
      client: { id: o.case.client.id, name: `${o.case.client.firstName} ${o.case.client.lastName}`.trim() },
      staff: o.case.assignedStaff ? { id: o.case.assignedStaff.id, name: `${o.case.assignedStaff.firstName} ${o.case.assignedStaff.lastName}`.trim() } : null,
    },
    events: o.events.map(eventDto),
  };
};

export const loadOriginal = async (id: string) => {
  const o = await prisma.originalDocument.findUnique({ where: { id }, include: originalInclude });
  if (!o) throw notFound('ORIGINAL_NOT_FOUND');
  return o;
};

export const listForCase = async (caseId: string) => {
  const rows = await prisma.originalDocument.findMany({ where: { caseId }, include: originalInclude, orderBy: { receivedAt: 'asc' } });
  return rows.map((r) => originalDto(r));
};

export interface OverviewFilter {
  status?: OriginalStatus;
  location?: string;
  staff?: string;
  q?: string;
  overdue?: boolean;
  caseId?: string;
}

export const overview = async (f: OverviewFilter, now = new Date()) => {
  const and: Prisma.OriginalDocumentWhereInput[] = [];
  if (f.status) and.push({ status: f.status });
  if (f.caseId) and.push({ caseId: f.caseId });
  if (f.location) and.push({ location: { contains: f.location } });
  if (f.staff === 'none') and.push({ case: { assignedStaffId: null } });
  else if (f.staff) and.push({ case: { assignedStaffId: f.staff } });
  if (f.q) {
    const q = f.q.trim();
    and.push({
      OR: [
        { title: { contains: q } },
        { holder: { contains: q } },
        { trackingNo: { contains: q } },
        { case: { number: { contains: q } } },
        { case: { client: { firstName: { contains: q } } } },
        { case: { client: { lastName: { contains: q } } } },
      ],
    });
  }
  if (f.overdue) and.push({ status: { in: Object.keys(OVERDUE_DAYS) as OriginalStatus[] } });
  const rows = await prisma.originalDocument.findMany({ where: { AND: and }, include: originalInclude, orderBy: { updatedAt: 'desc' }, take: 1000 });
  const items = rows.map((r) => originalDto(r, now)).filter((o) => !f.overdue || o.overdue);
  const counts = await prisma.originalDocument.groupBy({ by: ['status'], _count: { _all: true } });
  return { items, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<OriginalStatus, number>> };
};

/** Every overdue original (GIVEN_OUT > 7 d, AT_APOSTILLE > 21 d, IN_TRANSIT > 10 d). */
export const overdueOriginals = async (now = new Date()) => {
  const rows = await prisma.originalDocument.findMany({ where: { status: { in: Object.keys(OVERDUE_DAYS) as OriginalStatus[] } }, include: originalInclude, take: 5000 });
  return rows.filter((r) => overdueInfo(r, now).overdue);
};

// ─── Writes ──────────────────────────────────────────────────────────────

export interface ActOptions {
  /** false = no act even for RECEIVED / GIVEN_OUT / RETURNED_TO_CLIENT. */
  generate?: boolean;
  condition?: string | null;
  signatures?: Signatures;
  email?: boolean;
}

export interface NewOriginal {
  title: string;
  kind: string;
  note?: string | null;
}

const actItemsOf = (rows: { kind: string; title: string; note?: string | null }[]) => rows.map((r) => ({ kind: r.kind, title: r.title, note: r.note ?? null }));

const finishAct = async (
  caseId: string,
  action: OriginalAction,
  at: Date,
  items: { kind: string; title: string; note?: string | null }[],
  eventIds: string[],
  opts: ActOptions & { holder?: string | null; actorId: string },
) => {
  if (opts.generate === false || !ACT_ACTIONS.includes(action)) return null;
  const act = await createAct({ caseId, action, at, items: actItemsOf(items), holder: opts.holder, condition: opts.condition, signatures: opts.signatures, actorId: opts.actorId });
  await prisma.originalEvent.updateMany({ where: { id: { in: eventIds } }, data: { actNodeId: act.nodeId } });
  let emailed = false;
  if (opts.email) emailed = await emailAct(caseId, act.pdf, act.name);
  return { nodeId: act.nodeId, name: act.name, emailed };
};

/** Receives one or several originals from the client (RECEIVED events, one act for all of them). */
export const receiveOriginals = async (
  caseId: string,
  items: NewOriginal[],
  opts: ActOptions & { location?: string | null; receivedAt?: Date; actorId: string },
) => {
  if (!items.length) throw badRequest('NO_ITEMS');
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const at = opts.receivedAt ?? new Date();
  const created = await prisma.$transaction(async (tx) => {
    const out: { id: string; eventId: string; kind: string; title: string; note: string | null }[] = [];
    for (const it of items) {
      const o = await tx.originalDocument.create({
        data: { caseId, title: it.title, kind: it.kind, status: 'IN_OFFICE', location: opts.location ?? null, note: it.note ?? null, receivedAt: at, createdById: opts.actorId },
      });
      const e = await tx.originalEvent.create({
        data: { originalId: o.id, action: 'RECEIVED', status: 'IN_OFFICE', location: opts.location ?? null, note: opts.condition ?? null, actorId: opts.actorId, at },
      });
      out.push({ id: o.id, eventId: e.id, kind: o.kind, title: o.title, note: o.note });
    }
    return out;
  });
  const act = await finishAct(caseId, 'RECEIVED', at, created, created.map((c2) => c2.eventId), opts);
  return { ids: created.map((x) => x.id), act };
};

export interface EventPayload {
  location?: string | null;
  holder?: string | null;
  carrier?: string | null;
  trackingNo?: string | null;
  note?: string | null;
  at?: Date;
}

/**
 * Applies one movement to one or several originals of the same case. All must allow the transition
 * (else 409 INVALID_TRANSITION, nothing changes). Act actions produce one act for all of them.
 */
export const applyAction = async (ids: string[], action: OriginalAction, p: EventPayload, opts: ActOptions & { actorId: string }) => {
  const unique = [...new Set(ids)];
  if (!unique.length) throw badRequest('NO_ITEMS');
  const rows = await prisma.originalDocument.findMany({ where: { id: { in: unique } } });
  if (rows.length !== unique.length) throw notFound('ORIGINAL_NOT_FOUND');
  const caseIds = new Set(rows.map((r) => r.caseId));
  if (caseIds.size > 1) throw badRequest('ORIGINALS_OF_DIFFERENT_CASES');
  const rule = ACTION_RULES[action];
  for (const r of rows) if (!canApply(r.status, action)) throw conflict('INVALID_TRANSITION', `${action} is not allowed from ${r.status}`);
  for (const need of rule.needs ?? []) if (!p[need]?.trim()) throw badRequest(`${need.toUpperCase()}_REQUIRED`);

  const at = p.at ?? new Date();
  const status = rule.to;
  // What the original row keeps: location only in the office, holder only when given out, courier data in transit.
  const data: Prisma.OriginalDocumentUpdateManyMutationInput = { status };
  if (status === 'IN_OFFICE') {
    data.holder = null;
    if (p.location?.trim()) data.location = p.location.trim();
  }
  if (action === 'GIVEN_OUT') data.holder = p.holder!.trim();
  if (action === 'SENT_TO_APOSTILLE') data.holder = p.holder?.trim() || p.location?.trim() || p.carrier?.trim() || null;
  if (action === 'SENT_BY_COURIER') {
    data.carrier = p.carrier!.trim();
    data.trackingNo = p.trackingNo?.trim() || null;
    data.holder = p.holder?.trim() || null;
  }
  if (action === 'RETURNED_TO_CLIENT') {
    data.holder = null;
    data.location = null;
  }

  const eventIds = await prisma.$transaction(async (tx) => {
    const moved = await tx.originalDocument.updateMany({ where: { id: { in: unique }, status: { in: rule.from } }, data });
    if (moved.count !== unique.length) throw conflict('INVALID_TRANSITION');
    const out: string[] = [];
    for (const r of rows) {
      const e = await tx.originalEvent.create({
        data: {
          originalId: r.id,
          action,
          status,
          location: p.location?.trim() || null,
          holder: p.holder?.trim() || null,
          carrier: p.carrier?.trim() || null,
          trackingNo: p.trackingNo?.trim() || null,
          note: p.note?.trim() || opts.condition?.trim() || null,
          actorId: opts.actorId,
          at,
        },
      });
      out.push(e.id);
    }
    return out;
  });
  const caseId = rows[0].caseId;
  const act = await finishAct(caseId, action, at, rows, eventIds, { ...opts, holder: p.holder });
  return { ids: unique, eventIds, act };
};

/**
 * Signs an existing act on screen: the PDF is rendered again with the signature PNGs and saved as a new
 * version of the same drive file (every event of that hand-over keeps its link).
 */
export const signAct = async (eventId: string, signatures: Signatures, actorId: string, email = false) => {
  const ev = await prisma.originalEvent.findUnique({ where: { id: eventId }, include: { original: true } });
  if (!ev) throw notFound('EVENT_NOT_FOUND');
  if (!ev.actNodeId) throw badRequest('NO_ACT');
  const node = await prisma.driveNode.findUnique({ where: { id: ev.actNodeId }, select: { id: true, name: true, deletedAt: true, finalAt: true } });
  if (!node || node.deletedAt) throw notFound('ACT_NOT_FOUND');
  if (node.finalAt) throw conflict('FILE_FINAL');
  const group = await prisma.originalEvent.findMany({ where: { actNodeId: ev.actNodeId }, include: { original: true }, orderBy: { at: 'asc' } });
  const pdf = await rerenderAct(node.id, {
    caseId: ev.original.caseId,
    action: ev.action as OriginalAction,
    at: ev.at,
    items: actItemsOf(group.map((g) => g.original)),
    holder: ev.holder,
    condition: ev.note,
    signatures,
    actorId: ev.actorId ?? actorId,
  });
  const emailed = email ? await emailAct(ev.original.caseId, pdf, node.name) : false;
  return { nodeId: node.id, emailed };
};

export const actLabel = (action: string) => ACTION_LABEL[action as OriginalAction] ?? { az: action, de: action };
