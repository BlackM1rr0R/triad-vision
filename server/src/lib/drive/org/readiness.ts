import type { DocStage } from '@prisma/client';
import { prisma } from '../../../db.js';

/**
 * Readiness of a case's documents for the client folder header ("12/15 sənəd hazır"): the required
 * requirements of every stage, each ready (an accepted document), pending (waiting for review), rejected
 * (only rejected uploads) or missing (nothing uploaded).
 */
export type ReqState = 'ready' | 'pending' | 'rejected' | 'missing';

export interface ReadinessItem {
  id: string;
  title: unknown;
  stage: DocStage;
  status: ReqState;
}

export const caseReadiness = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, driveFolderId: true } });
  if (!c) return null;
  const reqs = await prisma.documentRequirement.findMany({
    where: { caseId, required: true },
    select: { id: true, title: true, stage: true, sortOrder: true, documents: { select: { status: true } } },
    orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const items: ReadinessItem[] = reqs.map((r) => {
    const s = r.documents.map((d) => d.status);
    const status: ReqState = s.includes('ACCEPTED') ? 'ready' : s.includes('PENDING') ? 'pending' : s.includes('REJECTED') ? 'rejected' : 'missing';
    return { id: r.id, title: r.title, stage: r.stage, status };
  });
  const count = (k: ReqState) => items.filter((i) => i.status === k).length;
  return {
    caseId: c.id,
    caseNumber: c.number,
    folderId: c.driveFolderId,
    total: items.length,
    ready: count('ready'),
    pending: count('pending'),
    rejected: count('rejected'),
    missing: count('missing'),
    link: `/admin/cases/${c.id}`,
    items,
  };
};
