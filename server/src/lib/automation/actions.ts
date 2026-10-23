import type { Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { staffCancel, staffConfirmContract, staffMarkLodged, staffRequestChanges } from '../caseFlow.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyUser, renderNotification, type NotificationType } from '../notifications.js';
import { sendSms } from '../messaging/outbound.js';
import { emitWebhook } from '../ops/webhooks.js';
import { requestDocument } from '../ai/features/caseAi/actions.js';
import { assignCase, autoAssignCase, pickAssignee, targetOfCase } from '../assignment/index.js';
import type { AutoContext } from './context.js';
import { placeholderValues, renderAutomationTemplate } from './placeholders.js';
import { AUTOMATION_TRANSITIONS, type Action, type StaffTarget } from './schema.js';
import { createAutomationTask } from './tasks.js';
import { automationTexts } from './texts.js';

/**
 * THEN: executes one action — or, with `dryRun`, only describes what it would do (same resolution code, no
 * writes). Outcomes are SUCCEEDED / SKIPPED (with a reason code) / FAILED (error message); nothing throws.
 */

export interface RuleRef {
  id: string;
  name: string;
  createdById: string | null;
  updatedById: string | null;
}

export interface ActionOutcome {
  status: 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
  reason?: string;
  /** What was (or would be) done: rendered texts, recipients, created ids. */
  result?: Record<string, unknown>;
}

const ok = (result: Record<string, unknown>): ActionOutcome => ({ status: 'SUCCEEDED', result });
const skip = (reason: string, result?: Record<string, unknown>): ActionOutcome => ({ status: 'SKIPPED', reason, result });

const STAFF_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;
const staffSelect = { id: true, firstName: true, lastName: true, locale: true } as const;
type StaffRow = { id: string; firstName: string; lastName: string; locale: Locale };

/** Staff the action addresses. `single`: one person (tasks) — for a role, the member with the fewest open tasks. */
const resolveStaff = async (target: StaffTarget, ctx: AutoContext, single: boolean): Promise<StaffRow[]> => {
  if (target.kind === 'CASE_OWNER') {
    const id = ctx.case?.assignedStaffId;
    if (!id) return [];
    return prisma.user.findMany({ where: { id, isActive: true, role: { in: [...STAFF_ROLES] } }, select: staffSelect });
  }
  if (target.kind === 'USER') return prisma.user.findMany({ where: { id: target.userId, isActive: true, role: { in: [...STAFF_ROLES] } }, select: staffSelect });
  const roles = target.kind === 'ADMINS' ? (['ADMIN', 'SUPER_ADMIN'] as const) : ([target.role] as const);
  const people = await prisma.user.findMany({ where: { isActive: true, role: { in: [...roles] } }, select: staffSelect, orderBy: { createdAt: 'asc' } });
  if (!single || people.length <= 1) return people;
  const open = await prisma.taskAssignee.groupBy({ by: ['userId'], where: { userId: { in: people.map((p) => p.id) }, task: { status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } } }, _count: { _all: true } });
  const load = new Map(open.map((o) => [o.userId, o._count._all]));
  return [[...people].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0]];
};

/** The user recorded as actor of status changes / notes: the rule's editor, else any active admin. */
export const ruleActor = async (rule: RuleRef) => {
  for (const id of [rule.updatedById, rule.createdById]) {
    if (!id) continue;
    const u = await prisma.user.findFirst({ where: { id, isActive: true, role: { in: [...STAFF_ROLES] } }, select: { id: true, locale: true } });
    if (u) return u;
  }
  return prisma.user.findFirst({ where: { isActive: true, role: { in: ['SUPER_ADMIN', 'ADMIN'] } }, orderBy: { createdAt: 'asc' }, select: { id: true, locale: true } });
};

const pick = (o: Record<Locale, string>, l: Locale) => o[l]?.trim() || o.de?.trim() || o.en?.trim() || o.az?.trim() || o.ru?.trim() || '';

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/** Client message title/body in the recipient's language. */
const clientMessage = async (action: Extract<Action, { type: 'SEND_CLIENT_MESSAGE' }>, ctx: AutoContext, locale: Locale) => {
  const v = placeholderValues(ctx, locale);
  if (action.message.kind === 'TEMPLATE') {
    return renderNotification(action.message.key as NotificationType, locale, {
      number: v['case.number'],
      firstName: v['client.firstName'],
      note: ctx.document?.reviewNote ?? ctx.case?.staffNote ?? null,
      doc: v['document.title'] || undefined,
      date: v['appointment.date'] || undefined,
      place: v['appointment.place'] || undefined,
      reason: ctx.case?.decisionReason ?? ctx.case?.cancelReason ?? undefined,
    });
  }
  return { title: renderAutomationTemplate(pick(action.message.title, locale), v), body: renderAutomationTemplate(pick(action.message.body, locale), v) };
};

