/** Approvals older than this do not get the celebration screen any more (a new device months later should not celebrate again). */
export const CELEBRATE_WITHIN_DAYS = 45;

/** Pure: the approved case to celebrate (main application first), or null. */
export const caseToCelebrate = <C extends { id: string; status: string; decisionAt: string | null; parentCaseId?: string | null }>(cases: C[], now = Date.now()): C | null => {
  const recent = cases.filter((c) => c.status === 'APPROVED' && (!c.decisionAt || now - new Date(c.decisionAt).getTime() <= CELEBRATE_WITHIN_DAYS * 86_400_000));
  return recent.find((c) => !c.parentCaseId) ?? recent[0] ?? null;
};

/**
 * Pure: the client's own approved main application, or null. The visa story and the private Instagram card exist only
 * for it (server: lib/visaStory, lib/successShare answer 404 for a family member's case), so their links use this.
 */
export const mainApprovedCaseId = (cases: { id: string; status: string; parentCaseId?: string | null }[]): string | null =>
  cases.find((c) => c.status === 'APPROVED' && !c.parentCaseId)?.id ?? null;
