import type { CaseStatus } from '@prisma/client';

/**
 * Data minimisation for the agent portal: an agent sees a referred client only as
 * "First L." and a coarse stage of their case, never documents, contacts or passport data.
 */
export const displayName = (u: { firstName: string; lastName: string }) => {
  const initial = u.lastName.trim().charAt(0).toUpperCase();
  return `${u.firstName.trim()}${initial ? ` ${initial}.` : ''}`.trim();
};

export const STAGES = ['REGISTERED', 'DOCUMENTS', 'CONTRACT', 'EMBASSY', 'APPROVED', 'CLOSED'] as const;
export type CoarseStage = (typeof STAGES)[number];

export const coarseStage = (status: CaseStatus | null | undefined): CoarseStage => {
  switch (status) {
    case undefined:
    case null:
      return 'REGISTERED';
    case 'DOCUMENTS_PENDING':
    case 'DOCUMENTS_REVIEW':
      return 'DOCUMENTS';
    case 'CONTRACT_SENT':
    case 'CONTRACT_SIGNED':
      return 'CONTRACT';
    case 'EMBASSY_DOCUMENTS':
    case 'EMBASSY_REVIEW':
    case 'APPOINTMENT_SCHEDULED':
    case 'DECISION_PENDING':
      return 'EMBASSY';
    case 'APPROVED':
      return 'APPROVED';
    default:
      return 'CLOSED';
  }
};
