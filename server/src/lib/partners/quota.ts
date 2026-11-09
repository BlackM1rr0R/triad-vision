import { prisma } from '../../db.js';

/**
 * Client quota of a referral partner ("how many clients this partner needs"): ReferralPartner.clientQuota
 * against the clients assigned to the partner. Assigned = distinct clients of the partner's cases plus the
 * clients who belong to the partner without a case (sign-up link, partner portal, admin) — the same
 * number as the profile header (partnerClientTotals.total).
 */

export interface PartnerQuota {
  /** null = no target set. */
  needed: number | null;
  assigned: number;
  /** Clients still missing (0 when filled or no target). */
  remaining: number;
  /** 0–100 (capped); null without a target. */
  percent: number | null;
  filled: boolean;
}

/** List filter: open = target set and not reached, filled = reached, none = no target. */
export const QUOTA_FILTERS = ['open', 'filled', 'none'] as const;
export type QuotaFilter = (typeof QUOTA_FILTERS)[number];

export const quotaOf = (needed: number | null | undefined, assigned: number): PartnerQuota => {
  const n = needed ?? null;
  if (n == null || n <= 0) return { needed: null, assigned, remaining: 0, percent: null, filled: false };
  return { needed: n, assigned, remaining: Math.max(0, n - assigned), percent: Math.min(100, Math.round((assigned / n) * 100)), filled: assigned >= n };
};

export const matchesQuotaFilter = (q: PartnerQuota, f: QuotaFilter) => (f === 'none' ? q.needed == null : f === 'filled' ? q.needed != null && q.filled : q.needed != null && !q.filled);

/** Distinct assigned clients per partner (cases + owned clients), in two queries for the whole list. */
export const assignedClientCounts = async (partnerIds: string[]) => {
  const sets = new Map<string, Set<string>>(partnerIds.map((id) => [id, new Set<string>()]));
  if (!partnerIds.length) return new Map<string, number>();
  const [cases, owned] = await Promise.all([
    prisma.case.findMany({ where: { partnerId: { in: partnerIds } }, select: { partnerId: true, clientId: true } }),
    prisma.user.findMany({ where: { ownerPartnerId: { in: partnerIds } }, select: { id: true, ownerPartnerId: true } }),
  ]);
  for (const c of cases) sets.get(c.partnerId!)?.add(c.clientId);
  for (const u of owned) sets.get(u.ownerPartnerId!)?.add(u.id);
  return new Map([...sets].map(([id, s]) => [id, s.size]));
};
