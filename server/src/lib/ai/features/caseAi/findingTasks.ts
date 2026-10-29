import type { Locale, Prisma } from '@prisma/client';
import { config } from '../../../../config.js';
import { prisma } from '../../../../db.js';
import { notFound } from '../../../http.js';
import { activeStaff, activityRow, createNumbered, OPEN_STATUSES, taskKey } from '../../../tasks/core.js';
import { notifyAssigned } from '../../../tasks/notify.js';
import { caseEvent } from './runs.js';

/**
 * AI document check → ONE team task per client (case). Every finding staff turn into a task (consistency
 * finding, contract issue, embassy checklist item) becomes a checklist item of the case's open
 * "document problems" task — "Elchin Abdullayev — 3 sənəd problemi" — instead of a task of its own; the
 * documents involved are linked to the task (their drive copies) and listed in the description. A new finding
 * for the same client appends to the open task; when every item is ticked the task completes by itself.
 *
 * The task is recognised by the marker at the start of its description (no schema change). Tasks created the
 * old way (one per finding) are left as they are.
 */

export const AI_DOC_TASK_MARKER = '[KI-Dokumentprüfung]';
const MAX_ITEMS = 200;
const MAX_ITEM_TEXT = 300;

export interface FindingTaskItem {
  /** One line of the checklist (deduplicated by its text within the open task). */
  text: string;
  /** Documents the finding is about (case documents; their drive copies are attached to the task). */
  documents: { id: string | null; name: string }[];
}

const L: Record<Locale, { title: (name: string, n: number) => string; intro: (num: string, name: string) => string; docs: string; open: string }> = {
  az: {
    title: (name, n) => `${name} — ${n} sənəd problemi`,
    intro: (num, name) => `AI sənəd yoxlaması: ${name} (iş ${num}). Hər bəndi həll edib işarələyin — hamısı bitəndə tapşırıq özü tamamlanır.`,
    docs: 'Sənədlər',
    open: 'Müraciət',
  },
  de: {
    title: (name, n) => `${name} — ${n} ${n === 1 ? 'Dokumentenproblem' : 'Dokumentenprobleme'}`,
    intro: (num, name) => `KI-Dokumentprüfung: ${name} (Fall ${num}). Jeden Punkt lösen und abhaken — sind alle erledigt, schließt sich die Aufgabe von selbst.`,
    docs: 'Dokumente',
    open: 'Fall',
  },
  en: {
    title: (name, n) => `${name} — ${n} document ${n === 1 ? 'issue' : 'issues'}`,
    intro: (num, name) => `AI document check: ${name} (case ${num}). Resolve and tick each item — when all are done the task completes itself.`,
    docs: 'Documents',
    open: 'Case',
  },
  ru: {
    title: (name, n) => {
      const m10 = n % 10;
      const m100 = n % 100;
      const word = m10 === 1 && m100 !== 11 ? 'проблема' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'проблемы' : 'проблем';
      return `${name} — ${n} ${word} с документами`;
    },
    intro: (num, name) => `AI-проверка документов: ${name} (дело ${num}). Решите и отметьте каждый пункт — когда все выполнены, задача закроется сама.`,
    docs: 'Документы',
    open: 'Дело',
  },
};

const caseUrl = (caseId: string) => `${config.clientUrl.replace(/\/$/, '')}/admin/cases/${caseId}`;

