import { describe, expect, it } from 'vitest';
import { mainApprovedCaseId } from './celebration';
import { opensMoreArea } from './homeAnchors';
import { anchorTargetId, tabOfAnchor } from './useNextUp';

describe('portal anchors and links', () => {
  it('the permit reminder (/account#permits) opens the folded "More" area', () => {
    expect(opensMoreArea('#permits')).toBe(true);
    expect(opensMoreArea('#start')).toBe(false);
    expect(opensMoreArea('')).toBe(false);
  });

  it('#family (older notifications) opens the family tab and scrolls to the family section', () => {
    expect(tabOfAnchor('#family')).toBe('family');
    expect(anchorTargetId('#family')).toBe('family-members');
    expect(anchorTargetId('#family-members')).toBe('family-members');
    expect(anchorTargetId('#contract')).toBe('contract');
  });

  it('the visa story / Instagram card links use the own approved main case, never a family member case', () => {
    expect(mainApprovedCaseId([{ id: 'm', status: 'APPROVED', parentCaseId: 'a' }])).toBeNull();
    expect(
      mainApprovedCaseId([
        { id: 'm', status: 'APPROVED', parentCaseId: 'a' },
        { id: 'a', status: 'APPROVED', parentCaseId: null },
      ]),
    ).toBe('a');
    expect(mainApprovedCaseId([{ id: 'x', status: 'EMBASSY_REVIEW', parentCaseId: null }])).toBeNull();
  });
});
