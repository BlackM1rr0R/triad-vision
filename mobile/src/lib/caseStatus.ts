import { colors } from '@/theme';
import type { CaseDetail, CaseStatus, CaseSummary, DocStage, Requirement } from '@/types';

/** The 6 visible steps shown to clients (same as client/src/lib/caseStatus.ts). */
export const STEP_KEYS = ['documents', 'contract', 'embassyDocs', 'appointment', 'decision', 'result'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const STATUS_STEP: Record<CaseStatus, number> = {
  DOCUMENTS_PENDING: 0,
  DOCUMENTS_REVIEW: 0,
  CONTRACT_SENT: 1,
  CONTRACT_SIGNED: 1,
  EMBASSY_DOCUMENTS: 2,
  EMBASSY_REVIEW: 2,
  APPOINTMENT_SCHEDULED: 3,
  DECISION_PENDING: 4,
  APPROVED: 5,
  REJECTED: 5,
  CANCELLED: -1,
};

export const ALL_STATUSES = Object.keys(STATUS_STEP) as CaseStatus[];

/** Statuses where the next move is the client's. */
export const CLIENT_ACTION: CaseStatus[] = ['DOCUMENTS_PENDING', 'CONTRACT_SENT', 'EMBASSY_DOCUMENTS'];
/** Statuses where the next move is the staff's. */
export const STAFF_ACTION: CaseStatus[] = ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'];
export const FINAL: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];

export const isFinal = (s: CaseStatus) => FINAL.includes(s);

export type StepState = 'done' | 'current' | 'upcoming' | 'failed';

/** State of each of the 6 steps for a status — drives the stepper UI. */
export const stepStates = (status: CaseStatus): StepState[] => {
  const current = STATUS_STEP[status];
  return STEP_KEYS.map((_, i) => {
    if (current < 0) return 'upcoming';
    if (status === 'APPROVED') return 'done';
    if (status === 'REJECTED') return i < 5 ? 'done' : 'failed';
    if (i < current) return 'done';
    if (i === current) return 'current';
    return 'upcoming';
  });
};

/** 0..1 progress used for progress bars. */
export const progressOf = (status: CaseStatus) => {
  if (status === 'CANCELLED') return 0;
  if (status === 'APPROVED' || status === 'REJECTED') return 1;
  return (STATUS_STEP[status] + 0.5) / STEP_KEYS.length;
};

/** Which document stage the client may upload to (mirror of server CLIENT_UPLOAD_STAGE). */
export const CLIENT_UPLOAD_STAGE: Partial<Record<CaseStatus, DocStage>> = {
  DOCUMENTS_PENDING: 'INITIAL',
  EMBASSY_DOCUMENTS: 'EMBASSY',
};

export type StaffActionKey =
  | 'SEND_CONTRACT'
  | 'REQUEST_CHANGES'
  | 'CONFIRM_CONTRACT'
  | 'REJECT_SIGNATURE'
  | 'SCHEDULE'
  | 'MARK_LODGED'
  | 'DECIDE'
  | 'REOPEN'
  | 'CANCEL';

/** Workflow actions valid per status (mirror of server/src/lib/caseFlow.ts transitions). */
export const STAFF_ACTIONS: Record<CaseStatus, StaffActionKey[]> = {
  DOCUMENTS_PENDING: ['CANCEL'],
  DOCUMENTS_REVIEW: ['SEND_CONTRACT', 'REQUEST_CHANGES', 'CANCEL'],
  CONTRACT_SENT: ['SEND_CONTRACT', 'CANCEL'],
  CONTRACT_SIGNED: ['CONFIRM_CONTRACT', 'REJECT_SIGNATURE', 'SEND_CONTRACT', 'CANCEL'],
  EMBASSY_DOCUMENTS: ['CANCEL'],
  EMBASSY_REVIEW: ['SCHEDULE', 'REQUEST_CHANGES', 'CANCEL'],
  APPOINTMENT_SCHEDULED: ['MARK_LODGED', 'SCHEDULE', 'CANCEL'],
  DECISION_PENDING: ['DECIDE', 'CANCEL'],
  APPROVED: [],
  REJECTED: ['REOPEN'],
  CANCELLED: ['REOPEN'],
};

export const STATUS_TONE: Record<CaseStatus, { fg: string; bg: string }> = {
  DOCUMENTS_PENDING: { fg: colors.warning, bg: colors.warningSoft },
  DOCUMENTS_REVIEW: { fg: colors.blue, bg: colors.blueSoft },
  CONTRACT_SENT: { fg: colors.warning, bg: colors.warningSoft },
  CONTRACT_SIGNED: { fg: colors.blue, bg: colors.blueSoft },
  EMBASSY_DOCUMENTS: { fg: colors.warning, bg: colors.warningSoft },
  EMBASSY_REVIEW: { fg: colors.blue, bg: colors.blueSoft },
  APPOINTMENT_SCHEDULED: { fg: colors.violet, bg: colors.violetSoft },
  DECISION_PENDING: { fg: colors.sky, bg: colors.skySoft },
  APPROVED: { fg: colors.success, bg: colors.successSoft },
  REJECTED: { fg: colors.danger, bg: colors.dangerSoft },
  CANCELLED: { fg: colors.muted, bg: '#eceff4' },
};

/** Required requirements of a stage that are not yet satisfied. */
export const missingRequirements = (
  requirements: Requirement[],
  stage: DocStage,
  mode: 'uploaded' | 'accepted',
): Requirement[] =>
  requirements.filter(
    (r) =>
      r.stage === stage &&
      r.required &&
      !r.documents.some((d) => (mode === 'uploaded' ? d.status !== 'REJECTED' : d.status === 'ACCEPTED')),
  );

/** The case to show first: the newest non-final one, else the newest. */
export const pickActiveCase = <T extends CaseSummary>(cases: T[]): T | undefined => {
  const sorted = [...cases].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sorted.find((c) => !isFinal(c.status)) ?? sorted[0];
};

export const hasActiveCase = (cases: CaseSummary[]) => cases.some((c) => !isFinal(c.status));

/** Latest document of a requirement (server sorts desc, but be defensive). */
export const latestDocument = (r: Requirement) =>
  [...r.documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

export const caseHasStage = (c: Pick<CaseDetail, 'requirements'>, stage: DocStage) =>
  c.requirements.some((r) => r.stage === stage);
