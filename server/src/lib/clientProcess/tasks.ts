import type { ClientTask, Locale, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { displayDescription, displayTitle, fmtDay, taskTexts } from './texts.js';

/**
 * Client tasks: to-dos the team gives a client on a case, with a deadline. The client marks them done
 * (optionally with a note / an upload); a task linked to a document requirement completes itself when the
 * client uploads a document for that requirement.
 */

export const DUE_SOON_DAYS = 2;
const DAY = 24 * 3600 * 1000;

export const taskInclude = {
  case: { select: { id: true, number: true, clientId: true, status: true, assignedStaffId: true, client: { select: { id: true, firstName: true, lastName: true, locale: true } }, assignedStaff: { select: { id: true, firstName: true, lastName: true } } } },
  requirement: { select: { id: true, title: true, stage: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.ClientTaskInclude;

type TaskFull = Prisma.ClientTaskGetPayload<{ include: typeof taskInclude }>;

const l10nOf = (v: unknown, locale: Locale) => {
  const t = (v ?? {}) as Partial<Record<Locale, string>>;
  return t[locale] || t.de || t.en || t.az || t.ru || '';
};

/** "YYYY-MM-DD" = end of that day in Baku (23:59, UTC+4 all year); full ISO date-times are kept. */
export const parseDue = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T23:59:00+04:00`);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const taskState = (t: Pick<ClientTask, 'status' | 'dueAt'>, now = new Date()) =>
  t.status !== 'OPEN' ? t.status.toLowerCase() : !t.dueAt ? 'open' : t.dueAt < now ? 'overdue' : t.dueAt.getTime() - now.getTime() <= DUE_SOON_DAYS * DAY ? 'due_soon' : 'open';

/** Shape for the client portal / mobile app (texts in the client's language). */
export const clientView = (t: TaskFull, locale: Locale, now = new Date()) => ({
  id: t.id,
  caseId: t.caseId,
  caseNumber: t.case.number,
  template: t.template,
  title: displayTitle(t, locale),
  description: displayDescription(t, locale),
  dueAt: t.dueAt,
  status: t.status,
  state: taskState(t, now),
  requirement: t.requirement ? { id: t.requirement.id, stage: t.requirement.stage, title: l10nOf(t.requirement.title, locale) } : null,
  linkUrl: t.linkUrl,
  attachmentId: t.attachmentId,
  clientDocumentId: t.clientDocumentId,
  clientNote: t.clientNote,
  completedAt: t.completedAt,
  completedVia: t.completedVia,
  createdAt: t.createdAt,
});

/** Shape for staff (adds who created it, the client and the case manager). */
export const staffView = (t: TaskFull, locale: Locale, now = new Date()) => ({
  ...clientView(t, locale, now),
  rawTitle: t.title,
  rawDescription: t.description,
  client: { id: t.case.client.id, name: `${t.case.client.firstName} ${t.case.client.lastName}`.trim(), locale: t.case.client.locale },
  assignedStaff: t.case.assignedStaff ? { id: t.case.assignedStaff.id, name: `${t.case.assignedStaff.firstName} ${t.case.assignedStaff.lastName}`.trim() } : null,
  createdBy: t.createdBy ? { id: t.createdBy.id, name: `${t.createdBy.firstName} ${t.createdBy.lastName}`.trim() } : null,
  completedById: t.completedById,
  updatedAt: t.updatedAt,
});

export const loadTask = (id: string) => prisma.clientTask.findUnique({ where: { id }, include: taskInclude });

/** In-app + push + e-mail (per the client's preferences) about a new task, in the client's language. */
export const notifyTaskCreated = async (t: TaskFull) => {
  const locale = t.case.client.locale;
  const tx = taskTexts[locale];
  const msg = tx.created({ title: displayTitle(t, locale), due: t.dueAt ? fmtDay(t.dueAt, locale) : null, description: displayDescription(t, locale), number: t.case.number });
  await notifyUser(t.case.clientId, { type: 'CLIENT_TASK_NEW', ...msg, link: `/account/cases/${t.caseId}#client-tasks`, caseId: t.caseId, ctaLabel: tx.cta });
};

/** Marks a task done (once); the team is told when the client did it. Returns the updated task or null. */
export const completeTask = async (
  taskId: string,
  by: { userId: string | null; via: 'CLIENT' | 'STAFF' | 'UPLOAD' },
  extra: { note?: string | null; documentId?: string | null } = {},
) => {
  const res = await prisma.clientTask.updateMany({
    where: { id: taskId, status: 'OPEN' },
    data: {
      status: 'DONE',
      completedAt: new Date(),
      completedById: by.userId,
      completedVia: by.via,
      ...(extra.note !== undefined ? { clientNote: extra.note } : {}),
      ...(extra.documentId ? { clientDocumentId: extra.documentId } : {}),
    },
  });
  if (!res.count) return null;
  const t = await loadTask(taskId);
  if (t && by.via !== 'STAFF') {
    await prisma.caseEvent.create({ data: { caseId: t.caseId, type: 'CLIENT_TASK_DONE', note: t.title, actorId: by.userId, visibleToClient: true } });
    if (!isImpersonating()) {
      await notifyStaff(
        `${t.case.number}: tapşırıq tamamlandı`,
        `Müştəri tapşırığı tamamladı: ${displayTitle(t, 'az')}${extra.note ? `\n\nQeyd: ${extra.note}` : ''}${by.via === 'UPLOAD' ? '\n\n(sənəd yükləndi)' : ''}`,
        { caseId: t.caseId, link: `/admin/cases/${t.caseId}#client-tasks`, type: 'CLIENT_TASK_DONE' },
      ).catch((e) => console.error('[client-tasks] staff notify failed', e));
    }
  }
  return t;
};

/**
 * A client upload for a requirement completes the open tasks linked to it. Called by the upload routes;
 * never throws (an upload must not fail because of a task).
 */
export const completeTasksForUpload = async (documentId: string) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { requirementId: true, uploadedById: true, case: { select: { clientId: true } } } });
    if (!doc?.requirementId || doc.uploadedById !== doc.case.clientId) return 0;
    const open = await prisma.clientTask.findMany({ where: { requirementId: doc.requirementId, status: 'OPEN' }, select: { id: true } });
    let n = 0;
    for (const t of open) if (await completeTask(t.id, { userId: doc.uploadedById, via: 'UPLOAD' }, { documentId })) n++;
    return n;
  } catch (err) {
    console.error('[client-tasks] auto-complete failed', documentId, err);
    return 0;
  }
};

/**
 * Safety net for uploads that reached a requirement through another path (scan, mobile, staff on behalf):
 * open tasks whose requirement has a non-rejected document uploaded after the task was created are done.
 */
export const syncRequirementTasks = async () => {
  const open = await prisma.clientTask.findMany({
    where: { status: 'OPEN', requirementId: { not: null } },
    select: { id: true, createdAt: true, requirementId: true },
    take: 500,
  });
  if (!open.length) return 0;
  const docs = await prisma.document.findMany({
    where: { requirementId: { in: open.map((t) => t.requirementId!) }, status: { not: 'REJECTED' } },
    select: { id: true, requirementId: true, createdAt: true, uploadedById: true },
  });
  let n = 0;
  for (const t of open) {
    const d = docs.find((x) => x.requirementId === t.requirementId && x.createdAt >= t.createdAt);
    if (d && (await completeTask(t.id, { userId: d.uploadedById, via: 'UPLOAD' }, { documentId: d.id }))) n++;
  }
  return n;
};
