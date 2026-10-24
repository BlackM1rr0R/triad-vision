import type { Prisma, RecognitionProcess } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { invalidateMyWork } from '../myWork.js';
import { notifyUser } from '../notifications.js';
import { createDraft } from '../billing/service.js';
import {
  ADAPTATION_MEASURES,
  CHECK_KEYS,
  CHECK_REQUIREMENT_KEYS,
  DECISION_STATUSES,
  DEFAULT_AUTHORITY,
  DEFAULT_FEE_CENTS,
  FINAL_PROCESS_STATUSES,
  PROCEDURE_TYPES,
  RECOGNITION_STATUSES,
  aggregateUserStatus,
  checklistProgress,
  checklistTemplate,
  clientOpenItems,
  effectiveDeadline,
  readChecklist,
  type ChecklistItem,
  type ProcedureType,
  type ProcessStatus,
} from './rules.js';
import { DAY, fullName, linkableDocuments, storeCaseDocument } from './common.js';
import { recognitionTexts } from './texts.js';

/**
 * Recognition tracker (Anerkennung) per case: one or more RecognitionProcess rows (e.g. a ZAB statement
 * first, a full recognition later), a checklist per procedure type linked to case documents, a timeline of
 * RecognitionEvents (status changes, letters in / out with the file in the case drive, notes, deadlines),
 * the deficit notice with the adaptation measure, the fee (+ optional client invoice draft) and the next
 * deadline (reminders: lib/recognition/deadlines.ts). User.recognitionStatus (match score) follows the
 * processes of the client.
 */

const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').refine((s) => !Number.isNaN(Date.parse(`${s}T12:00:00Z`)), 'INVALID_DATE');
const atNoon = (s: string) => new Date(`${s}T12:00:00Z`);
const optDay = day.nullable().optional();
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

export const createInput = z.object({
  procedureType: z.enum(PROCEDURE_TYPES),
  profession: z.string().trim().min(2).max(160),
  regulated: z.boolean().optional(),
  authority: optText(200),
  federalState: optText(40),
  reference: optText(120),
  feeCents: z.number().int().min(0).max(10_000_00).nullable().optional(),
  note: optText(5000),
});

export const updateInput = z.object({
  profession: z.string().trim().min(2).max(160).optional(),
  regulated: z.boolean().optional(),
  authority: optText(200),
  federalState: optText(40),
  reference: optText(120),
  submittedAt: optDay,
  feeCents: z.number().int().min(0).max(10_000_00).nullable().optional(),
  feePaidAt: optDay,
  decisionAt: optDay,
  deficitNotes: optText(8000),
  adaptationMeasure: z.enum(ADAPTATION_MEASURES).nullable().optional(),
  adaptationUntil: optDay,
  nextDeadline: optDay,
  nextDeadlineNote: optText(300),
  note: optText(5000),
});

export const statusInput = z.object({ status: z.enum(RECOGNITION_STATUSES), note: optText(2000), date: day.optional() });

export const checklistInput = z.object({
  items: z
    .array(
      z.object({
        key: z.enum(CHECK_KEYS),
        done: z.boolean(),
        documentId: z.string().trim().max(40).nullable().optional(),
        optional: z.boolean().optional(),
        client: z.boolean().optional(),
      }),
    )
    .max(CHECK_KEYS.length),
});

export const eventInput = z.object({
  type: z.enum(['NOTE', 'LETTER_IN', 'LETTER_OUT', 'DOCUMENT']),
  note: z.string().trim().max(4000).optional(),
  documentId: z.string().trim().max(40).nullable().optional(),
  at: day.optional(),
});

const DATE_FIELDS = ['submittedAt', 'feePaidAt', 'decisionAt', 'adaptationUntil', 'nextDeadline'] as const;

// ─── Reads ────────────────────────────────────────────────────────────

