import type { CaseStatus } from '@/lib/types';

/** Shapes of /api/admin/recognition and /api/admin/accelerated (server/src/lib/recognition). */

export const PROCEDURE_TYPES = ['ZAB_STATEMENT', 'FULL_RECOGNITION', 'PARTIAL_RECOGNITION', 'IHK_FOSA', 'HWK'] as const;
export type ProcedureType = (typeof PROCEDURE_TYPES)[number];
export const RECOGNITION_STATUSES = ['PREPARING', 'SUBMITTED', 'IN_REVIEW', 'DEFICIT_NOTICE', 'ADAPTATION', 'RECOGNISED', 'PARTIALLY_RECOGNISED', 'REJECTED', 'WITHDRAWN'] as const;
export type ProcessStatus = (typeof RECOGNITION_STATUSES)[number];
export const ADAPTATION_MEASURES = ['ANPASSUNGSLEHRGANG', 'KENNTNISPRUEFUNG', 'EIGNUNGSPRUEFUNG'] as const;
export const CHECK_KEYS = ['DIPLOMA', 'TRANSCRIPT', 'TRANSLATIONS', 'PASSPORT', 'CV', 'WORK_CERTIFICATES', 'GERMAN_CERT', 'GOOD_STANDING', 'APPLICATION_FORM', 'FEE'] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];

