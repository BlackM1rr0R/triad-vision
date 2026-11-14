import { prisma } from '../db.js';
import { FINAL_STATUSES } from './caseFlow.js';
import { normaliseTags } from './workspace/contacts.js';

/**
 * Client 360° (Admin → Müştərilər → <client>, routes/admin/client360.ts): one read model over everything the agency
 * has about a client account — cases (own and family sub-cases), invoices and payments, case messages, calls,
 * documents, team tasks and client to-dos, family members, leads / live chats — plus a merged timeline. Tags are the
 * shared address-book contact linked to the account (Contact.userId, Workspace → Contacts), so they show there too.
 */

const DAY = 24 * 60 * 60 * 1000;
const name = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);
const clip = (s: string | null | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : (s ?? null));
const staffSel = { select: { id: true, firstName: true, lastName: true, role: true } } as const;

export const loadClientUser = (id: string) =>
  prisma.user.findUnique({
    where: { id },
    select: {
      id: true, role: true, email: true, phone: true, firstName: true, lastName: true, locale: true, isActive: true, createdAt: true,
      birthDate: true, nationality: true, city: true, profession: true, germanLevel: true, mergedIntoId: true,
      whatsappOptIn: true, marketingOptIn: true,
      ownerPartner: { select: { id: true, name: true } },
      referredByAgent: { select: { id: true, code: true, user: { select: { firstName: true, lastName: true } } } },
    },
  });

/** Case ids of the client: their own cases (family sub-cases belong to the main applicant's account as well). */
export const clientCaseIds = async (userId: string) => (await prisma.case.findMany({ where: { clientId: userId }, select: { id: true } })).map((c) => c.id);

const tagContact = (userId: string) => prisma.contact.findFirst({ where: { userId, shared: true }, orderBy: { createdAt: 'asc' }, select: { id: true, tags: true } });

export const clientTags = async (userId: string) => {
  const c = await tagContact(userId);
  return { contactId: c?.id ?? null, tags: normaliseTags(c?.tags) };
};

/** Replaces the tags on the client's shared contact (created from the account when there is none yet). */
export const saveClientTags = async (user: { id: string; firstName: string; lastName: string; email: string; phone: string | null }, tags: string[], actorId: string) => {
  const clean = normaliseTags(tags);
  const existing = await tagContact(user.id);
  if (existing) {
    await prisma.contact.update({ where: { id: existing.id }, data: { tags: clean } });
    return { contactId: existing.id, tags: clean };
  }
  const created = await prisma.contact.create({
    data: { userId: user.id, shared: true, firstName: user.firstName.slice(0, 80), lastName: user.lastName.slice(0, 80) || null, email: user.email, phone: user.phone, tags: clean, createdById: actorId },
    select: { id: true },
  });
  return { contactId: created.id, tags: clean };
};

