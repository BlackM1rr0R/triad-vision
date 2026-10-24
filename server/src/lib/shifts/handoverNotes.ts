import type { CaseHandover, Locale, Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { forbidden, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';

/**
 * Handover notes on top of the automatic absence handover (lib/assignment/handover.ts, CaseHandover rows):
 *
 *  - Before the leave starts the person leaving writes one note for all cases and / or a note + checklist per
 *    case. It is kept as a draft (Setting `handoverDraft:<leaveId>`) because the CaseHandover rows only exist
 *    once the leave has started; runHandovers copies the draft onto each row it creates (`draftFor`).
 *  - Once the handover runs, the note and checklist live on CaseHandover (note, checklist [{ text, done }]):
 *    the substitute sees them on the case and in "my work", and ticks checklist items.
 *  - Saving the draft while handovers of that leave are already ACTIVE updates those rows too (ticks kept).
 *  - After the return the owner sees what changed on each case during the handover.
 */

export const DRAFT_PREFIX = 'handoverDraft:';

export interface ChecklistItem {
  text: string;
  done: boolean;
  doneAt?: string | null;
  doneById?: string | null;
}
export interface NoteEntry {
  note: string | null;
  checklist: ChecklistItem[];
}
export interface HandoverDraft {
  general: NoteEntry;
  cases: Record<string, NoteEntry>;
  updatedAt?: string;
}

const checklistInput = z.array(z.object({ text: z.string().trim().min(1).max(300), done: z.boolean().optional() })).max(30);
const entryInput = z.object({ note: z.string().trim().max(5000).nullable().optional(), checklist: checklistInput.optional() });
export const draftSchema = z.object({ general: entryInput.optional(), cases: z.record(z.string().max(40), entryInput).optional() });
export const notePatchSchema = entryInput;
export const tickSchema = z.object({ index: z.number().int().min(0).max(29), done: z.boolean() });

export const parseChecklist = (raw: unknown): ChecklistItem[] =>
  Array.isArray(raw)
    ? raw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string')
        .map((x) => ({ text: String(x.text), done: x.done === true, doneAt: typeof x.doneAt === 'string' ? x.doneAt : null, doneById: typeof x.doneById === 'string' ? x.doneById : null }))
    : [];

const emptyEntry = (): NoteEntry => ({ note: null, checklist: [] });
const hasContent = (e: NoteEntry | undefined) => !!e && (!!e.note?.trim() || e.checklist.length > 0);

const normEntry = (e: z.infer<typeof entryInput> | undefined): NoteEntry => ({
  note: e?.note?.trim() ? e.note.trim() : null,
  checklist: (e?.checklist ?? []).map((c) => ({ text: c.text, done: c.done === true })),
});

export const parseDraft = (raw: unknown): HandoverDraft => {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const entry = (x: unknown): NoteEntry => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return { note: typeof o.note === 'string' && o.note.trim() ? o.note : null, checklist: parseChecklist(o.checklist) };
  };
  const cases: Record<string, NoteEntry> = {};
  if (v.cases && typeof v.cases === 'object') for (const [k, x] of Object.entries(v.cases as Record<string, unknown>)) cases[k] = entry(x);
  return { general: entry(v.general), cases, updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : undefined };
};

export const readDraft = async (leaveId: string | null | undefined): Promise<HandoverDraft | null> => {
  if (!leaveId) return null;
  const row = await prisma.setting.findUnique({ where: { key: `${DRAFT_PREFIX}${leaveId}` } });
  return row ? parseDraft(row.value) : null;
};

/** Note + checklist for one case: its own entry when it has one, else the note for all cases. */
export const draftFor = (draft: HandoverDraft | null, caseId: string): { note?: string | null; checklist?: Prisma.InputJsonValue } => {
  if (!draft) return {};
  const e = hasContent(draft.cases[caseId]) ? draft.cases[caseId] : draft.general;
  if (!hasContent(e)) return {};
  return { note: e.note, checklist: e.checklist.map((c) => ({ text: c.text, done: c.done })) as unknown as Prisma.InputJsonValue };
};

/** New checklist text with the ticks of the old one kept (matched by text). */
export const mergeChecklist = (next: ChecklistItem[], prev: ChecklistItem[]) =>
  next.map((c) => {
    const old = prev.find((p) => p.text === c.text);
    return old ? { ...c, done: old.done, doneAt: old.doneAt ?? null, doneById: old.doneById ?? null } : { text: c.text, done: c.done, doneAt: null, doneById: null };
  });

// ─── Permissions ───────────────────────────────────────────────────────

interface Viewer {
  id: string;
  role: Role;
}

const isAdmin = (v: Viewer) => hasMinRole(v.role, 'ADMIN');

const loadLeave = async (viewer: Viewer, leaveId: string) => {
  const leave = await prisma.leaveRequest.findUnique({ where: { id: leaveId }, select: { id: true, userId: true, type: true, status: true, startsAt: true, endsAt: true } });
  if (!leave) throw notFound('LEAVE_NOT_FOUND');
  if (leave.userId !== viewer.id && !isAdmin(viewer)) throw forbidden();
  return leave;
};

// ─── Views ─────────────────────────────────────────────────────────────

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

const names = async (ids: string[]) =>
  new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, fullName(u)!]));

