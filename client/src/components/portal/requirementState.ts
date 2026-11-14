import type { DocStatus } from '@/lib/types';

/** State of one document requirement for the client: waiting for an upload / in review / accepted / rejected (an accepted file wins, then one in review). */
export type RequirementState = 'waiting' | 'review' | 'accepted' | 'rejected';

export const requirementState = (docs: { status: DocStatus }[]): RequirementState =>
  !docs.length ? 'waiting' : docs.some((d) => d.status === 'ACCEPTED') ? 'accepted' : docs.some((d) => d.status === 'PENDING') ? 'review' : 'rejected';