const view = (p: RecognitionProcess) => {
  const checklist = readChecklist(p.checklist);
  return {
    ...p,
    checklist,
    progress: checklistProgress(checklist),
    deadline: effectiveDeadline(p),
    final: (FINAL_PROCESS_STATUSES as readonly string[]).includes(p.status),
  };
};
export type ProcessView = ReturnType<typeof view>;

export const loadProcess = async (id: string) => {
  const p = await prisma.recognitionProcess.findUnique({ where: { id } });
  if (!p) throw notFound('RECOGNITION_NOT_FOUND');
  return p;
};

/** Admin case card: processes with timelines, the case's documents to link, the client's recognition status. */
export const caseRecognition = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, clientId: true, profession: true, client: { select: { recognitionStatus: true, recognitionNote: true, profession: true } } } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const processes = await prisma.recognitionProcess.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
  const [events, documents, invoices] = await Promise.all([
    processes.length ? prisma.recognitionEvent.findMany({ where: { processId: { in: processes.map((p) => p.id) } }, orderBy: [{ at: 'desc' }, { id: 'desc' }], take: 500 }) : [],
    linkableDocuments(caseId),
    prisma.clientInvoice.findMany({ where: { caseId }, select: { id: true, number: true, status: true, grossCents: true, note: true } }),
  ]);
  const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const actorOf = new Map(actors.map((a) => [a.id, fullName(a)]));
  return {
    case: { id: c.id, number: c.number, profession: c.profession },
    clientStatus: c.client.recognitionStatus,
    clientNote: c.client.recognitionNote,
    processes: processes.map((p) => ({
      ...view(p),
      events: events.filter((e) => e.processId === p.id).map((e) => ({ ...e, actor: e.actorId ? (actorOf.get(e.actorId) ?? null) : null })),
      invoice: invoices.find((i) => i.note?.includes(`[recognition:${p.id}]`)) ?? null,
    })),
    documents: documents.map((d) => ({ id: d.id, name: d.originalName, stage: d.stage, status: d.status, requirementKey: d.requirement?.key ?? null, createdAt: d.createdAt })),
    defaults: { authority: DEFAULT_AUTHORITY, feeCents: DEFAULT_FEE_CENTS },
  };
};

// ─── User.recognitionStatus ───────────────────────────────────────────

/** Recomputes the client's recognition status (match score) from all of their processes. */
export const syncUserRecognition = async (clientId: string) => {
  const rows = await prisma.recognitionProcess.findMany({ where: { clientId }, select: { status: true } });
  const next = aggregateUserStatus(rows.map((r) => r.status));
  if (!next) return null;
  const u = await prisma.user.findUnique({ where: { id: clientId }, select: { recognitionStatus: true } });
  if (u && u.recognitionStatus !== next) await prisma.user.update({ where: { id: clientId }, data: { recognitionStatus: next } });
  return next;
};

// ─── Writes ───────────────────────────────────────────────────────────

const addEvent = (data: Prisma.RecognitionEventUncheckedCreateInput) => prisma.recognitionEvent.create({ data });

