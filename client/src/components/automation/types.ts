import type { CaseStatus } from '@/lib/types';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { errorCode } from '@/lib/api';
import { errorMessage } from '@/components/admin/labels';

/** Client-side mirror of server/src/lib/automation/schema.ts (rule JSON) and the assignment API. */

export type Lang = 'az' | 'de' | 'en' | 'ru';
export const LANGS: Lang[] = ['az', 'de', 'en', 'ru'];
export type L10n = Record<Lang, string>;
export const emptyL10n = (): L10n => ({ az: '', de: '', en: '', ru: '' });

export const CASE_STATUSES: CaseStatus[] = [
  'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED', 'CANCELLED',
];
export const OPEN_STATUSES = CASE_STATUSES.slice(0, 8);
export const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
export type VisaType = (typeof VISA_TYPES)[number];
export const APP_STATUSES = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const;
export const DOC_STAGES = ['INITIAL', 'EMBASSY', 'CONTRACT', 'CONTRACT_SIGNED', 'VISA', 'OTHER'] as const;
export type DocStage = (typeof DOC_STAGES)[number];

export type TriggerType =
  | 'CASE_STATUS_CHANGED' | 'CASE_CREATED' | 'DOCUMENT_UPLOADED' | 'DOCUMENT_ACCEPTED' | 'DOCUMENT_REJECTED' | 'CONTRACT_SIGNED'
  | 'APPOINTMENT_SET' | 'CLIENT_INACTIVE' | 'STATUS_DURATION' | 'APPLICATION_STATUS_CHANGED' | 'BOOKING_CREATED' | 'INQUIRY_CREATED';

export type Trigger =
  | { type: 'CASE_STATUS_CHANGED'; from: CaseStatus[]; to: CaseStatus[] }
  | { type: 'CASE_CREATED' }
  | { type: 'DOCUMENT_UPLOADED'; stages: DocStage[]; byClientOnly: boolean }
  | { type: 'DOCUMENT_ACCEPTED'; stages: DocStage[] }
  | { type: 'DOCUMENT_REJECTED'; stages: DocStage[] }
  | { type: 'CONTRACT_SIGNED' }
  | { type: 'APPOINTMENT_SET'; includeReschedule: boolean }
  | { type: 'CLIENT_INACTIVE'; days: number; statuses: CaseStatus[] }
  | { type: 'STATUS_DURATION'; status: CaseStatus; days: number }
  | { type: 'APPLICATION_STATUS_CHANGED'; to: string[] }
  | { type: 'BOOKING_CREATED' }
  | { type: 'INQUIRY_CREATED'; kinds: ('company' | 'contact')[] };

export const TRIGGER_TYPES: TriggerType[] = [
  'CASE_CREATED', 'CASE_STATUS_CHANGED', 'DOCUMENT_UPLOADED', 'DOCUMENT_ACCEPTED', 'DOCUMENT_REJECTED', 'CONTRACT_SIGNED',
  'APPOINTMENT_SET', 'CLIENT_INACTIVE', 'STATUS_DURATION', 'APPLICATION_STATUS_CHANGED', 'BOOKING_CREATED', 'INQUIRY_CREATED',
];

export const defaultTrigger = (type: TriggerType): Trigger => {
  switch (type) {
    case 'CASE_STATUS_CHANGED': return { type, from: [], to: [] };
    case 'DOCUMENT_UPLOADED': return { type, stages: [], byClientOnly: true };
    case 'DOCUMENT_ACCEPTED':
    case 'DOCUMENT_REJECTED': return { type, stages: [] };
    case 'APPOINTMENT_SET': return { type, includeReschedule: true };
    case 'CLIENT_INACTIVE': return { type, days: 7, statuses: [] };
    case 'STATUS_DURATION': return { type, status: 'DOCUMENTS_REVIEW', days: 3 };
    case 'APPLICATION_STATUS_CHANGED': return { type, to: [] };
    case 'INQUIRY_CREATED': return { type, kinds: [] };
    default: return { type } as Trigger;
  }
};

export type ConditionType = 'VISA_TYPE' | 'VISA_CATEGORY' | 'CASE_STATUS' | 'CLIENT_NATIONALITY' | 'CLIENT_LANGUAGE' | 'ASSIGNED_STAFF' | 'COMPANY' | 'REQUIREMENT';
export const CONDITION_TYPES: ConditionType[] = ['VISA_TYPE', 'VISA_CATEGORY', 'CASE_STATUS', 'CLIENT_LANGUAGE', 'CLIENT_NATIONALITY', 'ASSIGNED_STAFF', 'COMPANY', 'REQUIREMENT'];
export type Condition =
  | { type: 'VISA_TYPE' | 'VISA_CATEGORY' | 'CASE_STATUS' | 'CLIENT_NATIONALITY' | 'CLIENT_LANGUAGE'; op: 'in' | 'not_in'; values: string[] }
  | { type: 'ASSIGNED_STAFF'; op: 'set' | 'not_set' | 'is' | 'is_not'; values: string[] }
  | { type: 'COMPANY'; op: 'in' | 'not_in' | 'set' | 'not_set'; values: string[] }
  | { type: 'REQUIREMENT'; op: 'fulfilled' | 'missing'; key: string };

