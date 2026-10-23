import type { CallOutcome, Locale } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { renderEmail, sendMail } from '../mailer.js';
import { publish } from '../messaging/realtime.js';
import { notifyUser } from '../notifications.js';
import { createAutomationTask } from '../automation/tasks.js';
import { activeStaff } from '../tasks/core.js';
import { callbackWindows, getOfficeHours, isOpen, nextOpening } from './hours.js';
import { matchPhone, normPhone } from './service.js';
import { asLocale, callTexts, windowLabel } from './texts.js';

/**
 * "Mənə zəng edin": a visitor / client picks a 1-hour window (today / tomorrow, office hours Asia/Baku) or
 * "as soon as possible". Creates a CallbackRequest + a staff task due at the window start (assignee: the
 * client's case manager, else automatic assignment when switched on, else the admins who handle inquiries),
 * a reminder 10 minutes before (jobs/calls.ts) and a confirmation in the requester's language.
 */

const HOUR = 60 * 60 * 1000;
export const REMIND_BEFORE_MS = 10 * 60 * 1000;
export const TOPICS = ['work', 'ausbildung', 'family', 'study', 'documents', 'other'] as const;
export const SOURCES = ['contact', 'footer', 'advisor', 'portal', 'livechat'] as const;

export const callbackInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().regex(/^\+?[\d\s()-]{6,30}$/),
    email: z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined)),
    lang: z.enum(['az', 'de', 'en', 'ru']).catch('az'),
    topic: z.enum(TOPICS).optional(),
    message: z.string().trim().max(600).optional(),
    window: z.union([z.literal('asap'), z.string().datetime({ offset: true })]),
    source: z.enum(SOURCES).default('contact'),
    consent: z.literal(true),
    liveChatId: z.string().max(40).optional(),
    /** honeypot */
    website: z.string().max(200).optional(),
  })
  .strict();
export type CallbackInput = z.infer<typeof callbackInput>;

export const slotsFor = async (now = new Date()) => {
  const hours = await getOfficeHours();
  const open = isOpen(hours, now);
  return {
    timezone: 'Asia/Baku',
    open,
    nextOpening: nextOpening(hours, now)?.toISOString() ?? null,
    hours: { days: hours.days, from: hours.from, to: hours.to },
    days: callbackWindows(hours, now),
  };
};

/** Who calls back: the case manager, automatic assignment (optional module), or the inquiry handlers (admins). */
const pickAssignees = async (locale: Locale, clientId: string | null): Promise<string[]> => {
  if (clientId) {
    const c = await prisma.case.findFirst({ where: { clientId, assignedStaffId: { not: null } }, orderBy: { updatedAt: 'desc' }, select: { assignedStaffId: true } });
    if (c?.assignedStaffId && (await activeStaff([c.assignedStaffId])).length) return [c.assignedStaffId];
  }
  try {
    const mod = (await import('../assignment/index.js').catch(() => null)) as null | { pickAssignee?: (tx: typeof prisma, t: { clientLocale: Locale }) => Promise<string | null> };
    const id = mod?.pickAssignee ? await mod.pickAssignee(prisma, { clientLocale: locale }) : null;
    if (id) return [id];
  } catch (err) {
    console.error('[callback] auto-assignment failed', err);
  }
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
  if (admins.length) return admins.map((a) => a.id);
  return (await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true } })).map((a) => a.id);
};