/** Links each checklist item to the newest non-rejected case document of its requirement (done when accepted). */
const autoLink = async (caseId: string, items: ChecklistItem[]) => {
  const docs = await prisma.document.findMany({
    where: { caseId, status: { not: 'REJECTED' }, requirement: { key: { in: Object.values(CHECK_REQUIREMENT_KEYS).flat() } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, requirement: { select: { key: true } } },
  });
  return items.map((i) => {
    if (i.documentId) return i;
    const keys = CHECK_REQUIREMENT_KEYS[i.key] ?? [];
    const doc = docs.find((d) => d.requirement && keys.includes(d.requirement.key ?? ''));
    return doc ? { ...i, documentId: doc.id, done: i.done || doc.status === 'ACCEPTED' } : i;
  });
};

export const createProcess = async (caseId: string, input: z.infer<typeof createInput>, actorId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const type = input.procedureType as ProcedureType;
  const regulated = input.regulated ?? (type === 'FULL_RECOGNITION' || type === 'PARTIAL_RECOGNITION');
  const checklist = await autoLink(c.id, checklistTemplate(type, regulated));
  const p = await prisma.recognitionProcess.create({
    data: {
      caseId: c.id,
      clientId: c.clientId,
      profession: input.profession,
      regulated,
      procedureType: type,
      authority: input.authority || DEFAULT_AUTHORITY[type],
      federalState: input.federalState || null,
      reference: input.reference || null,
      feeCents: input.feeCents ?? DEFAULT_FEE_CENTS[type] ?? null,
      checklist: checklist as unknown as Prisma.InputJsonValue,
      note: input.note || null,
      createdById: actorId,
    },
  });
  await addEvent({ processId: p.id, type: 'STATUS', toStatus: 'PREPARING', actorId });
  await syncUserRecognition(c.clientId);
  return p;
};

export const updateProcess = async (id: string, input: z.infer<typeof updateInput>, actorId: string) => {
  const p = await loadProcess(id);
  const data: Prisma.RecognitionProcessUncheckedUpdateInput = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if ((DATE_FIELDS as readonly string[]).includes(k)) (data as Record<string, unknown>)[k] = v ? atNoon(v as string) : null;
    else (data as Record<string, unknown>)[k] = v === '' ? null : v;
  }
  const updated = await prisma.recognitionProcess.update({ where: { id: p.id }, data });
  // A changed deadline is part of the timeline (and restarts the reminders: they are keyed by the date).
  if (input.nextDeadline !== undefined && (p.nextDeadline?.toISOString() ?? null) !== (updated.nextDeadline?.toISOString() ?? null)) {
    await addEvent({ processId: p.id, type: 'DEADLINE', note: [input.nextDeadline ?? '—', updated.nextDeadlineNote].filter(Boolean).join(' · ').slice(0, 2000), actorId });
  }
  if (input.regulated !== undefined && input.regulated !== p.regulated) {
    // German certificate becomes required / optional with the regulated flag.
    const items = readChecklist(updated.checklist);
    const has = items.find((i) => i.key === 'GERMAN_CERT');
    const next = has ? items.map((i) => (i.key === 'GERMAN_CERT' ? { ...i, optional: !input.regulated } : i)) : input.regulated ? [...items, ...checklistTemplate(p.procedureType as ProcedureType, true).filter((i) => i.key === 'GERMAN_CERT')] : items;
    await prisma.recognitionProcess.update({ where: { id: p.id }, data: { checklist: next as unknown as Prisma.InputJsonValue } });
  }
  invalidateMyWork();
  return loadProcess(p.id);
};

/** Status change: dates follow (submitted / decision), the client is told, the match status follows. */
export const changeStatus = async (id: string, input: z.infer<typeof statusInput>, actorId: string, opts: { notifyClient?: boolean } = {}) => {
  const p = await loadProcess(id);
  const to = input.status as ProcessStatus;
  if (p.status === to) throw conflict('SAME_STATUS');
  const when = input.date ? atNoon(input.date) : new Date();
  const data: Prisma.RecognitionProcessUncheckedUpdateInput = { status: to };
  if (to === 'SUBMITTED' && !p.submittedAt) data.submittedAt = when;
  if ((DECISION_STATUSES as readonly string[]).includes(to) && !p.decisionAt) data.decisionAt = when;
  // A final decision ends the deadline watch.
  if ((FINAL_PROCESS_STATUSES as readonly string[]).includes(to)) data.nextDeadline = null;
  await prisma.recognitionProcess.update({ where: { id: p.id }, data });
  await addEvent({ processId: p.id, type: 'STATUS', fromStatus: p.status, toStatus: to, note: input.note || null, actorId, at: when });
  await syncUserRecognition(p.clientId);
  if (opts.notifyClient !== false) {
    const client = await prisma.user.findUnique({ where: { id: p.clientId }, select: { id: true, firstName: true, locale: true, isActive: true } });
    if (client?.isActive) {
      const t = recognitionTexts(client.locale);
      await notifyUser(client.id, {
        type: 'RECOGNITION_STATUS',
        title: t.clientStatusTitle,
        body: t.clientStatusBody({ firstName: client.firstName, procedure: t.procedure[p.procedureType] ?? p.procedureType, status: t.status[to] ?? to }),
        link: `/account/cases/${p.caseId}#recognition`,
        caseId: p.caseId,
        ctaLabel: t.clientCta,
      }).catch(() => undefined);
    }
  }
  invalidateMyWork();
  return loadProcess(p.id);
};

