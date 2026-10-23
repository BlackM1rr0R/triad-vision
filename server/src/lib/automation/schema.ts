import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../notifications.js';

/**
 * No-code automation rules: WHEN (trigger) · IF (conditions, AND) · THEN (ordered actions).
 * Everything an admin can build is described by these schemas — there is no free-form code anywhere;
 * texts are templates with a fixed set of {{placeholders}} (placeholders.ts).
 */

export const CASE_STATUSES = [
  'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED', 'CANCELLED',
] as const;
export const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
export const LOCALES = ['az', 'de', 'en', 'ru'] as const;
export const APPLICATION_STATUSES = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const;
export const DOC_STAGES = ['INITIAL', 'EMBASSY', 'CONTRACT', 'CONTRACT_SIGNED', 'VISA', 'OTHER'] as const;

export const TRIGGER_TYPES = [
  'CASE_STATUS_CHANGED',
  'CASE_CREATED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_ACCEPTED',
  'DOCUMENT_REJECTED',
  'CONTRACT_SIGNED',
  'APPOINTMENT_SET',
  'CLIENT_INACTIVE',
  'STATUS_DURATION',
  'APPLICATION_STATUS_CHANGED',
  'BOOKING_CREATED',
  'INQUIRY_CREATED',
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

/** Triggers evaluated by the 15-minute job instead of an event. */
export const TIME_TRIGGERS: TriggerType[] = ['CLIENT_INACTIVE', 'STATUS_DURATION'];

const id = z.string().trim().min(1).max(40);
const statuses = z.array(z.enum(CASE_STATUSES)).max(CASE_STATUSES.length);

export const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CASE_STATUS_CHANGED'), from: statuses.default([]), to: statuses.default([]) }),
  z.object({ type: z.literal('CASE_CREATED') }),
  z.object({ type: z.literal('DOCUMENT_UPLOADED'), stages: z.array(z.enum(DOC_STAGES)).max(6).default([]), byClientOnly: z.boolean().default(false) }),
  z.object({ type: z.literal('DOCUMENT_ACCEPTED'), stages: z.array(z.enum(DOC_STAGES)).max(6).default([]) }),
  z.object({ type: z.literal('DOCUMENT_REJECTED'), stages: z.array(z.enum(DOC_STAGES)).max(6).default([]) }),
  z.object({ type: z.literal('CONTRACT_SIGNED') }),
  z.object({ type: z.literal('APPOINTMENT_SET'), includeReschedule: z.boolean().default(true) }),
  z.object({ type: z.literal('CLIENT_INACTIVE'), days: z.number().int().min(1).max(365), statuses: statuses.default([]) }),
  z.object({ type: z.literal('STATUS_DURATION'), status: z.enum(CASE_STATUSES), days: z.number().int().min(1).max(365) }),
  z.object({ type: z.literal('APPLICATION_STATUS_CHANGED'), to: z.array(z.enum(APPLICATION_STATUSES)).max(7).default([]) }),
  z.object({ type: z.literal('BOOKING_CREATED') }),
  z.object({ type: z.literal('INQUIRY_CREATED'), kinds: z.array(z.enum(['company', 'contact'])).max(2).default([]) }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

export const CONDITION_TYPES = [
  'VISA_TYPE', 'VISA_CATEGORY', 'CASE_STATUS', 'CLIENT_NATIONALITY', 'CLIENT_LANGUAGE', 'ASSIGNED_STAFF', 'COMPANY', 'REQUIREMENT',
] as const;

const inOp = z.enum(['in', 'not_in']).default('in');
export const conditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('VISA_TYPE'), op: inOp, values: z.array(z.enum(VISA_TYPES)).min(1).max(7) }),
  z.object({ type: z.literal('VISA_CATEGORY'), op: inOp, values: z.array(id).min(1).max(50) }),
  z.object({ type: z.literal('CASE_STATUS'), op: inOp, values: statuses.min(1) }),
  z.object({ type: z.literal('CLIENT_NATIONALITY'), op: inOp, values: z.array(z.string().trim().min(1).max(60)).min(1).max(30) }),
  z.object({ type: z.literal('CLIENT_LANGUAGE'), op: inOp, values: z.array(z.enum(LOCALES)).min(1).max(4) }),
  z.object({ type: z.literal('ASSIGNED_STAFF'), op: z.enum(['set', 'not_set', 'is', 'is_not']), values: z.array(id).max(50).default([]) }),
  z.object({ type: z.literal('COMPANY'), op: z.enum(['in', 'not_in', 'set', 'not_set']), values: z.array(id).max(50).default([]) }),
  z.object({ type: z.literal('REQUIREMENT'), op: z.enum(['fulfilled', 'missing']), key: z.string().trim().min(1).max(60) }),
]);
export type Condition = z.infer<typeof conditionSchema>;