export const OPS: Record<ConditionType, string[]> = {
  VISA_TYPE: ['in', 'not_in'],
  VISA_CATEGORY: ['in', 'not_in'],
  CASE_STATUS: ['in', 'not_in'],
  CLIENT_NATIONALITY: ['in', 'not_in'],
  CLIENT_LANGUAGE: ['in', 'not_in'],
  ASSIGNED_STAFF: ['set', 'not_set', 'is', 'is_not'],
  COMPANY: ['in', 'not_in', 'set', 'not_set'],
  REQUIREMENT: ['missing', 'fulfilled'],
};

export const defaultCondition = (type: ConditionType): Condition =>
  type === 'REQUIREMENT' ? { type, op: 'missing', key: '' } : type === 'ASSIGNED_STAFF' ? { type, op: 'not_set', values: [] } : ({ type, op: 'in', values: [] } as Condition);

export type StaffTarget = { kind: 'CASE_OWNER' } | { kind: 'USER'; userId: string } | { kind: 'ROLE'; role: 'STAFF' | 'ADMIN' | 'SUPER_ADMIN' } | { kind: 'ADMINS' };
export interface Delay { amount: number; unit: 'HOURS' | 'DAYS' }
interface Common { delay?: Delay | null; onlyIfStillTrue?: boolean }