export const saveChecklist = async (id: string, input: z.infer<typeof checklistInput>) => {
  const p = await loadProcess(id);
  const ids = input.items.map((i) => i.documentId).filter((x): x is string => !!x);
  if (ids.length) {
    const n = await prisma.document.count({ where: { id: { in: ids }, caseId: p.caseId } });
    if (n !== new Set(ids).size) throw badRequest('DOCUMENT_NOT_IN_CASE');
  }
  const current = readChecklist(p.checklist);
  const items: ChecklistItem[] = input.items.map((i) => {
    const prev = current.find((x) => x.key === i.key);
    return { key: i.key, done: i.done, documentId: i.documentId ?? null, optional: i.optional ?? prev?.optional ?? false, client: i.client ?? prev?.client ?? false };
  });
  await prisma.recognitionProcess.update({ where: { id: p.id }, data: { checklist: items as unknown as Prisma.InputJsonValue } });
  return loadProcess(p.id);
};

export const relinkChecklist = async (id: string) => {
  const p = await loadProcess(id);
  const items = await autoLink(p.caseId, readChecklist(p.checklist));
  await prisma.recognitionProcess.update({ where: { id: p.id }, data: { checklist: items as unknown as Prisma.InputJsonValue } });
  return loadProcess(p.id);
};

/** Timeline entry without a file (or pointing at an existing case document). */
export const addProcessEvent = async (id: string, input: z.infer<typeof eventInput>, actorId: string) => {
  const p = await loadProcess(id);
  if (input.documentId && !(await prisma.document.count({ where: { id: input.documentId, caseId: p.caseId } }))) throw badRequest('DOCUMENT_NOT_IN_CASE');
  if (!input.note && !input.documentId) throw badRequest('NOTE_REQUIRED');
  return addEvent({ processId: p.id, type: input.type, note: input.note || null, documentId: input.documentId ?? null, actorId, at: input.at ? atNoon(input.at) : new Date() });
};

/** Letter in / out with its file: stored as a case document (case drive) and logged on the timeline. */
export const uploadLetter = async (id: string, file: Express.Multer.File, o: { type: 'LETTER_IN' | 'LETTER_OUT' | 'DOCUMENT'; note?: string; at?: string; checkKey?: string }, actorId: string) => {
  const p = await loadProcess(id);
  const label = o.type === 'LETTER_IN' ? 'Anerkennung: Schreiben der Behörde' : o.type === 'LETTER_OUT' ? 'Anerkennung: Schreiben an die Behörde' : 'Anerkennung';
  const doc = await storeCaseDocument(p.caseId, file, actorId, label);
  const ev = await addEvent({ processId: p.id, type: o.type, note: o.note?.trim() || doc.originalName, documentId: doc.id, actorId, at: o.at ? atNoon(o.at) : new Date() });
  // Optional: the upload also ticks a checklist item (e.g. the certified translations).
  if (o.checkKey && (CHECK_KEYS as readonly string[]).includes(o.checkKey)) {
    const items = readChecklist(p.checklist).map((i) => (i.key === o.checkKey ? { ...i, documentId: doc.id, done: true } : i));
    await prisma.recognitionProcess.update({ where: { id: p.id }, data: { checklist: items as unknown as Prisma.InputJsonValue } });
  }
  return { document: doc, event: ev };
};