export const createCallback = async (input: CallbackInput, ctx: { clientId?: string | null; now?: Date } = {}) => {
  const now = ctx.now ?? new Date();
  const phone = normPhone(input.phone);
  if (!phone) throw badRequest('INVALID_PHONE');
  const hours = await getOfficeHours();
  let windowStart: Date;
  let windowEnd: Date;
  const asap = input.window === 'asap';
  if (asap) {
    windowStart = nextOpening(hours, now) ?? now;
    windowEnd = new Date(windowStart.getTime() + HOUR);
  } else {
    const offered = callbackWindows(hours, now).flatMap((d) => d.windows);
    const pick = offered.find((w) => Date.parse(w.start) === Date.parse(input.window));
    if (!pick) throw badRequest('INVALID_WINDOW');
    windowStart = new Date(pick.start);
    windowEnd = new Date(pick.end);
  }
  const locale = asLocale(input.lang);
  let clientId = ctx.clientId ?? null;
  let inquiryId: string | null = null;
  let email = input.email ?? null;
  if (!clientId) clientId = (await matchPhone(phone)).clientId;
  const client = clientId ? await prisma.user.findUnique({ where: { id: clientId }, select: { email: true, locale: true, firstName: true, lastName: true } }) : null;
  if (client && ctx.clientId) email ??= client.email;
  const caseId = clientId ? ((await prisma.case.findFirst({ where: { clientId }, orderBy: { updatedAt: 'desc' }, select: { id: true } }))?.id ?? null) : null;
  const tx = callTexts(locale);
  const when = windowLabel(windowStart, windowEnd, locale, asap);
  if (!clientId) {
    // A new lead: keep it in the inquiry list too (no inquiry hook — the callback task below is the follow-up).
    const inquiry = await prisma.inquiry.create({
      data: {
        kind: 'contact',
        contactName: input.name,
        email: email ?? '',
        phone,
        sector: 'Callback',
        message: [`[Zəng sifarişi · ${input.source}] ${windowLabel(windowStart, windowEnd, 'az', asap)}`, input.topic ? `Mövzu: ${input.topic}` : null, input.message ?? null].filter(Boolean).join('\n').slice(0, 5000),
        locale,
      },
    });
    inquiryId = inquiry.id;
  }
  const assigneeIds = await pickAssignees(locale, clientId);
  const staff = await activeStaff(assigneeIds);
  const staffLocale = staff[0]?.locale ?? 'az';
  const staffWhen = windowLabel(windowStart, windowEnd, staffLocale, asap);
  const cb = await prisma.callbackRequest.create({
    data: {
      name: input.name,
      phone,
      email,
      locale,
      topic: input.topic ?? null,
      message: input.message ?? null,
      asap,
      windowStart,
      windowEnd,
      source: input.source,
      clientId,
      inquiryId,
      assigneeIds,
    },
  });
  const task = await createAutomationTask({
    title: callTexts(staffLocale).taskTitle(input.name, staffWhen),
    description: [`☎ ${phone}`, email, input.topic ? `#${input.topic}` : null, input.message ?? null, '', `/admin/calls?callback=${cb.id}`].filter((l) => l !== null).join('\n'),
    assigneeIds,
    dueAt: windowStart,
    priority: asap ? 'URGENT' : 'HIGH',
    caseId,
  }).catch((err) => {
    console.error('[callback] task failed', err);
    return null;
  });
  if (task) await prisma.callbackRequest.update({ where: { id: cb.id }, data: { taskId: task.id } });
  publish(assigneeIds, 'callback.new', { id: cb.id });
  if (input.liveChatId) await prisma.liveChat.updateMany({ where: { id: input.liveChatId }, data: { callbackId: cb.id } });
  const confirmation = tx.confirm(when);
  if (email) void sendMail(email, `Triad Vision · ${tx.confirmTitle}`, renderEmail(tx.confirmTitle, confirmation, ctx.clientId ? { label: 'Triad Vision', url: `${config.clientUrl}/account` } : undefined));
  if (ctx.clientId) void notifyUser(ctx.clientId, { type: 'CALLBACK_CONFIRMED', title: tx.confirmTitle, body: confirmation, link: '/account', email: false });
  return { id: cb.id, windowStart, windowEnd, asap, confirmation, taskId: task?.id ?? null };
};

/** Closes a request after the call (outcome feeds the call log) and finishes its task. Idempotent. */
export const completeCallback = async (id: string, staffId: string, o: { outcome: CallOutcome; note: string | null; callId?: string | null }) => {
  const cb = await prisma.callbackRequest.findUnique({ where: { id } });
  if (!cb) return null;
  const now = new Date();
  const updated = await prisma.callbackRequest.update({
    where: { id },
    data: { status: 'DONE', outcome: o.outcome, note: o.note ?? cb.note, callId: o.callId ?? cb.callId, doneAt: cb.doneAt ?? now, doneById: cb.doneById ?? staffId },
  });
  if (cb.taskId) await prisma.task.updateMany({ where: { id: cb.taskId, status: { notIn: ['DONE', 'CANCELLED'] } }, data: { status: 'DONE', completedAt: now } });
  return updated;
};

/** Reminds the assignees 10 minutes before the window starts (once; skipped for windows long past). */
export const runCallbackReminders = async (now = new Date()) => {
  const due = await prisma.callbackRequest.findMany({
    where: { status: 'PENDING', remindedAt: null, windowStart: { lte: new Date(now.getTime() + REMIND_BEFORE_MS), gte: new Date(now.getTime() - HOUR) } },
    take: 100,
  });
  let sent = 0;
  for (const cb of due) {
    const claimed = await prisma.callbackRequest.updateMany({ where: { id: cb.id, remindedAt: null }, data: { remindedAt: now } });
    if (!claimed.count) continue;
    const ids = Array.isArray(cb.assigneeIds) ? (cb.assigneeIds as string[]) : [];
    for (const u of await activeStaff(ids)) {
      const tx = callTexts(u.locale);
      await notifyUser(u.id, {
        type: 'CALLBACK_REMINDER',
        title: tx.reminderTitle(cb.name),
        body: tx.reminderBody(cb.phone, windowLabel(cb.windowStart, cb.windowEnd, u.locale, cb.asap)),
        link: `/admin/calls?callback=${cb.id}`,
        email: false,
      });
      sent += 1;
    }
  }
  return sent;
};