export const ACTION_TYPES = [
  'CREATE_TASK', 'SEND_CLIENT_MESSAGE', 'NOTIFY_STAFF', 'REQUEST_DOCUMENT', 'CHANGE_STATUS', 'ASSIGN', 'ADD_NOTE', 'WEBHOOK',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

const template = (max: number) => z.string().max(max);
const l10nTemplate = (max: number) => z.object({ az: template(max), de: template(max), en: template(max), ru: template(max) });

/** Who gets a task / staff notification. */
const staffTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('CASE_OWNER') }),
  z.object({ kind: z.literal('USER'), userId: id }),
  z.object({ kind: z.literal('ROLE'), role: z.enum(['STAFF', 'ADMIN', 'SUPER_ADMIN']) }),
  z.object({ kind: z.literal('ADMINS') }),
]);
export type StaffTarget = z.infer<typeof staffTarget>;

const common = {
  /** Run later: after N hours / days (counted from the trigger). */
  delay: z.object({ amount: z.number().int().min(1).max(365), unit: z.enum(['HOURS', 'DAYS']) }).nullable().optional(),
  /** For delayed actions: re-check the trigger and the conditions first and skip when they no longer hold. */
  onlyIfStillTrue: z.boolean().optional(),
};

/** Status changes an action may make: exactly the staff transitions of caseFlow that need no file / date / decision. */
export const AUTOMATION_TRANSITIONS = {
  DOCUMENTS_PENDING: ['DOCUMENTS_REVIEW'], // staffRequestChanges
  EMBASSY_DOCUMENTS: ['CONTRACT_SIGNED', 'EMBASSY_REVIEW'], // staffConfirmContract / staffRequestChanges
  DECISION_PENDING: ['APPOINTMENT_SCHEDULED'], // staffMarkLodged
  CANCELLED: ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'], // staffCancel
} as const;
export type AutomationTarget = keyof typeof AUTOMATION_TRANSITIONS;

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CREATE_TASK'),
    ...common,
    title: template(200).refine((s) => s.trim().length > 0, 'TITLE_REQUIRED'),
    description: template(4000).optional(),
    assignee: staffTarget,
    dueInDays: z.number().int().min(0).max(365).nullable().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  }),
  z.object({
    type: z.literal('SEND_CLIENT_MESSAGE'),
    ...common,
    channels: z.array(z.enum(['EMAIL', 'IN_APP', 'SMS'])).min(1).max(3),
    message: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('TEMPLATE'), key: z.enum(NOTIFICATION_TYPES as [string, ...string[]]) }),
      z.object({ kind: z.literal('CUSTOM'), title: l10nTemplate(200), body: l10nTemplate(4000) }),
    ]),
  }),
  z.object({
    type: z.literal('NOTIFY_STAFF'),
    ...common,
    target: staffTarget,
    title: template(200).refine((s) => s.trim().length > 0, 'TITLE_REQUIRED'),
    body: template(4000).default(''),
  }),
  z.object({
    type: z.literal('REQUEST_DOCUMENT'),
    ...common,
    requirementKey: z.string().trim().min(1).max(60),
    title: z.object({ az: z.string().max(200), de: z.string().max(200), en: z.string().max(200), ru: z.string().max(200) }),
    notifyClient: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('CHANGE_STATUS'),
    ...common,
    to: z.enum(Object.keys(AUTOMATION_TRANSITIONS) as [AutomationTarget, ...AutomationTarget[]]),
    note: template(1000).default(''),
  }),
  z.object({
    type: z.literal('ASSIGN'),
    ...common,
    mode: z.enum(['AUTO', 'USER']),
    userId: id.optional(),
    onlyIfUnassigned: z.boolean().default(true),
  }),
  z.object({ type: z.literal('ADD_NOTE'), ...common, text: template(4000).refine((s) => s.trim().length > 0, 'TEXT_REQUIRED') }),
  z.object({ type: z.literal('WEBHOOK'), ...common }),
]);
export type Action = z.infer<typeof actionSchema>;

export const ruleInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  enabled: z.boolean().optional(),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).max(20).default([]),
  actions: z.array(actionSchema).min(1).max(10),
});
export type RuleInput = z.infer<typeof ruleInputSchema>;

/** Rule as stored (JSON columns parsed); invalid stored JSON (should never happen) is reported, not thrown. */
export const parseStoredRule = (r: { trigger: unknown; conditions: unknown; actions: unknown }) => {
  const trigger = triggerSchema.safeParse(r.trigger);
  const conditions = z.array(conditionSchema).safeParse(r.conditions ?? []);
  const actions = z.array(actionSchema).safeParse(r.actions ?? []);
  if (!trigger.success || !conditions.success || !actions.success) return null;
  return { trigger: trigger.data, conditions: conditions.data, actions: actions.data };
};

export const delayMs = (a: Pick<Action, 'delay'>) =>
  a.delay ? a.delay.amount * (a.delay.unit === 'HOURS' ? 3_600_000 : 86_400_000) : 0;

/** Loop protection and rate limits. */
export const MAX_DEPTH = 3;
export const ENTITY_RATE_LIMIT = 20; // runs per entity …
export const ENTITY_RATE_WINDOW_MS = 60 * 60 * 1000; // … per hour
