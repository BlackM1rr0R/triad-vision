/** Approvals older than this do not get the celebration screen any more (a new device months later should not celebrate again). */
export const CELEBRATE_WITHIN_DAYS = 45;

/** Pure: the approved case to celebrate (main application first), or null. */
export const caseToCelebrate = <C extends { id: string; status: string; decisionAt: string | null; parentCaseId?: string | null }>(cases: C[], now = Date.now()): C | null => {
  const recent = cases.filter((c) => c.status === 'APPROVED' && (!c.decisionAt || now - new Date(c.decisionAt).getTime() <= CELEBRATE_WITHIN_DAYS * 86_400_000));
  return recent.find((c) => !c.parentCaseId) ?? recent[0] ?? null;
};