export const executeAction = async (action: Action, ctx: AutoContext, rule: RuleRef, opts: { dryRun?: boolean } = {}): Promise<ActionOutcome> => {
  const dry = opts.dryRun === true;
  const c = ctx.case;
  try {
    switch (action.type) {
      case 'CREATE_TASK': {
        const [assignee] = await resolveStaff(action.assignee, ctx, true);
        if (!assignee) return skip('NO_ASSIGNEE');
        const v = placeholderValues(ctx, assignee.locale);
        const title = renderAutomationTemplate(action.title, v).trim() || action.title;
        const description = action.description ? renderAutomationTemplate(action.description, v) : null;
        const dueAt = action.dueInDays !== null && action.dueInDays !== undefined ? new Date(Date.now() + action.dueInDays * 86_400_000) : null;
        const preview = { title, description, assignee: { id: assignee.id, name: fullName(assignee) }, dueAt: dueAt?.toISOString() ?? null, priority: action.priority, caseId: c?.id ?? null };
        if (dry) return ok(preview);
        const task = await createAutomationTask({ title, description, assigneeIds: [assignee.id], dueAt, priority: action.priority, caseId: c?.id ?? null, createdById: (await ruleActor(rule))?.id ?? null });
        return ok({ ...preview, taskId: task.id, taskKey: task.key });
      }

      case 'SEND_CLIENT_MESSAGE': {
        const r = ctx.recipient;
        if (!r) return skip('NO_RECIPIENT');
        const { title, body } = await clientMessage(action, ctx, r.locale);
        if (!title.trim() && !body.trim()) return skip('EMPTY_MESSAGE');
        const user = r.userId ? await prisma.user.findUnique({ where: { id: r.userId }, select: { isActive: true, emailNotifications: true, smsNotifications: true, phone: true } }) : null;
        if (r.userId && !user?.isActive) return skip('RECIPIENT_INACTIVE');
        const link = c && r.userId === c.clientId ? `/account/cases/${c.id}` : undefined;
        const channels: Record<string, string> = {};
        for (const ch of action.channels) {
          if (ch === 'IN_APP') channels.IN_APP = r.userId ? 'send' : 'NO_ACCOUNT';
          if (ch === 'EMAIL') channels.EMAIL = !r.email ? 'NO_EMAIL' : user && user.emailNotifications === false ? 'OPTED_OUT' : 'send';
          if (ch === 'SMS') channels.SMS = !(user?.phone ?? r.phone) ? 'NO_PHONE' : user && user.smsNotifications === false ? 'OPTED_OUT' : 'send';
        }
        const preview = { to: { name: `${r.firstName} ${r.lastName}`.trim(), email: r.email, phone: r.phone, locale: r.locale }, title, body, channels };
        const sendable = Object.entries(channels).filter(([, s]) => s === 'send').map(([k]) => k);
        if (!sendable.length) return skip('NO_CHANNEL', preview);
        if (dry) return ok(preview);
        if (sendable.includes('IN_APP')) await notifyUser(r.userId!, { type: 'AUTOMATION', title, body, link, caseId: c?.id, email: false });
        if (sendable.includes('EMAIL')) {
          const cta = link ? { label: automationTexts(r.locale).open, url: `${config.clientUrl}${link}` } : undefined;
          void sendMail(r.email!, `Triad Vision · ${title}`, renderEmail(title, body, cta));
        }
        if (sendable.includes('SMS')) await sendSms({ userId: r.userId, to: r.userId ? null : r.phone, caseId: c?.id ?? null, templateKey: 'AUTOMATION' }, `${title}\n\n${body}`.slice(0, 900));
        return ok({ ...preview, sent: sendable });
      }

      case 'NOTIFY_STAFF': {
        const people = await resolveStaff(action.target, ctx, false);
        if (!people.length) return skip('NO_RECIPIENT');
        const msgs = people.map((p) => {
          const v = placeholderValues(ctx, p.locale);
          return { id: p.id, name: fullName(p), title: renderAutomationTemplate(action.title, v), body: renderAutomationTemplate(action.body, v) };
        });
        const preview = { recipients: msgs.map((m) => ({ id: m.id, name: m.name })), title: msgs[0].title, body: msgs[0].body };
        if (dry) return ok(preview);
        for (const m of msgs) {
          await notifyUser(m.id, { type: 'AUTOMATION', title: m.title, body: m.body, link: c ? `/admin/cases/${c.id}` : ctx.inquiry ? '/admin/inquiries' : ctx.booking ? '/admin/bookings' : undefined, caseId: c?.id });
        }
        return ok(preview);
      }

      case 'REQUEST_DOCUMENT': {
        if (!c) return skip('NO_CASE');
        if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(c.status)) return skip('CASE_CLOSED');
        const existing = await prisma.documentRequirement.findFirst({ where: { caseId: c.id, key: action.requirementKey }, select: { id: true } });
        const preview = { requirementKey: action.requirementKey, title: action.title, mode: existing ? 'reminder' : 'new', notifyClient: action.notifyClient };
        if (dry) return ok(preview);
        const actor = await ruleActor(rule);
        if (!actor) return { status: 'FAILED', reason: 'NO_ACTOR' };
        const r = await requestDocument(c.id, { requirementKey: action.requirementKey, title: action.title }, actor.id, { notify: action.notifyClient });
        return ok({ ...preview, requirementId: r.requirement.id, created: r.created });
      }

      case 'CHANGE_STATUS': {
        if (!c) return skip('NO_CASE');
        const allowed = AUTOMATION_TRANSITIONS[action.to] as readonly string[];
        if (!allowed.includes(c.status)) return skip('TRANSITION_NOT_ALLOWED', { from: c.status, to: action.to });
        const actor = await ruleActor(rule);
        if (!actor) return { status: 'FAILED', reason: 'NO_ACTOR' };
        const note = renderAutomationTemplate(action.note ?? '', placeholderValues(ctx, c.client.locale)).trim();
        const preview = { from: c.status, to: action.to, note: note || null };
        if (dry) return ok(preview);
        if (action.to === 'DOCUMENTS_PENDING' || (action.to === 'EMBASSY_DOCUMENTS' && c.status === 'EMBASSY_REVIEW')) await staffRequestChanges(c.id, actor.id, note || automationTexts(c.client.locale).changesRequested);
        else if (action.to === 'EMBASSY_DOCUMENTS') await staffConfirmContract(c.id, actor.id);
        else if (action.to === 'DECISION_PENDING') await staffMarkLodged(c.id, actor.id);
        else await staffCancel(c.id, actor.id, note || automationTexts(c.client.locale).cancelled);
        return ok(preview);
      }

      case 'ASSIGN': {
        if (!c) return skip('NO_CASE');
        if (action.onlyIfUnassigned && c.assignedStaffId) return skip('ALREADY_ASSIGNED', { current: c.assignedStaffId });
        if (action.mode === 'USER') {
          const u = action.userId ? await prisma.user.findFirst({ where: { id: action.userId, isActive: true, role: { in: [...STAFF_ROLES] } }, select: staffSelect }) : null;
          if (!u) return skip('NO_ASSIGNEE');
          if (c.assignedStaffId === u.id) return skip('ALREADY_ASSIGNED', { current: u.id });
          const preview = { to: { id: u.id, name: fullName(u) }, mode: 'USER' };
          if (dry) return ok(preview);
          const done = await assignCase(c.id, u.id, { actorId: (await ruleActor(rule))?.id ?? null, reason: 'automation', from: c.assignedStaffId });
          return done ? ok(preview) : skip('CHANGED_CONCURRENTLY');
        }
        if (dry) {
          const target = await targetOfCase(c.id);
          const id = await pickAssignee(prisma, { ...target, excludeIds: c.assignedStaffId ? [c.assignedStaffId] : [] }, { force: true });
          if (!id) return skip('NO_ELIGIBLE_STAFF');
          const u = await prisma.user.findUnique({ where: { id }, select: staffSelect });
          return ok({ to: u ? { id: u.id, name: fullName(u) } : { id }, mode: 'AUTO' });
        }
        const r = await autoAssignCase(c.id, { actorId: (await ruleActor(rule))?.id ?? null, onlyIfUnassigned: action.onlyIfUnassigned });
        return r.assigned ? ok({ to: { id: r.assigned }, mode: 'AUTO' }) : skip(r.reason ?? 'NO_ELIGIBLE_STAFF');
      }

      case 'ADD_NOTE': {
        if (!c) return skip('NO_CASE');
        const actor = await ruleActor(rule);
        const text = renderAutomationTemplate(action.text, placeholderValues(ctx, actor?.locale ?? 'az')).trim();
        if (!text) return skip('EMPTY_MESSAGE');
        const note = `[${rule.name}] ${text}`.slice(0, 4000);
        if (dry) return ok({ note });
        await prisma.caseEvent.create({ data: { caseId: c.id, type: 'INTERNAL_NOTE', note, actorId: actor?.id ?? null, visibleToClient: false } });
        return ok({ note });
      }

      case 'WEBHOOK': {
        const hooks = await prisma.webhook.count({ where: { active: true, ...(c?.companyId ? { OR: [{ companyId: c.companyId }, { companyId: null }] } : { companyId: null }) } });
        const payload = {
          rule: { id: rule.id, name: rule.name },
          trigger: ctx.triggerType,
          entityType: ctx.entityType,
          entityId: ctx.entityId,
          case: c ? { id: c.id, number: c.number, status: c.status } : null,
        };
        if (dry) return ok({ subscribedWebhooks: hooks, payload });
        await emitWebhook('automation.triggered', payload, c?.companyId ?? null);
        return ok({ payload });
      }
    }
  } catch (err) {
    const code = (err as { code?: string }).code;
    const msg = ((err as Error).message ?? String(err)).slice(0, 500);
    return { status: 'FAILED', reason: code && code !== msg ? `${code}: ${msg}` : msg };
  }
};