export const deleteProcess = async (id: string) => {
  const p = await loadProcess(id);
  await prisma.recognitionEvent.deleteMany({ where: { processId: p.id } });
  await prisma.recognitionProcess.delete({ where: { id: p.id } });
  await syncUserRecognition(p.clientId);
  invalidateMyWork();
  return p;
};

/** Client invoice DRAFT for the authority fee (pass-through line, no VAT), linked by a marker in the note. */
export const createFeeInvoice = async (id: string, actorId: string) => {
  const p = await loadProcess(id);
  if (!p.feeCents) throw badRequest('FEE_REQUIRED');
  const marker = `[recognition:${p.id}]`;
  const existing = await prisma.clientInvoice.findFirst({ where: { caseId: p.caseId, note: { contains: marker }, status: { not: 'CANCELLED' } }, select: { id: true } });
  if (existing) throw conflict('INVOICE_EXISTS');
  const de = recognitionTexts('de');
  const inv = await createDraft(
    {
      clientId: p.clientId,
      caseId: p.caseId,
      items: [{ description: `Gebühr: ${de.procedure[p.procedureType] ?? p.procedureType}${p.authority ? ` – ${p.authority}` : ''} (${p.profession})`.slice(0, 500), quantity: 1, unitPriceCents: p.feeCents, category: 'EMBASSY_FEE' }],
      note: marker,
    },
    actorId,
  );
  await addEvent({ processId: p.id, type: 'NOTE', note: `Invoice draft (${(p.feeCents / 100).toFixed(2)} €)`, actorId });
  return inv;
};

// ─── Lists ────────────────────────────────────────────────────────────

export const listQuery = z.object({
  status: z.enum([...RECOGNITION_STATUSES, 'open', 'all']).default('open'),
  authority: z.string().trim().max(200).optional(),
  type: z.enum(PROCEDURE_TYPES).optional(),
  soon: z.coerce.number().int().min(1).max(120).optional(),
  staffId: z.string().trim().max(40).optional(),
});

/** /admin/recognition: every process with filters + counts. */
export const listProcesses = async (q: z.infer<typeof listQuery>, now = new Date()) => {
  const where: Prisma.RecognitionProcessWhereInput = {};
  if (q.status === 'open') where.status = { notIn: [...FINAL_PROCESS_STATUSES] };
  else if (q.status !== 'all') where.status = q.status;
  if (q.authority) where.authority = { contains: q.authority };
  if (q.type) where.procedureType = q.type;
  if (q.soon) where.OR = [{ nextDeadline: { lte: new Date(now.getTime() + q.soon * DAY) } }, { status: 'ADAPTATION', adaptationUntil: { lte: new Date(now.getTime() + q.soon * DAY) } }];
  if (q.staffId) {
    const cases = await prisma.case.findMany({ where: { assignedStaffId: q.staffId === 'none' ? null : q.staffId }, select: { id: true }, take: 5000 });
    where.caseId = { in: cases.map((c) => c.id) };
  }
  const [rows, byStatus, authorities] = await Promise.all([
    prisma.recognitionProcess.findMany({ where, orderBy: [{ nextDeadline: 'asc' }, { updatedAt: 'desc' }], take: 500 }),
    prisma.recognitionProcess.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.recognitionProcess.groupBy({ by: ['authority'], _count: { _all: true }, where: { authority: { not: null } } }),
  ]);
  const cases = rows.length
    ? await prisma.case.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.caseId))] } },
        select: { id: true, number: true, status: true, client: { select: { id: true, firstName: true, lastName: true } }, assignedStaff: { select: { id: true, firstName: true, lastName: true } } },
      })
    : [];
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const soon = new Date(now.getTime() + 14 * DAY);
  const open = await prisma.recognitionProcess.findMany({ where: { status: { notIn: [...FINAL_PROCESS_STATUSES] } }, select: { status: true, nextDeadline: true, adaptationUntil: true } });
  const deadlines = open.map((p) => effectiveDeadline(p)).filter((d): d is NonNullable<typeof d> => !!d);
  return {
    items: rows
      .filter((r) => caseOf.has(r.caseId))
      .map((r) => {
        const c = caseOf.get(r.caseId)!;
        const v = view(r);
        return {
          id: r.id,
          procedureType: r.procedureType,
          profession: r.profession,
          regulated: r.regulated,
          authority: r.authority,
          federalState: r.federalState,
          reference: r.reference,
          status: r.status,
          submittedAt: r.submittedAt,
          feeCents: r.feeCents,
          feePaidAt: r.feePaidAt,
          adaptationMeasure: r.adaptationMeasure,
          nextDeadlineNote: r.nextDeadlineNote,
          deadline: v.deadline,
          daysLeft: v.deadline ? Math.ceil((v.deadline.at.getTime() - now.getTime()) / DAY) : null,
          progress: v.progress,
          updatedAt: r.updatedAt,
          case: { id: c.id, number: c.number, status: c.status },
          client: { id: c.client.id, name: fullName(c.client) },
          staff: c.assignedStaff ? { id: c.assignedStaff.id, name: fullName(c.assignedStaff) } : null,
        };
      }),
    counts: {
      byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      open: open.length,
      overdue: deadlines.filter((d) => d.at < now).length,
      soon: deadlines.filter((d) => d.at >= now && d.at <= soon).length,
    },
    authorities: authorities.map((a) => ({ name: a.authority!, count: a._count._all })).sort((a, b) => b.count - a.count),
  };
};

