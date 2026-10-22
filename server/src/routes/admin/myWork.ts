import { Router, type Request } from 'express';
import type { Locale } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { conflict, forbidden, notFound, parse } from '../../lib/http.js';
import { hasMinRole } from '../../middleware/auth.js';
import { notifyUser } from '../../lib/notifications.js';
import { formatDay } from '../../lib/growthTexts.js';
import { FINAL_STATUSES } from '../../lib/caseFlow.js';
import { daysLeft, kindForKey, l10nTitle } from '../../lib/expiry/index.js';
import { EXPIRY_TEXTS } from '../../lib/expiry/texts.js';
import { activityRow, loadTaskForActor, requirePerm } from '../../lib/tasks/core.js';
import { cachedMyWork, invalidateMyWork } from '../../lib/myWork.js';

/**
 * "My work today" (mounted at /api/admin/my-work, STAFF+ with 2FA via the admin router):
 *   GET  /?scope=mine|all&tz=&fresh=1      the unified queue (lib/myWork.ts); scope=all is ADMIN+ only; cached 30 s per user
 *   POST /tasks/:ref/snooze { days=1 }     moves an open task's deadline to the next day(s) (assignee or manager)
 *   POST /expiry/:docId/remind             sends the client the document expiry warning now (texts of the expiry job)
 * Every other button of the queue calls the existing endpoint of its module directly.
 */
export const adminMyWorkRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const viewerOf = (req: Request) => ({
  id: req.user!.id,
  role: req.user!.role,
  locale: (['az', 'de', 'en', 'ru'].includes(req.user!.locale) ? req.user!.locale : 'az') as Locale,
  firstName: req.user!.firstName,
  lastName: req.user!.lastName,
});

adminMyWorkRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      scope: z.enum(['mine', 'all']).default('mine'),
      tz: z.coerce.number().int().min(-900).max(900).optional(),
      fresh: z.enum(['1', 'true', '0', 'false']).optional(),
    }),
    req.query,
  );
  if (q.scope === 'all' && !hasMinRole(req.user!.role, 'ADMIN')) throw forbidden('TEAM_SCOPE_FORBIDDEN');
  const result = await cachedMyWork(viewerOf(req), { team: q.scope === 'all', tz: q.tz, fresh: q.fresh === '1' || q.fresh === 'true' });
  res.json(result);
});

/** Next deadline: +N days, repeated until it lies in the future (an overdue task keeps its time of day). */
export const snoozedDue = (due: Date | null, days: number, now = new Date()) => {
  const step = days * DAY;
  if (!due) return new Date(now.getTime() + step);
  let next = due.getTime() + step;
  while (next <= now.getTime()) next += step;
  return new Date(next);
};

adminMyWorkRouter.post('/tasks/:ref/snooze', async (req, res) => {
  const { days } = parse(z.object({ days: z.number().int().min(1).max(14).default(1) }), req.body ?? {});
  const actor = { id: req.user!.id, role: req.user!.role };
  const { task, perms } = await loadTaskForActor(String(req.params.ref), actor);
  // The same right as moving the card on the board (assignees and managers).
  requirePerm(perms, 'status');
  if (task.status === 'DONE' || task.status === 'CANCELLED') throw conflict('TASK_CLOSED');
  const dueAt = snoozedDue(task.dueAt, days);
  await prisma.$transaction([
    prisma.task.update({ where: { id: task.id }, data: { dueAt } }),
    prisma.taskComment.create({ data: activityRow(task.id, actor.id, { type: 'due', from: task.dueAt?.toISOString() ?? null, to: dueAt.toISOString() }) }),
  ]);
  invalidateMyWork(actor.id);
  res.json({ task: { id: task.id, number: task.number, dueAt } });
});

adminMyWorkRouter.post('/expiry/:docId/remind', async (req, res) => {
  const d = await prisma.document.findUnique({
    where: { id: String(req.params.docId) },
    select: {
      id: true,
      originalName: true,
      expiresAt: true,
      status: true,
      requirement: { select: { key: true, title: true } },
      case: { select: { id: true, number: true, status: true, assignedStaffId: true, client: { select: { id: true, locale: true, isActive: true } } } },
    },
  });
  if (!d || !d.expiresAt || d.status === 'REJECTED' || FINAL_STATUSES.includes(d.case.status)) throw notFound('DOCUMENT_NOT_FOUND');
  if (!d.case.client.isActive) throw conflict('CLIENT_INACTIVE');
  const now = new Date();
  const client = d.case.client;
  const tx = EXPIRY_TEXTS[client.locale];
  const msg = tx.client({
    doc: l10nTitle(d.requirement?.title, client.locale) || d.originalName,
    number: d.case.number,
    date: formatDay(d.expiresAt, client.locale),
    days: daysLeft(d.expiresAt, now),
    passport: kindForKey(d.requirement?.key) === 'passport',
  });
  await notifyUser(client.id, { type: 'DOCUMENT_EXPIRY', ...msg, link: `/account/cases/${d.case.id}`, caseId: d.case.id, ctaLabel: tx.cta });
  await prisma.document.update({ where: { id: d.id }, data: { expiryRemindedAt: now } });
  await audit(req, 'DOCUMENT_EXPIRY_REMINDED', d.id, { caseId: d.case.id });
  invalidateMyWork(req.user!.id);
  res.json({ ok: true, remindedAt: now });
});
