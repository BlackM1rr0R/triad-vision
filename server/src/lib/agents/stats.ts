import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';

export interface AgentStats {
  referrals: number;
  activeCases: number;
  approvedVisas: number;
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
}

const empty = (): AgentStats => ({ referrals: 0, activeCases: 0, approvedVisas: 0, pendingCents: 0, approvedCents: 0, paidCents: 0 });

/** Per-agent counters for the admin list and the agent dashboard (main cases only, family cases excluded). */
export const agentStats = async (agentIds: string[]): Promise<Map<string, AgentStats>> => {
  const out = new Map(agentIds.map((id) => [id, empty()]));
  if (!agentIds.length) return out;
  const [refs, cases, sums] = await Promise.all([
    prisma.user.groupBy({ by: ['referredByAgentId'], where: { referredByAgentId: { in: agentIds } }, _count: { _all: true } }),
    prisma.case.findMany({
      where: { parentCaseId: null, client: { referredByAgentId: { in: agentIds } } },
      select: { status: true, client: { select: { referredByAgentId: true } } },
    }),
    prisma.agentCommission.groupBy({ by: ['agentId', 'status'], where: { agentId: { in: agentIds } }, _sum: { amountCents: true } }),
  ]);
  for (const r of refs) if (r.referredByAgentId) out.get(r.referredByAgentId)!.referrals = r._count._all;
  for (const c of cases) {
    const s = out.get(c.client.referredByAgentId ?? '');
    if (!s) continue;
    if (c.status === 'APPROVED') s.approvedVisas++;
    else if (!FINAL_STATUSES.includes(c.status as CaseStatus)) s.activeCases++;
  }
  for (const r of sums) {
    const s = out.get(r.agentId)!;
    const v = r._sum.amountCents ?? 0;
    if (r.status === 'PENDING') s.pendingCents = v;
    else if (r.status === 'APPROVED') s.approvedCents = v;
    else if (r.status === 'PAID') s.paidCents = v;
  }
  return out;
};

/** "YYYY-MM" keys of the last `n` months (oldest first), UTC. */
export const lastMonths = (n: number, now = new Date()) => {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
};

export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