const description = (t: (typeof L)[Locale], c: { id: string; number: string }, person: string, docs: { id: string; name: string }[]) =>
  [
    `${AI_DOC_TASK_MARKER} ${t.intro(c.number, person)}`,
    `${t.open}: ${caseUrl(c.id)}#documents`,
    docs.length ? `${t.docs}:\n${docs.map((d) => `• ${d.name} — ${caseUrl(c.id)}?doc=${d.id}#documents`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 8000);

/** Documents already listed in the description (`?doc=<id>`), in order. */
const listedDocs = (desc: string | null): { id: string; name: string }[] => {
  const out: { id: string; name: string }[] = [];
  for (const m of (desc ?? '').matchAll(/^• (.+) — \S+\?doc=([A-Za-z0-9_-]+)/gm)) out.push({ name: m[1], id: m[2] });
  return out;
};

const isLocale = (v: unknown): v is Locale => v === 'az' || v === 'de' || v === 'en' || v === 'ru';

/** The open AI document task of a case (newest), if any. */
export const openFindingTask = (caseId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) =>
  tx.task.findFirst({
    where: { caseId, status: { in: OPEN_STATUSES }, description: { startsWith: AI_DOC_TASK_MARKER } },
    orderBy: { createdAt: 'desc' },
    include: { checklist: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
  });

/**
 * Adds findings to the case's open AI document task (created when there is none). Returns the task and how
 * many checklist items were new. Items whose text is already on the task are skipped (re-runs, double clicks).
 */
export const addFindingsToCaseTask = async (
  caseId: string,
  items: FindingTaskItem[],
  actor: { id: string; firstName: string; lastName: string; locale?: string | null },
) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, number: true, assignedStaffId: true, client: { select: { firstName: true, lastName: true } }, familyProfile: { select: { firstName: true, lastName: true } } },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const t = L[isLocale(actor.locale) ? actor.locale : 'az'];
  const who = c.familyProfile ?? c.client;
  const person = `${who.firstName} ${who.lastName}`.trim() || c.number;

  const clean = items
    .map((i) => ({ text: i.text.replace(/\s+/g, ' ').trim().slice(0, MAX_ITEM_TEXT), documents: i.documents.filter((d): d is { id: string; name: string } => !!d.id) }))
    .filter((i) => i.text);
  const docIds = [...new Set(clean.flatMap((i) => i.documents.map((d) => d.id)))];
  // Only documents of this case are linked.
  const docs = docIds.length ? await prisma.document.findMany({ where: { id: { in: docIds }, caseId: c.id }, select: { id: true, originalName: true } }) : [];
  const docName = new Map(docs.map((d) => [d.id, d.originalName]));

  const existing = await openFindingTask(c.id);
  let created = false;
  let added = 0;
  let taskId: string;
  let number: number;
  let title: string;

  if (!existing) {
    const unique = [...new Map(clean.map((i) => [i.text.toLocaleLowerCase('en'), i])).values()].slice(0, MAX_ITEMS);
    const assignees = await activeStaff([c.assignedStaffId ?? actor.id]);
    title = t.title(person, unique.length).slice(0, 200);
    const linked = docs.map((d) => ({ id: d.id, name: d.originalName }));
    const task = await createNumbered(async (tx, n) => {
      const min = await tx.task.aggregate({ where: { status: 'TODO' }, _min: { sortOrder: true } });
      const row = await tx.task.create({
        data: {
          number: n,
          title,
          description: description(t, c, person, linked),
          status: 'TODO',
          priority: 'NORMAL',
          sortOrder: min._min.sortOrder === null ? 0 : min._min.sortOrder - 1024,
          caseId: c.id,
          createdById: actor.id,
          assignees: { create: assignees.map((a) => ({ userId: a.id })) },
          checklist: { create: unique.map((i, idx) => ({ text: i.text, sortOrder: idx })) },
        },
      });
      await tx.taskComment.create({ data: activityRow(row.id, actor.id, { type: 'created' }) });
      return row;
    });
    await notifyAssigned(task, assignees.map((a) => a.id), actor);
    created = true;
    added = unique.length;
    taskId = task.id;
    number = task.number;
  } else {
    const have = new Set(existing.checklist.map((i) => i.text.toLocaleLowerCase('en')));
    const fresh: string[] = [];
    for (const i of clean) {
      const k = i.text.toLocaleLowerCase('en');
      if (have.has(k)) continue;
      have.add(k);
      fresh.push(i.text);
    }
    const room = Math.max(0, MAX_ITEMS - existing.checklist.length);
    const toAdd = fresh.slice(0, room);
    const maxSort = existing.checklist.reduce((m, i) => Math.max(m, i.sortOrder), -1);
    const total = existing.checklist.length + toAdd.length;
    // The description keeps its document list (new documents appended); a title staff renamed stays.
    const listed = listedDocs(existing.description);
    const known = new Set(listed.map((d) => d.id));
    const allDocs = [...listed, ...docs.filter((d) => !known.has(d.id)).map((d) => ({ id: d.id, name: d.originalName }))];
    const autoTitle = existing.title.startsWith(`${person} — `);
    title = autoTitle ? t.title(person, total).slice(0, 200) : existing.title;
    await prisma.$transaction([
      ...toAdd.map((text, idx) => prisma.taskChecklistItem.create({ data: { taskId: existing.id, text, sortOrder: maxSort + 1 + idx } })),
      prisma.task.update({ where: { id: existing.id }, data: { title, description: description(t, c, person, allDocs) } }),
      ...(autoTitle && title !== existing.title ? [prisma.taskComment.create({ data: activityRow(existing.id, actor.id, { type: 'title', from: existing.title, to: title }) })] : []),
    ]);
    added = toAdd.length;
    taskId = existing.id;
    number = existing.number;
  }

  // Links to the documents: their drive copies (accepted / incoming case documents in the client folder).
  if (docs.length) {
    const nodes = await prisma.driveNode.findMany({ where: { documentId: { in: docs.map((d) => d.id) }, deletedAt: null }, select: { id: true } });
    if (nodes.length) await prisma.taskAttachment.createMany({ data: nodes.map((n) => ({ taskId, nodeId: n.id })), skipDuplicates: true });
  }

  await caseEvent(c.id, created ? 'AI_CASE_TASK_CREATED' : 'AI_CASE_TASK_UPDATED', actor.id, `${taskKey(number)}: ${title}${added ? ` (+${added})` : ''}`);
  return { id: taskId, number, key: taskKey(number), title, created, added, documents: docName.size };
};

/**
 * After a checklist change: an AI document task whose items are all ticked is completed (DONE, activity row).
 * Returns true when it completed the task. Other tasks are never touched.
 */
export const completeFindingTaskIfDone = async (taskId: string, actorId: string) => {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, status: true, description: true, checklist: { select: { done: true } } } });
  if (!task || !OPEN_STATUSES.includes(task.status) || !task.description?.startsWith(AI_DOC_TASK_MARKER)) return false;
  if (!task.checklist.length || task.checklist.some((i) => !i.done)) return false;
  const done = await prisma.task.updateMany({ where: { id: task.id, status: task.status }, data: { status: 'DONE', completedAt: new Date() } });
  if (!done.count) return false;
  await prisma.taskComment.create({ data: activityRow(task.id, actorId, { type: 'status', from: task.status, to: 'DONE' }) });
  return true;
};

/** Text of a checklist item: "<document>: <message>" (document names first so staff see what to open). */
export const findingItemText = (message: string, documents: { name: string }[]) => {
  const names = [...new Set(documents.map((d) => d.name).filter(Boolean))].slice(0, 2).join(', ');
  return (names ? `${names}: ${message}` : message).slice(0, MAX_ITEM_TEXT);
};
