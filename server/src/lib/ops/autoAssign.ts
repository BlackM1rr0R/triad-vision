import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';

/**
 * Automatic staff assignment for new cases. Configured by the super admin in Settings (key
 * `autoAssign`): { mode: 'off' | 'roundRobin' | 'leastLoaded', staffIds?: string[] }.
 * `staffIds` limits the pool; otherwise every active STAFF/ADMIN counts.
 */
export interface AutoAssignConfig {
  mode: 'off' | 'roundRobin' | 'leastLoaded';
  staffIds?: string[];
}

export const AUTO_ASSIGN_KEY = 'autoAssign';

export const readAutoAssign = async (): Promise<AutoAssignConfig> => {
  const row = await prisma.setting.findUnique({ where: { key: AUTO_ASSIGN_KEY } });
  const v = (row?.value ?? {}) as Partial<AutoAssignConfig>;
  return { mode: v.mode === 'roundRobin' || v.mode === 'leastLoaded' ? v.mode : 'off', staffIds: Array.isArray(v.staffIds) ? v.staffIds.filter((s): s is string => typeof s === 'string') : undefined };
};

/** Picks the staff member a new case should go to, or null when auto-assignment is off / nobody is eligible. */
export const pickAssignee = async (tx: Prisma.TransactionClient = prisma): Promise<string | null> => {
  const cfg = await readAutoAssign();
  if (cfg.mode === 'off') return null;
  const pool = await tx.user.findMany({
    where: { isActive: true, role: { in: ['STAFF', 'ADMIN'] }, ...(cfg.staffIds?.length ? { id: { in: cfg.staffIds } } : {}) },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!pool.length) return null;
  if (cfg.mode === 'leastLoaded') {
    const open = await tx.case.groupBy({ by: ['assignedStaffId'], where: { assignedStaffId: { in: pool.map((p) => p.id) }, status: { notIn: FINAL_STATUSES } }, _count: { _all: true } });
    const load = new Map(open.map((o) => [o.assignedStaffId as string, o._count._all]));
    return [...pool].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0].id;
  }
  // roundRobin: the staff member who received a case least recently.
  const last = await tx.case.findMany({
    where: { assignedStaffId: { in: pool.map((p) => p.id) } },
    distinct: ['assignedStaffId'],
    orderBy: { createdAt: 'desc' },
    select: { assignedStaffId: true, createdAt: true },
  });
  const lastAt = new Map(last.map((c) => [c.assignedStaffId as string, c.createdAt.getTime()]));
  return [...pool].sort((a, b) => (lastAt.get(a.id) ?? 0) - (lastAt.get(b.id) ?? 0))[0].id;
};
