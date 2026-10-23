import { STATUS_TONES, toneClasses, toneSolids } from '@/components/ui/status';
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

/** Badge classes per case status; tones come from the central vocabulary (components/ui/status.ts). */
export const STATUS_TONE: Record<CaseStatus, string> = toneClasses(STATUS_TONES.case);

/** Solid bar colour per status (status breakdown bars, status-history timeline). */
export const STATUS_BAR_TONE: Record<CaseStatus, string> = toneSolids(STATUS_TONES.case);
