import type { CaseStatus } from './types';

export const STEP_KEYS = ['documents', 'contract', 'embassyDocs', 'appointment', 'decision', 'result'] as const;

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

/** Statuses where the next move is the client's. */
export const CLIENT_ACTION: CaseStatus[] = ['DOCUMENTS_PENDING', 'CONTRACT_SENT', 'EMBASSY_DOCUMENTS'];
/** Statuses where the next move is the staff's. */
export const STAFF_ACTION: CaseStatus[] = ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'];
export const FINAL: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];

export const STATUS_TONE: Record<CaseStatus, string> = {
  DOCUMENTS_PENDING: 'bg-amber-100 text-amber-800',
  DOCUMENTS_REVIEW: 'bg-brand-100 text-brand-700',
  CONTRACT_SENT: 'bg-amber-100 text-amber-800',
  CONTRACT_SIGNED: 'bg-brand-100 text-brand-700',
  EMBASSY_DOCUMENTS: 'bg-amber-100 text-amber-800',
  EMBASSY_REVIEW: 'bg-brand-100 text-brand-700',
  APPOINTMENT_SCHEDULED: 'bg-violet-100 text-violet-800',
  DECISION_PENDING: 'bg-sky-100 text-sky-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-200 text-slate-600',
};