// ─── Client portal ────────────────────────────────────────────────────

/** Read-only status card of the client's own case (no internal notes, no letters' contents). */
export const clientRecognition = async (caseId: string, clientId: string) => {
  const c = await prisma.case.findFirst({ where: { id: caseId, clientId }, select: { id: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const rows = await prisma.recognitionProcess.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
  const events = rows.length ? await prisma.recognitionEvent.findMany({ where: { processId: { in: rows.map((r) => r.id) }, type: 'STATUS' }, orderBy: { at: 'asc' } }) : [];
  return rows.map((r) => {
    const items = readChecklist(r.checklist);
    return {
      id: r.id,
      procedureType: r.procedureType,
      profession: r.profession,
      authority: r.authority,
      status: r.status,
      submittedAt: r.submittedAt,
      decisionAt: r.decisionAt,
      adaptationMeasure: r.adaptationMeasure,
      adaptationUntil: r.adaptationUntil,
      deficitNotes: r.status === 'DEFICIT_NOTICE' || r.status === 'ADAPTATION' || r.status === 'PARTIALLY_RECOGNISED' ? r.deficitNotes : null,
      progress: checklistProgress(items),
      clientTodo: clientOpenItems(items).map((i) => ({ key: i.key, optional: i.optional })),
      timeline: events.filter((e) => e.processId === r.id).map((e) => ({ status: e.toStatus, at: e.at })),
    };
  });
};

/** Next-step facts: the first open client item of a running process on the client's cases. */
export const recognitionClientAction = async (caseIds: string[]) => {
  if (!caseIds.length) return null;
  const rows = await prisma.recognitionProcess.findMany({
    where: { caseId: { in: caseIds }, status: { in: ['PREPARING', 'SUBMITTED', 'IN_REVIEW', 'DEFICIT_NOTICE'] } },
    orderBy: { createdAt: 'asc' },
    select: { caseId: true, checklist: true, nextDeadline: true },
  });
  for (const r of rows) {
    const open = clientOpenItems(readChecklist(r.checklist)).filter((i) => !i.optional);
    if (open.length) return { caseId: r.caseId, count: open.length, key: open[0].key, dueAt: r.nextDeadline };
  }
  return null;
};