export const client360 = async (userId: string, now = new Date()) => {
  const user = await loadClientUser(userId);
  if (!user) return null;
  const cases = await prisma.case.findMany({
    where: { clientId: userId },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true, number: true, status: true, profession: true, visaType: true, createdAt: true, updatedAt: true, appointmentAt: true, appointmentPlace: true, parentCaseId: true,
      assignedStaff: staffSel, partner: { select: { id: true, name: true } }, company: { select: { id: true, name: true } },
      visaCategory: { select: { title: true, visaLabel: true } },
    },
  });
  const caseIds = cases.map((c) => c.id);
  const numberOf = new Map(cases.map((c) => [c.id, c.number]));
  const inCases = { caseId: { in: caseIds } };

  const [invoices, messages, calls, documents, tasks, clientTasks, family, inquiries, liveChats, sessions, tags, unansweredRows] = await Promise.all([
    prisma.clientInvoice.findMany({ where: { clientId: userId }, orderBy: { issueDate: 'desc' }, take: 100, select: { id: true, number: true, status: true, currency: true, grossCents: true, paidCents: true, issueDate: true, dueDate: true, paidAt: true, caseId: true } }),
    prisma.caseMessage.findMany({ where: inCases, orderBy: { createdAt: 'desc' }, take: 40, select: { id: true, caseId: true, body: true, channel: true, createdAt: true, readAt: true, author: staffSel } }),
    prisma.call.findMany({ where: { OR: [{ clientId: userId }, ...(caseIds.length ? [inCases] : [])] }, orderBy: { startedAt: 'desc' }, take: 40, select: { id: true, direction: true, status: true, outcome: true, startedAt: true, durationSec: true, summary: true, note: true, staffId: true, caseId: true } }),
    prisma.document.findMany({ where: inCases, orderBy: { createdAt: 'desc' }, take: 150, select: { id: true, caseId: true, originalName: true, stage: true, status: true, mimeType: true, size: true, createdAt: true, expiresAt: true } }),
    prisma.task.findMany({ where: inCases, orderBy: [{ completedAt: { sort: 'asc', nulls: 'first' } }, { dueAt: { sort: 'asc', nulls: 'last' } }], take: 60, select: { id: true, number: true, title: true, status: true, priority: true, dueAt: true, caseId: true, assignees: { select: { user: staffSel } } } }),
    prisma.clientTask.findMany({ where: inCases, orderBy: [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }], take: 60, select: { id: true, title: true, status: true, dueAt: true, caseId: true, completedAt: true } }),
    prisma.familyMember.findMany({ where: { OR: [{ mainCaseId: { in: caseIds } }, { memberCaseId: { in: caseIds } }] }, select: { id: true, relation: true, firstName: true, lastName: true, birthDate: true, joinsWhen: true, plannedEntryAt: true, mainCaseId: true, memberCaseId: true, memberCase: { select: { number: true, status: true, clientId: true } }, mainCase: { select: { number: true, clientId: true, client: { select: { id: true, firstName: true, lastName: true } } } } } }),
    prisma.inquiry.findMany({ where: { OR: [{ convertedUserId: userId }, { email: user.email }] }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, kind: true, status: true, createdAt: true, source: true, message: true } }),
    prisma.liveChat.findMany({ where: { clientId: userId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, status: true, createdAt: true, closedAt: true, staffId: true } }),
    prisma.session.findFirst({ where: { userId }, orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } }),
    clientTags(userId),
    prisma.case.findMany({ where: { id: { in: caseIds }, status: { notIn: FINAL_STATUSES } }, select: { id: true, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { author: { select: { role: true } } } } } }),
  ]);

  const callStaffIds = [...new Set(calls.map((c) => c.staffId).filter((x): x is string => !!x))];
  const callStaff = new Map((callStaffIds.length ? await prisma.user.findMany({ where: { id: { in: callStaffIds } }, select: { id: true, firstName: true, lastName: true } }) : []).map((u) => [u.id, name(u)]));

  const open = cases.filter((c) => !FINAL_STATUSES.includes(c.status));
  const primary = open[0] ?? cases[0] ?? null;
  const unpaid = invoices.filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED' && i.status !== 'DRAFT' && i.paidCents < i.grossCents);
  const overdueInvoices = unpaid.filter((i) => i.dueDate.getTime() < now.getTime());
  const awaitingReply = unansweredRows.some((c) => c.messages[0]?.author.role === 'CLIENT');
  const nextAppointment = open.filter((c) => c.appointmentAt && c.appointmentAt.getTime() > now.getTime()).sort((a, b) => a.appointmentAt!.getTime() - b.appointmentAt!.getTime())[0] ?? null;

  // Automatic badges next to the manual tags (codes; the page translates them).
  const flags: string[] = [];
  if (user.ownerPartner || cases.some((c) => c.partner)) flags.push('PARTNER');
  if (family.length) flags.push('FAMILY');
  if (overdueInvoices.length) flags.push('OVERDUE_INVOICE');
  if (awaitingReply) flags.push('AWAITING_REPLY');
  if (cases.some((c) => c.status === 'APPROVED')) flags.push('VISA_APPROVED');
  if (!open.length && cases.length) flags.push('CLOSED');
  if (user.createdAt.getTime() > now.getTime() - 14 * DAY) flags.push('NEW');
  if (user.mergedIntoId) flags.push('MERGED');

  const sum = (rows: { grossCents: number; paidCents: number; currency: string }[], pick: (r: { grossCents: number; paidCents: number }) => number) => {
    const by: Record<string, number> = {};
    for (const r of rows) by[r.currency] = (by[r.currency] ?? 0) + pick(r);
    return by;
  };

  return {
    client: { ...user, lastSeenAt: sessions?.lastSeenAt ?? null },
    tags: tags.tags,
    contactId: tags.contactId,
    flags,
    owner: primary?.assignedStaff ?? null,
    partner: user.ownerPartner ?? primary?.partner ?? null,
    agent: user.referredByAgent ? { id: user.referredByAgent.id, code: user.referredByAgent.code, name: name(user.referredByAgent.user) } : null,
    nextAppointment: nextAppointment ? { caseId: nextAppointment.id, number: nextAppointment.number, at: nextAppointment.appointmentAt, place: nextAppointment.appointmentPlace } : null,
    counts: {
      cases: cases.length,
      openCases: open.length,
      invoices: invoices.length,
      overdueInvoices: overdueInvoices.length,
      messages: messages.length,
      calls: calls.length,
      documents: documents.length,
      pendingDocuments: documents.filter((d) => d.status === 'PENDING').length,
      tasks: tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED').length + clientTasks.filter((t) => t.status === 'OPEN').length,
      family: family.length,
    },
    money: { billed: sum(invoices.filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT'), (r) => r.grossCents), paid: sum(invoices, (r) => r.paidCents), open: sum(unpaid, (r) => r.grossCents - r.paidCents) },
    cases: cases.map((c) => ({ ...c, open: !FINAL_STATUSES.includes(c.status) })),
    invoices: invoices.map((i) => ({ ...i, caseNumber: i.caseId ? (numberOf.get(i.caseId) ?? null) : null, overdue: overdueInvoices.includes(i) })),
    messages: messages.map((m) => ({ id: m.id, caseId: m.caseId, caseNumber: numberOf.get(m.caseId) ?? null, body: clip(m.body, 600), channel: m.channel, createdAt: m.createdAt, readAt: m.readAt, author: { id: m.author.id, name: name(m.author), role: m.author.role } })),
    calls: calls.map((c) => ({ ...c, staffName: c.staffId ? (callStaff.get(c.staffId) ?? null) : null, caseNumber: c.caseId ? (numberOf.get(c.caseId) ?? null) : null, summary: clip(c.summary, 400), note: clip(c.note, 400) })),
    documents: documents.map((d) => ({ ...d, caseNumber: numberOf.get(d.caseId) ?? null })),
    tasks: tasks.map((t) => ({ id: t.id, number: t.number, title: t.title, status: t.status, priority: t.priority, dueAt: t.dueAt, caseId: t.caseId, caseNumber: t.caseId ? (numberOf.get(t.caseId) ?? null) : null, assignees: t.assignees.map((a) => ({ id: a.user.id, name: name(a.user) })), overdue: !!t.dueAt && t.dueAt < now && t.status !== 'DONE' && t.status !== 'CANCELLED' })),
    clientTasks: clientTasks.map((t) => ({ ...t, caseNumber: numberOf.get(t.caseId) ?? null, overdue: t.status === 'OPEN' && !!t.dueAt && t.dueAt < now })),
    family: family.map((f) => {
      const isMain = caseIds.includes(f.mainCaseId);
      return {
        id: f.id,
        relation: f.relation,
        firstName: f.firstName,
        lastName: f.lastName,
        birthDate: f.birthDate,
        joinsWhen: f.joinsWhen,
        plannedEntryAt: f.plannedEntryAt,
        /** This client is the main applicant (member listed) or the member (main applicant listed). */
        side: isMain ? ('member' as const) : ('main' as const),
        caseId: isMain ? f.memberCaseId : f.mainCaseId,
        caseNumber: isMain ? f.memberCase.number : f.mainCase.number,
        caseStatus: isMain ? f.memberCase.status : null,
        otherClientId: isMain ? (f.memberCase.clientId !== userId ? f.memberCase.clientId : null) : f.mainCase.clientId,
        mainApplicant: isMain ? null : name(f.mainCase.client),
      };
    }),
    inquiries: inquiries.map((q) => ({ ...q, message: clip(q.message, 200) })),
    liveChats,
  };
};

// ─── Timeline ──────────────────────────────────────────────────────────

export const TIMELINE_TYPES = ['case', 'note', 'message', 'call', 'document', 'payment', 'task', 'audit'] as const;
export type TimelineType = (typeof TIMELINE_TYPES)[number];

export interface TimelineEntry {
  id: string;
  type: TimelineType;
  /** Sub-kind (case event type, audit action, invoice issued / paid, field name …). */
  kind: string;
  at: Date;
  text: string | null;
  actor: string | null;
  actorRole: string | null;
  caseId: string | null;
  caseNumber: string | null;
  meta?: Record<string, unknown>;
}

/** Merged, newest-first history of a client; `before` pages backwards (exclusive). */
export const clientTimeline = async (userId: string, opts: { types?: TimelineType[]; before?: Date; limit?: number; caseId?: string } = {}) => {
  const types = new Set(opts.types?.length ? opts.types : TIMELINE_TYPES);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const before = opts.before ?? new Date(Date.now() + 60_000);
  const allCases = await prisma.case.findMany({ where: { clientId: userId }, select: { id: true, number: true } });
  const cases = opts.caseId ? allCases.filter((c) => c.id === opts.caseId) : allCases;
  const caseIds = cases.map((c) => c.id);
  const numberOf = new Map(cases.map((c) => [c.id, c.number]));
  const inCases = { caseId: { in: caseIds } };
  const lt = { lt: before };
  const take = limit;
  const none = Promise.resolve([] as never[]);

  const [events, messages, calls, docs, issued, paid, tasks, clientTasks, audits, changes] = await Promise.all([
    types.has('case') || types.has('note')
      ? prisma.caseEvent.findMany({
          where: { ...inCases, createdAt: lt, ...(types.has('case') && types.has('note') ? {} : types.has('note') ? { type: 'INTERNAL_NOTE' } : { type: { not: 'INTERNAL_NOTE' } }) },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, caseId: true, type: true, fromStatus: true, toStatus: true, note: true, createdAt: true, visibleToClient: true, actor: staffSel },
        })
      : none,
    types.has('message') ? prisma.caseMessage.findMany({ where: { ...inCases, createdAt: lt }, orderBy: { createdAt: 'desc' }, take, select: { id: true, caseId: true, body: true, channel: true, createdAt: true, author: staffSel } }) : none,
    types.has('call')
      ? prisma.call.findMany({ where: { OR: [{ clientId: userId }, ...(caseIds.length ? [inCases] : [])], ...(opts.caseId ? inCases : {}), startedAt: lt }, orderBy: { startedAt: 'desc' }, take, select: { id: true, caseId: true, direction: true, status: true, outcome: true, durationSec: true, startedAt: true, summary: true, staffId: true } })
      : none,
    types.has('document') ? prisma.document.findMany({ where: { ...inCases, createdAt: lt }, orderBy: { createdAt: 'desc' }, take, select: { id: true, caseId: true, originalName: true, stage: true, status: true, createdAt: true, uploadedBy: staffSel } }) : none,
    types.has('payment') ? prisma.clientInvoice.findMany({ where: { clientId: userId, ...(opts.caseId ? inCases : {}), createdAt: lt }, orderBy: { createdAt: 'desc' }, take, select: { id: true, caseId: true, number: true, grossCents: true, currency: true, status: true, createdAt: true } }) : none,
    types.has('payment') ? prisma.clientInvoice.findMany({ where: { clientId: userId, ...(opts.caseId ? inCases : {}), paidAt: lt }, orderBy: { paidAt: 'desc' }, take, select: { id: true, caseId: true, number: true, paidCents: true, currency: true, paidAt: true } }) : none,
    types.has('task') ? prisma.task.findMany({ where: { ...inCases, createdAt: lt }, orderBy: { createdAt: 'desc' }, take, select: { id: true, caseId: true, number: true, title: true, status: true, createdAt: true, createdBy: staffSel } }) : none,
    types.has('task') ? prisma.clientTask.findMany({ where: { ...inCases, createdAt: lt }, orderBy: { createdAt: 'desc' }, take, select: { id: true, caseId: true, title: true, status: true, createdAt: true, createdBy: staffSel } }) : none,
    types.has('audit')
      ? prisma.auditLog.findMany({
          where: { target: { in: [userId, `user:${userId}`, ...caseIds, ...caseIds.map((id) => `case:${id}`)] }, createdAt: lt },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, action: true, target: true, createdAt: true, actor: staffSel },
        })
      : none,
    types.has('audit')
      ? prisma.fieldChange.findMany({
          where: { OR: [{ entity: 'USER', entityId: userId }, ...(caseIds.length ? [{ entity: 'CASE', entityId: { in: caseIds } }] : [])], createdAt: lt },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, entity: true, entityId: true, field: true, sensitive: true, oldValue: true, newValue: true, actorId: true, actorRole: true, createdAt: true },
        })
      : none,
  ]);

  const actorIds = [...new Set([...calls.map((c) => c.staffId), ...changes.map((c) => c.actorId)].filter((x): x is string => !!x))];
  const actors = new Map((actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true, role: true } }) : []).map((u) => [u.id, u]));
  const cn = (id: string | null | undefined) => (id ? (numberOf.get(id) ?? null) : null);
  const auditCase = (target: string | null) => {
    const id = target?.startsWith('case:') ? target.slice(5) : target;
    return id && numberOf.has(id) ? id : null;
  };
  const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'string' ? clip(v, 80) : clip(JSON.stringify(v), 80));

  const out: TimelineEntry[] = [
    ...events.map((e) => ({
      id: `ev:${e.id}`,
      type: (e.type === 'INTERNAL_NOTE' ? 'note' : 'case') as TimelineType,
      kind: e.type,
      at: e.createdAt,
      text: clip(e.note, 500),
      actor: name(e.actor),
      actorRole: e.actor?.role ?? null,
      caseId: e.caseId,
      caseNumber: cn(e.caseId),
      meta: { from: e.fromStatus, to: e.toStatus, visibleToClient: e.visibleToClient },
    })),
    ...messages.map((m) => ({ id: `msg:${m.id}`, type: 'message' as const, kind: m.author.role === 'CLIENT' ? 'FROM_CLIENT' : 'FROM_STAFF', at: m.createdAt, text: clip(m.body, 500), actor: name(m.author), actorRole: m.author.role, caseId: m.caseId, caseNumber: cn(m.caseId), meta: { channel: m.channel } })),
    ...calls.map((c) => {
      const a = c.staffId ? actors.get(c.staffId) : null;
      return { id: `call:${c.id}`, type: 'call' as const, kind: c.direction, at: c.startedAt, text: clip(c.summary, 400), actor: name(a), actorRole: a?.role ?? null, caseId: c.caseId, caseNumber: cn(c.caseId), meta: { status: c.status, outcome: c.outcome, durationSec: c.durationSec } };
    }),
    ...docs.map((d) => ({ id: `doc:${d.id}`, type: 'document' as const, kind: d.stage, at: d.createdAt, text: d.originalName, actor: name(d.uploadedBy), actorRole: d.uploadedBy.role, caseId: d.caseId, caseNumber: cn(d.caseId), meta: { status: d.status, documentId: d.id } })),
    ...issued.map((i) => ({ id: `inv:${i.id}`, type: 'payment' as const, kind: 'INVOICE_ISSUED', at: i.createdAt, text: i.number, actor: null, actorRole: null, caseId: i.caseId, caseNumber: cn(i.caseId), meta: { cents: i.grossCents, currency: i.currency, status: i.status } })),
    ...paid.map((i) => ({ id: `paid:${i.id}`, type: 'payment' as const, kind: 'INVOICE_PAID', at: i.paidAt!, text: i.number, actor: null, actorRole: null, caseId: i.caseId, caseNumber: cn(i.caseId), meta: { cents: i.paidCents, currency: i.currency } })),
    ...tasks.map((t) => ({ id: `task:${t.id}`, type: 'task' as const, kind: 'TASK_CREATED', at: t.createdAt, text: t.title, actor: name(t.createdBy), actorRole: t.createdBy?.role ?? null, caseId: t.caseId, caseNumber: cn(t.caseId), meta: { number: t.number, status: t.status } })),
    ...clientTasks.map((t) => ({ id: `ctask:${t.id}`, type: 'task' as const, kind: 'CLIENT_TASK_CREATED', at: t.createdAt, text: t.title, actor: name(t.createdBy), actorRole: t.createdBy?.role ?? null, caseId: t.caseId, caseNumber: cn(t.caseId), meta: { status: t.status } })),
    ...audits.map((a) => {
      const caseId = auditCase(a.target);
      return { id: `audit:${a.id}`, type: 'audit' as const, kind: a.action, at: a.createdAt, text: null, actor: name(a.actor), actorRole: a.actor?.role ?? null, caseId, caseNumber: cn(caseId) };
    }),
    ...changes.map((c) => {
      const a = c.actorId ? actors.get(c.actorId) : null;
      const caseId = c.entity === 'CASE' ? c.entityId : null;
      return {
        id: `fc:${c.id}`,
        type: 'audit' as const,
        kind: 'FIELD_CHANGED',
        at: c.createdAt,
        text: c.sensitive ? c.field : `${c.field}: ${show(c.oldValue)} → ${show(c.newValue)}`,
        actor: name(a),
        actorRole: a?.role ?? c.actorRole,
        caseId,
        caseNumber: cn(caseId),
        meta: { field: c.field, entity: c.entity },
      };
    }),
  ];
  out.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
  const page = out.slice(0, limit);
  const hasMore = out.length > limit || [events, messages, calls, docs, issued, paid, tasks, clientTasks, audits, changes].some((rows) => rows.length === take);
  return { entries: page, nextBefore: hasMore && page.length ? page[page.length - 1].at.toISOString() : null };
};

export type Client360 = NonNullable<Awaited<ReturnType<typeof client360>>>;
