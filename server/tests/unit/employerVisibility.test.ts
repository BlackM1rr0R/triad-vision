import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { EMPLOYER_REVEALED_STATUSES, isEmployerRevealed } from '../../src/lib/caseContracts/employerVisibility';

describe('isEmployerRevealed', () => {
  it('hides the employer until the case reaches the embassy documents (German documents sent)', () => {
    const early: CaseStatus[] = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'REJECTED', 'CANCELLED'];
    for (const s of early) expect(isEmployerRevealed(s, false), s).toBe(false);
  });

  it('reveals it for old cases whose retired work contract (İş müqaviləsi) was approved, whatever the status', () => {
    expect(isEmployerRevealed('CONTRACT_SIGNED', true)).toBe(true);
  });

  it('keeps cases past the contract stage revealed (embassy stages and later)', () => {
    for (const s of EMPLOYER_REVEALED_STATUSES) expect(isEmployerRevealed(s, false), s).toBe(true);
    expect(EMPLOYER_REVEALED_STATUSES).toEqual(['EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED']);
  });
});