export const STATUS_TONE: Record<ProcessStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'accent'> = {
  PREPARING: 'neutral',
  SUBMITTED: 'info',
  IN_REVIEW: 'info',
  DEFICIT_NOTICE: 'warning',
  ADAPTATION: 'accent',
  RECOGNISED: 'success',
  PARTIALLY_RECOGNISED: 'warning',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

export interface ChecklistItem {
  key: CheckKey;
  done: boolean;
  documentId: string | null;
  optional: boolean;
  client: boolean;
}

export interface RecognitionEvent {
  id: string;
  type: 'STATUS' | 'NOTE' | 'DOCUMENT' | 'LETTER_IN' | 'LETTER_OUT' | 'DEADLINE';
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  documentId: string | null;
  actor: string | null;
  at: string;
}

export interface RecognitionProcess {
  id: string;
  caseId: string;
  clientId: string;
  profession: string;
  regulated: boolean;
  procedureType: ProcedureType;
  authority: string | null;
  federalState: string | null;
  reference: string | null;
  status: ProcessStatus;
  checklist: ChecklistItem[];
  submittedAt: string | null;
  feeCents: number | null;
  feePaidAt: string | null;
  decisionAt: string | null;
  deficitNotes: string | null;
  adaptationMeasure: (typeof ADAPTATION_MEASURES)[number] | null;
  adaptationUntil: string | null;
  nextDeadline: string | null;
  nextDeadlineNote: string | null;
  note: string | null;
  progress: { done: number; total: number };
  deadline: { at: string; kind: 'NEXT' | 'ADAPTATION' } | null;
  final: boolean;
  events: RecognitionEvent[];
  invoice: { id: string; number: string; status: string; grossCents: number } | null;
}

export interface CaseDoc {
  id: string;
  name: string;
  stage: string;
  status: string;
  requirementKey: string | null;
  size?: number;
  createdAt: string;
}

export interface CaseRecognition {
  case: { id: string; number: string; profession: string };
  clientStatus: string | null;
  clientNote: string | null;
  processes: RecognitionProcess[];
  documents: CaseDoc[];
  defaults: { authority: Record<ProcedureType, string | null>; feeCents: Partial<Record<ProcedureType, number>> };
}

export interface RecognitionRow {
  id: string;
  procedureType: ProcedureType;
  profession: string;
  regulated: boolean;
  authority: string | null;
  federalState: string | null;
  reference: string | null;
  status: ProcessStatus;
  feeCents: number | null;
  feePaidAt: string | null;
  adaptationMeasure: string | null;
  nextDeadlineNote: string | null;
  deadline: { at: string; kind: 'NEXT' | 'ADAPTATION' } | null;
  daysLeft: number | null;
  progress: { done: number; total: number };
  case: { id: string; number: string; status: CaseStatus };
  client: { id: string; name: string };
  staff: { id: string; name: string } | null;
}

export interface RecognitionList {
  items: RecognitionRow[];
  counts: { byStatus: Record<string, number>; open: number; overdue: number; soon: number };
  authorities: { name: string; count: number }[];
}

// ─── § 81a ────────────────────────────────────────────────────────────

export const ACCEL_PATH = ['PREPARING', 'POWER_OF_ATTORNEY', 'AGREEMENT_SIGNED', 'SUBMITTED', 'FEE_REQUESTED', 'FEE_PAID', 'IN_REVIEW', 'PRE_APPROVAL', 'SENT_TO_EMBASSY', 'APPOINTMENT_BOOKED', 'VISA_DECIDED'] as const;
export type AccelStatus = (typeof ACCEL_PATH)[number] | 'REJECTED' | 'CANCELLED';
export const ACCEL_CHANNELS = ['EMAIL', 'LETTER', 'PORTAL', 'PHONE', 'FAX'] as const;
export type AccelDeadlineKind = 'APPOINTMENT' | 'DECISION' | 'REPLY' | 'FEE';
export type EmployerTodo = 'SIGN_AGREEMENT' | 'PAY_FEE';

export interface AccelStep {
  status: (typeof ACCEL_PATH)[number];
  at: string | null;
  done: boolean;
  current: boolean;
}

export interface AcceleratedProcedure {
  id: string;
  caseId: string;
  companyId: string | null;
  authority: string | null;
  authorityEmail: string | null;
  reference: string | null;
  status: AccelStatus;
  powerOfAttorneyAt: string | null;
  agreementSignedAt: string | null;
  submittedAt: string | null;
  feeCents: number | null;
  feeRequestedAt: string | null;
  feePaidAt: string | null;
  preApprovalAt: string | null;
  preApprovalDocId: string | null;
  embassyNotifiedAt: string | null;
  appointmentDeadline: string | null;
  appointmentAt: string | null;
  decisionDeadline: string | null;
  decidedAt: string | null;
  note: string | null;
  steps: AccelStep[];
  final: boolean;
  deadlines: { kind: AccelDeadlineKind; at: string }[];
  employerTodos: EmployerTodo[];
  vollmacht: { id: string; status: string; sentAt: string | null; completedAt: string | null } | null;
}

export interface AccelMessage {
  id: string;
  direction: 'IN' | 'OUT';
  channel: (typeof ACCEL_CHANNELS)[number];
  subject: string | null;
  body: string | null;
  documentId: string | null;
  dueAt: string | null;
  actor: string | null;
  at: string;
}

export interface CaseAccelerated {
  case: { id: string; number: string };
  company: { id: string; name: string; email: string | null } | null;
  canStart: boolean;
  procedure: AcceleratedProcedure | null;
  messages: AccelMessage[];
  documents: CaseDoc[];
  defaults: { feeCents: number };
}

export interface AcceleratedRow {
  id: string;
  status: AccelStatus;
  authority: string | null;
  reference: string | null;
  feeCents: number | null;
  feeRequestedAt: string | null;
  feePaidAt: string | null;
  preApprovalAt: string | null;
  appointmentDeadline: string | null;
  appointmentAt: string | null;
  decisionDeadline: string | null;
  next: { kind: AccelDeadlineKind; at: string } | null;
  daysLeft: number | null;
  todos: EmployerTodo[];
  company: { id: string; name: string } | null;
  case: { id: string; number: string; status: CaseStatus };
  client: { id: string; name: string };
  staff: { id: string; name: string } | null;
}

/** Employer portal (worker drawer). */
export interface EmployerAccelerated {
  status: AccelStatus;
  authority: string | null;
  reference: string | null;
  feeCents: number | null;
  feeRequestedAt: string | null;
  feePaidAt: string | null;
  appointmentDeadline: string | null;
  appointmentAt: string | null;
  decisionDeadline: string | null;
  steps: AccelStep[];
  todos: EmployerTodo[];
  final: boolean;
}

export const euro = (cents: number | null | undefined, locale = 'de-DE') => (cents == null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100));
/** 'YYYY-MM-DD' of an ISO date (calendar days are stored at noon UTC). */
export const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