/** What happened on the case during a handover (events except assignment bookkeeping, messages). */
export const handoverChanges = async (h: Pick<CaseHandover, 'caseId' | 'startedAt' | 'endedAt'>) => {
  const until = h.endedAt ?? new Date();
  const [events, messages] = await Promise.all([
    prisma.caseEvent.findMany({
      where: { caseId: h.caseId, createdAt: { gte: h.startedAt, lte: until }, NOT: { type: 'CASE_UPDATED' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, fromStatus: true, toStatus: true, note: true, createdAt: true, visibleToClient: true, actor: { select: { firstName: true, lastName: true } } },
    }),
    prisma.caseMessage.count({ where: { caseId: h.caseId, createdAt: { gte: h.startedAt, lte: until } } }),
  ]);
  return {
    events: events.length,
    messages,
    docsReviewed: events.filter((e) => e.type === 'DOCUMENT_ACCEPTED' || e.type === 'DOCUMENT_REJECTED').length,
    statusChanges: events.filter((e) => e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus).map((e) => ({ from: e.fromStatus, to: e.toStatus, at: e.createdAt })),
    recent: events
      .slice(-10)
      .reverse()
      .map((e) => ({ id: e.id, type: e.type, note: e.visibleToClient ? null : e.note, at: e.createdAt, actor: fullName(e.actor), fromStatus: e.fromStatus, toStatus: e.toStatus })),
  };
};

const handoverView = (h: CaseHandover, people: Map<string, string>, c?: { number: string; status: string; client: { firstName: string; lastName: string } } | null) => {
  const checklist = parseChecklist(h.checklist);
  return {
    id: h.id,
    caseId: h.caseId,
    caseNumber: c?.number ?? null,
    caseStatus: c?.status ?? null,
    client: c ? fullName(c.client) : null,
    status: h.status,
    originalStaffId: h.originalStaffId,
    originalName: people.get(h.originalStaffId) ?? null,
    substituteId: h.substituteId,
    substituteName: people.get(h.substituteId) ?? null,
    leaveId: h.leaveId,
    startedAt: h.startedAt,
    plannedEndAt: h.plannedEndAt,
    endedAt: h.endedAt,
    note: h.note,
    checklist,
    open: checklist.filter((x) => !x.done).length,
  };
};
export type HandoverView = ReturnType<typeof handoverView>;

const caseSelect = { id: true, number: true, status: true, client: { select: { firstName: true, lastName: true } } } as const;

const views = async (rows: CaseHandover[]) => {
  const [people, cases] = await Promise.all([
    names(rows.flatMap((h) => [h.originalStaffId, h.substituteId])),
    prisma.case.findMany({ where: { id: { in: rows.map((h) => h.caseId) } }, select: caseSelect }),
  ]);
  const byId = new Map(cases.map((c) => [c.id, c]));
  return rows.map((h) => handoverView(h, people, byId.get(h.caseId)));
};

// ─── Draft for a leave ─────────────────────────────────────────────────

/** The draft editor: the leave, the owner's open cases with their notes, the note for all cases. */
export const leaveDraft = async (viewer: Viewer, leaveId: string) => {
  const leave = await loadLeave(viewer, leaveId);
  const [draft, active] = await Promise.all([readDraft(leave.id), prisma.caseHandover.findMany({ where: { leaveId: leave.id } })]);
  const handedIds = active.map((h) => h.caseId);
  const cases = await prisma.case.findMany({
    where: { OR: [{ assignedStaffId: leave.userId, status: { notIn: FINAL_STATUSES } }, { id: { in: handedIds } }] },
    select: caseSelect,
    orderBy: { createdAt: 'asc' },
  });
  const hv = new Map((await views(active)).map((h) => [h.caseId, h]));
  const d = draft ?? { general: emptyEntry(), cases: {} };
  return {
    leave,
    general: d.general,
    updatedAt: d.updatedAt ?? null,
    cases: cases.map((c) => ({
      id: c.id,
      number: c.number,
      status: c.status,
      client: fullName(c.client),
      note: d.cases[c.id]?.note ?? null,
      checklist: d.cases[c.id]?.checklist ?? [],
      handover: hv.get(c.id) ?? null,
    })),
  };
};

/** Saves the draft and pushes it onto the handovers of this leave that already run (ticks are kept). */
export const saveLeaveDraft = async (viewer: Viewer, leaveId: string, input: z.infer<typeof draftSchema>) => {
  const leave = await loadLeave(viewer, leaveId);
  const prev = (await readDraft(leave.id)) ?? { general: emptyEntry(), cases: {} };
  const cases: Record<string, NoteEntry> = { ...prev.cases };
  for (const [id, e] of Object.entries(input.cases ?? {})) {
    const n = normEntry(e);
    if (hasContent(n)) cases[id] = n;
    else delete cases[id];
  }
  const draft: HandoverDraft = { general: input.general ? normEntry(input.general) : prev.general, cases, updatedAt: new Date().toISOString() };
  const key = `${DRAFT_PREFIX}${leave.id}`;
  await prisma.setting.upsert({ where: { key }, create: { key, value: draft as unknown as Prisma.InputJsonValue }, update: { value: draft as unknown as Prisma.InputJsonValue } });
  const running = await prisma.caseHandover.findMany({ where: { leaveId: leave.id, status: 'ACTIVE' } });
  for (const h of running) {
    const next = draftFor(draft, h.caseId);
    const list = mergeChecklist(parseChecklist(next.checklist ?? []), parseChecklist(h.checklist));
    await prisma.caseHandover.update({ where: { id: h.id }, data: { note: next.note ?? null, checklist: list as unknown as Prisma.InputJsonValue } });
  }
  return { ...(await leaveDraft(viewer, leaveId)), applied: running.length };
};

// ─── Handover rows ─────────────────────────────────────────────────────

const loadHandover = async (id: string) => {
  const h = await prisma.caseHandover.findUnique({ where: { id } });
  if (!h) throw notFound('HANDOVER_NOT_FOUND');
  return h;
};

/** Owner (or ADMIN) edits the note / checklist of a running handover. */
export const patchHandoverNote = async (viewer: Viewer, id: string, input: z.infer<typeof notePatchSchema>) => {
  const h = await loadHandover(id);
  if (h.originalStaffId !== viewer.id && !isAdmin(viewer)) throw forbidden();
  const n = normEntry(input);
  const data: Prisma.CaseHandoverUpdateInput = {};
  if (input.note !== undefined) data.note = n.note;
  if (input.checklist !== undefined) data.checklist = mergeChecklist(n.checklist, parseChecklist(h.checklist)) as unknown as Prisma.InputJsonValue;
  const row = await prisma.caseHandover.update({ where: { id }, data });
  return (await views([row]))[0];
};

/** Substitute, owner or ADMIN ticks a checklist item. */
export const tickChecklist = async (viewer: Viewer, id: string, index: number, done: boolean) => {
  const h = await loadHandover(id);
  if (![h.substituteId, h.originalStaffId].includes(viewer.id) && !isAdmin(viewer)) throw forbidden();
  const list = parseChecklist(h.checklist);
  if (!list[index]) throw notFound('CHECKLIST_ITEM_NOT_FOUND');
  list[index] = { ...list[index], done, doneAt: done ? new Date().toISOString() : null, doneById: done ? viewer.id : null };
  const row = await prisma.caseHandover.update({ where: { id }, data: { checklist: list as unknown as Prisma.InputJsonValue } });
  if (done && viewer.id !== h.originalStaffId && list.every((x) => x.done)) {
    const c = await prisma.case.findUnique({ where: { id: h.caseId }, select: { number: true } });
    const owner = await prisma.user.findUnique({ where: { id: h.originalStaffId }, select: { locale: true } });
    if (c && owner) {
      const t = noteTexts(owner.locale);
      void notifyUser(h.originalStaffId, { type: 'CASE_HANDOVER_CHECKLIST', ...t.checklistDone({ number: c.number }), link: `/admin/cases/${h.caseId}`, caseId: h.caseId, email: false }).catch(() => undefined);
    }
  }
  return (await views([row]))[0];
};

/** Handover info for a case: the running one (note, checklist) and the last finished one with its changes. */
export const caseHandoverInfo = async (caseId: string) => {
  const [active, last] = await Promise.all([
    prisma.caseHandover.findFirst({ where: { caseId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } }),
    prisma.caseHandover.findFirst({ where: { caseId, status: { not: 'ACTIVE' }, endedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } }, orderBy: { endedAt: 'desc' } }),
  ]);
  const [a, l] = await views([active, last].filter((x): x is CaseHandover => !!x));
  return {
    active: active ? { ...a, changes: await handoverChanges(active) } : null,
    returned: last ? { ...(active ? l : a), changes: await handoverChanges(last) } : null,
  };
};