export type ActionType = 'CREATE_TASK' | 'SEND_CLIENT_MESSAGE' | 'NOTIFY_STAFF' | 'REQUEST_DOCUMENT' | 'CHANGE_STATUS' | 'ASSIGN' | 'ADD_NOTE' | 'WEBHOOK';
export const ACTION_TYPES: ActionType[] = ['CREATE_TASK', 'SEND_CLIENT_MESSAGE', 'NOTIFY_STAFF', 'REQUEST_DOCUMENT', 'CHANGE_STATUS', 'ASSIGN', 'ADD_NOTE', 'WEBHOOK'];
export type Action = Common &
  (
    | { type: 'CREATE_TASK'; title: string; description?: string; assignee: StaffTarget; dueInDays?: number | null; priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' }
    | { type: 'SEND_CLIENT_MESSAGE'; channels: ('EMAIL' | 'IN_APP' | 'SMS')[]; message: { kind: 'TEMPLATE'; key: string } | { kind: 'CUSTOM'; title: L10n; body: L10n } }
    | { type: 'NOTIFY_STAFF'; target: StaffTarget; title: string; body: string }
    | { type: 'REQUEST_DOCUMENT'; requirementKey: string; title: L10n; notifyClient: boolean }
    | { type: 'CHANGE_STATUS'; to: 'DOCUMENTS_PENDING' | 'EMBASSY_DOCUMENTS' | 'DECISION_PENDING' | 'CANCELLED'; note: string }
    | { type: 'ASSIGN'; mode: 'AUTO' | 'USER'; userId?: string; onlyIfUnassigned: boolean }
    | { type: 'ADD_NOTE'; text: string }
    | { type: 'WEBHOOK' }
  );

export const defaultAction = (type: ActionType): Action => {
  switch (type) {
    case 'CREATE_TASK': return { type, title: '{{case.number}}: ', assignee: { kind: 'CASE_OWNER' }, dueInDays: 2, priority: 'NORMAL' };
    case 'SEND_CLIENT_MESSAGE': return { type, channels: ['EMAIL', 'IN_APP'], message: { kind: 'CUSTOM', title: emptyL10n(), body: emptyL10n() } };
    case 'NOTIFY_STAFF': return { type, target: { kind: 'CASE_OWNER' }, title: '{{case.number}}: ', body: '' };
    case 'REQUEST_DOCUMENT': return { type, requirementKey: '', title: emptyL10n(), notifyClient: true };
    case 'CHANGE_STATUS': return { type, to: 'CANCELLED', note: '' };
    case 'ASSIGN': return { type, mode: 'AUTO', onlyIfUnassigned: true };
    case 'ADD_NOTE': return { type, text: '' };
    default: return { type: 'WEBHOOK' };
  }
};

export interface RuleDraft {
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
}

export interface Rule extends RuleDraft {
  id: string;
  triggerType: TriggerType;
  valid: boolean;
  exampleKey: string | null;
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats30d: Partial<Record<RunStatus, number>>;
}

export type RunStatus = 'RUNNING' | 'WAITING' | 'SUCCEEDED' | 'PARTIAL' | 'SKIPPED' | 'FAILED';
export type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
export interface Run {
  id: string;
  status: RunStatus;
  reason: string | null;
  triggerType: TriggerType;
  entityType: string;
  entityId: string;
  caseId: string | null;
  caseNumber: string | null;
  depth: number;
  createdAt: string;
  finishedAt: string | null;
  steps: { index: number; actionType: ActionType; status: StepStatus; runAt: string; executedAt: string | null; reason: string | null; onlyIfStillTrue: boolean; result: Record<string, unknown> | null }[];
}

export interface Person { id: string; firstName: string; lastName: string; role: string }
export interface Meta {
  placeholders: string[];
  notificationTemplates: string[];
  transitions: Record<string, string[]>;
  staff: Person[];
  visaCategories: { id: string; title: L10n; visaLabel: string }[];
  companies: { id: string; name: string }[];
  requirements: { key: string; title: L10n; stage: string }[];
}

export interface DryRun {
  matched: boolean;
  trigger: { ok: boolean; reason?: string };
  conditions: { index: number; type: ConditionType; ok: boolean; reason?: string; seen?: string | null }[];
  actions: { index: number; type: ActionType; delayMs: number; onlyIfStillTrue: boolean; status: 'SUCCEEDED' | 'SKIPPED' | 'FAILED'; reason?: string; result?: Record<string, unknown> }[];
  sample: { entityType: string; entityId: string; case: { id: string; number: string; status: CaseStatus } | null } | null;
}

// ─── Assignment ─────────────────────────────────────────────────────────

export type Mode = 'off' | 'roundRobin' | 'leastLoaded';
export interface AssignmentConfig {
  mode: Mode;
  staffIds?: string[];
  matchLanguage: boolean;
  matchVisaType: boolean;
  respectMaxOpen: boolean;
  respectWorkingDays: boolean;
  weights: Record<string, number>;
  inquiries: boolean;
  handover: boolean;
}
export interface StaffPrefs { languages: Lang[]; visaTypes: VisaType[]; visaCategoryIds: string[]; maxOpenCases: number | null; workingDays: number[]; autoAssign: boolean }
export interface StaffLoadRow { id: string; firstName: string; lastName: string; role: string; open: number; weighted: number; maxOpenCases: number | null; autoAssign: boolean; inPool: boolean; absentUntil: string | null; prefs: StaffPrefs }
export interface Overview {
  config: AssignmentConfig;
  staff: StaffLoadRow[];
  unassigned: number;
  suggestion: { caseId: string; number: string; fromId: string | null; toId: string; fromName: string | null; toName: string }[];
  activeHandovers: number;
}
export interface Handover {
  id: string; caseId: string; caseNumber: string | null; caseStatus: CaseStatus | null; originalStaffId: string; substituteId: string; originalName: string | null; substituteName: string | null;
  status: 'ACTIVE' | 'RETURNED' | 'KEPT'; startedAt: string; plannedEndAt: string | null; endedAt: string | null;
}

/** Placeholder key (dotted) → copy key (underscored). */
export const phKey = (k: string) => `automation.ph.${k.replace('.', '_')}`;

/** Reason codes may carry a detail ("CONDITION_NOT_MET:VISA_TYPE", "NO_LONGER_TRUE:STATUS_CHANGED_SINCE"). */
export const reasonText = (reason: string | null | undefined) => {
  if (!reason) return '';
  const [head, ...rest] = reason.split(':');
  const t = (k: string) => (i18n.exists(`automation.reasons.${k}`) ? i18n.t(`automation.reasons.${k}`) : null);
  const main = t(head);
  if (!main) return reason;
  const tail = rest.map((r) => (i18n.exists(`automation.conditions.${r}`) ? i18n.t(`automation.conditions.${r}`) : t(r) ?? r)).filter(Boolean);
  return tail.length ? `${main}: ${tail.join(' · ')}` : main;
};

export const toastAutomationError = (err: unknown) => {
  const code = errorCode(err);
  const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (code && i18n.exists(`automation.errors.${code}`)) toast.error(i18n.t(`automation.errors.${code}`, { detail: detail ?? '' }));
  else toast.error(errorMessage(err));
};

export const fmtDelay = (ms: number) => {
  const h = Math.round(ms / 3_600_000);
  return h % 24 === 0 ? `${h / 24} ${i18n.t('automation.editor.days')}` : `${h} ${i18n.t('automation.editor.hours')}`;
};
