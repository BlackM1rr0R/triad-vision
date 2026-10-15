import { prisma } from '../../db.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Post-arrival checklist for one case: every published item with the case's progress. Due dates
 * count from the visa's validity start (closest known date to the arrival), else the decision date.
 */
export const onboardingForCase = async (c: { id: string; decisionAt: Date | null; visaValidFrom: Date | null } | null, opts: { includeUnpublished?: boolean } = {}) => {
  const [items, progress] = await Promise.all([
    prisma.onboardingItem.findMany({ where: opts.includeUnpublished ? {} : { published: true }, orderBy: { sortOrder: 'asc' } }),
    c ? prisma.caseOnboarding.findMany({ where: { caseId: c.id } }) : Promise.resolve([]),
  ]);
  const byItem = new Map(progress.map((p) => [p.itemId, p]));
  const baseDate = c ? c.visaValidFrom ?? c.decisionAt : null;
  const rows = items.map((item) => {
    const p = byItem.get(item.id);
    const dueAt = baseDate && item.dueDays !== null ? new Date(baseDate.getTime() + item.dueDays * DAY) : null;
    return { ...item, done: !!p?.doneAt, doneAt: p?.doneAt ?? null, note: p?.note ?? null, dueAt };
  });
  const done = rows.filter((r) => r.done).length;
  return {
    baseDate,
    items: rows,
    progress: c ? { done, total: rows.length, percent: rows.length ? Math.round((done / rows.length) * 100) : 0 } : null,
  };
};

/** The client's approved case the checklist belongs to (the most recent approval, or a chosen one). */
export const approvedCaseFor = async (clientId: string, caseId?: string | null) =>
  prisma.case.findFirst({
    where: { clientId, status: 'APPROVED', ...(caseId ? { id: caseId } : {}) },
    orderBy: [{ decisionAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, number: true, status: true, decisionAt: true, visaValidFrom: true, visaValidTo: true },
  });