/** Everything for "my handovers": my leave drafts, what I cover, and what changed on my returned cases. */
export const myHandovers = async (viewer: Viewer) => {
  const now = new Date();
  const [leaves, covering, mineActive, returned] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId: viewer.id, status: { in: ['PENDING', 'APPROVED'] }, type: { not: 'REMOTE' }, endsAt: { gte: now } },
      select: { id: true, type: true, status: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.caseHandover.findMany({ where: { substituteId: viewer.id, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } }),
    prisma.caseHandover.findMany({ where: { originalStaffId: viewer.id, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } }),
    prisma.caseHandover.findMany({ where: { originalStaffId: viewer.id, status: { not: 'ACTIVE' }, endedAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } }, orderBy: { endedAt: 'desc' }, take: 50 }),
  ]);
  const drafts = await Promise.all(leaves.map((l) => readDraft(l.id)));
  const returnedViews = await views(returned);
  return {
    leaves: leaves.map((l, i) => ({
      ...l,
      hasDraft: !!drafts[i] && (hasContent(drafts[i]!.general) || Object.values(drafts[i]!.cases).some(hasContent)),
      notes: drafts[i] ? Object.values(drafts[i]!.cases).filter(hasContent).length : 0,
    })),
    covering: await views(covering),
    mineActive: await views(mineActive),
    returned: await Promise.all(returned.map(async (h, i) => ({ ...returnedViews[i], changes: await handoverChanges(h) }))),
  };
};

