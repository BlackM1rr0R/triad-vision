import { describe, expect, it } from 'vitest';
import { caseToCelebrate, CELEBRATE_WITHIN_DAYS } from './celebration';
import { requirementState } from '@/components/portal/requirementState';

const NOW = new Date('2026-11-14T09:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe('caseToCelebrate', () => {
  it('picks a recent approval, the main application before a family member', () => {
    const rows = [
      { id: 'm', status: 'APPROVED', decisionAt: daysAgo(2), parentCaseId: 'a' },
      { id: 'a', status: 'APPROVED', decisionAt: daysAgo(3), parentCaseId: null },
      { id: 'o', status: 'EMBASSY_REVIEW', decisionAt: null, parentCaseId: null },
    ];
    expect(caseToCelebrate(rows, NOW)?.id).toBe('a');
    expect(caseToCelebrate([rows[0], rows[2]], NOW)?.id).toBe('m');
  });

  it('nothing for open / refused cases or approvals older than the window', () => {
    expect(caseToCelebrate([{ id: 'r', status: 'REJECTED', decisionAt: daysAgo(1) }], NOW)).toBeNull();
    expect(caseToCelebrate([{ id: 'old', status: 'APPROVED', decisionAt: daysAgo(CELEBRATE_WITHIN_DAYS + 1) }], NOW)).toBeNull();
    expect(caseToCelebrate([], NOW)).toBeNull();
  });
});

describe('requirementState', () => {
  it('waiting / in review / accepted / rejected', () => {
    expect(requirementState([])).toBe('waiting');
    expect(requirementState([{ status: 'PENDING' }, { status: 'REJECTED' }])).toBe('review');
    expect(requirementState([{ status: 'REJECTED' }, { status: 'ACCEPTED' }])).toBe('accepted');
    expect(requirementState([{ status: 'REJECTED' }])).toBe('rejected');
  });
});