// ─── Notification when leave is approved ──────────────────────────────

const TEXTS: Record<Locale, { prompt: (p: { from: string; to: string; count: number }) => { title: string; body: string }; checklistDone: (p: { number: string }) => { title: string; body: string } }> = {
  az: {
    prompt: (p) => ({ title: 'Ötürmə qeydi yazın', body: `Məzuniyyətiniz (${p.from} – ${p.to}) təsdiqləndi. ${p.count} açıq müraciətiniz var: əvəz edəcək həmkar üçün qısa qeyd və yoxlama siyahısı yazın.` }),
    checklistDone: (p) => ({ title: `${p.number}: ötürmə siyahısı tamamlandı`, body: `Əvəz edən həmkar ${p.number} müraciəti üzrə ötürmə siyahısının bütün bəndlərini tamamladı.` }),
  },
  de: {
    prompt: (p) => ({ title: 'Übergabenotiz schreiben', body: `Ihre Abwesenheit (${p.from} – ${p.to}) wurde genehmigt. Sie haben ${p.count} offene Anträge: Schreiben Sie Ihrer Vertretung eine kurze Notiz und eine Checkliste.` }),
    checklistDone: (p) => ({ title: `${p.number}: Übergabe-Checkliste erledigt`, body: `Ihre Vertretung hat alle Punkte der Übergabe-Checkliste für ${p.number} abgehakt.` }),
  },
  en: {
    prompt: (p) => ({ title: 'Write a handover note', body: `Your leave (${p.from} – ${p.to}) was approved. You have ${p.count} open cases: write a short note and a checklist for the colleague covering for you.` }),
    checklistDone: (p) => ({ title: `${p.number}: handover checklist done`, body: `The colleague covering for you ticked every item of the handover checklist for ${p.number}.` }),
  },
  ru: {
    prompt: (p) => ({ title: 'Напишите заметку для передачи дел', body: `Ваш отпуск (${p.from} – ${p.to}) одобрен. У вас ${p.count} открытых дел: напишите коллеге, который вас заменит, короткую заметку и чек-лист.` }),
    checklistDone: (p) => ({ title: `${p.number}: чек-лист передачи выполнен`, body: `Коллега, замещающий вас, отметил все пункты чек-листа передачи по делу ${p.number}.` }),
  },
};
export const noteTexts = (l: Locale) => TEXTS[l] ?? TEXTS.az;

const fmtDay = (d: Date, l: Locale) => new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[l], { dateStyle: 'medium', timeZone: 'UTC' }).format(d);

/** After a leave (not REMOTE) is approved: asks the person to write handover notes when they have open cases. */
export const promptHandoverNotes = async (leave: { id: string; userId: string; type: string; startsAt: Date; endsAt: Date }) => {
  if (leave.type === 'REMOTE') return;
  const [user, count] = await Promise.all([
    prisma.user.findUnique({ where: { id: leave.userId }, select: { locale: true } }),
    prisma.case.count({ where: { assignedStaffId: leave.userId, status: { notIn: FINAL_STATUSES } } }),
  ]);
  if (!user || !count) return;
  const t = noteTexts(user.locale);
  await notifyUser(leave.userId, { type: 'HANDOVER_NOTE_PROMPT', ...t.prompt({ from: fmtDay(leave.startsAt, user.locale), to: fmtDay(leave.endsAt, user.locale), count }), link: `/workspace/team?tab=handover&leave=${leave.id}`, email: false });
};
