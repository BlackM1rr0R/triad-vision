import type { ReferralPartner } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { isRefused } from '../caseProcessing/index.js';
import { dateToDay } from './profile.js';
import { todayOf } from '../partnerRecords/contracts.js';

/**
 * Overview numbers of referral partners for the admin list and the full profile page: contract status
 * (PartnerContract rows, else the legacy contractStart / contractEnd of the profile), last activity and
 * client totals. Read-only helpers; contracts themselves are managed in lib/partnerRecords.
 */

export const CONTRACT_STATUSES = ['active', 'expiring', 'expired', 'none'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Days before the end that count as "expiring". */
export const EXPIRING_DAYS = 30;

export interface ContractSummary {
  status: ContractStatus;
  /** "YYYY-MM-DD" of the running (or last) contract; null = open-ended or none. */
  endDate: string | null;
  /** Days until endDate (negative when expired); null without an end date. */
  daysLeft: number | null;
  /** PartnerContract rows (all statuses). */
  count: number;
  /** The status comes from the legacy profile dates (no PartnerContract yet). */
  legacy: boolean;
}

const DAY = 86_400_000;
/** Today in Baku (the shared contracts lib counts days the same way). */
const todayUtc = () => todayOf().getTime();
const daysUntil = (end: Date) => Math.round((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - todayUtc()) / DAY);

interface ContractLike {
  status: string;
  startDate: Date | null;
  endDate: Date | null;
}

/**
 * Contract status from the partner's contracts: a running one (ACTIVE / SENT, or signed, not past its end)
 * is "active" or "expiring" (≤ 30 days left; open-ended never expires); contracts that all ended are
 * "expired"; drafts alone count as "none". Without contracts the legacy profile dates decide.
 */
export const contractSummary = (contracts: ContractLike[], legacy: { contractStart: Date | null; contractEnd: Date | null }): ContractSummary => {
  const real = contracts.filter((c) => c.status !== 'DRAFT');
  const count = contracts.length;
  const pool: ContractLike[] = real.length ? real : legacy.contractStart || legacy.contractEnd ? [{ status: 'ACTIVE', startDate: legacy.contractStart, endDate: legacy.contractEnd }] : [];
  const fromLegacy = !real.length && pool.length > 0;
  if (!pool.length) return { status: 'none', endDate: null, daysLeft: null, count, legacy: false };
  const running = pool.filter((c) => (c.status === 'ACTIVE' || c.status === 'SENT') && (!c.endDate || daysUntil(c.endDate) >= 0));
  if (running.length) {
    if (running.some((c) => !c.endDate)) return { status: 'active', endDate: null, daysLeft: null, count, legacy: fromLegacy };
    const end = running.reduce((a, c) => (c.endDate! > a ? c.endDate! : a), running[0]!.endDate!);
    const left = daysUntil(end);
    return { status: left <= EXPIRING_DAYS ? 'expiring' : 'active', endDate: dateToDay(end), daysLeft: left, count, legacy: fromLegacy };
  }
  const ends = pool.map((c) => c.endDate).filter((d): d is Date => !!d);
  const last = ends.length ? ends.reduce((a, d) => (d > a ? d : a)) : null;
  return { status: 'expired', endDate: dateToDay(last), daysLeft: last ? daysUntil(last) : null, count, legacy: fromLegacy };
};

/** Contract summaries of many partners (one query). */
export const contractSummaries = async (partners: Pick<ReferralPartner, 'id' | 'contractStart' | 'contractEnd'>[]) => {
  const ids = partners.map((p) => p.id);
  const rows = ids.length
    ? await prisma.partnerContract.findMany({ where: { referralPartnerId: { in: ids } }, select: { referralPartnerId: true, status: true, startDate: true, endDate: true } })
    : [];
  const by = new Map<string, ContractLike[]>();
  for (const r of rows) {
    const list = by.get(r.referralPartnerId!) ?? [];
    list.push(r);
    by.set(r.referralPartnerId!, list);
  }
  return new Map(partners.map((p) => [p.id, contractSummary(by.get(p.id) ?? [], p)]));
};

const newer = (a: Date | null, b: Date | null | undefined) => (b && (!a || b > a) ? b : a);

/**
 * Last activity per partner: newest case, timeline entry (note / call / meeting), commission, contract
 * change or portal visit of the partner's login.
 */
export const lastActivities = async (partners: Pick<ReferralPartner, 'id' | 'userId'>[]) => {
  const ids = partners.map((p) => p.id);
  const out = new Map<string, Date | null>(ids.map((id) => [id, null]));
  if (!ids.length) return out;
  const userIds = partners.map((p) => p.userId).filter((x): x is string => !!x);
  const [cases, acts, coms, contracts, users] = await Promise.all([
    prisma.case.groupBy({ by: ['partnerId'], where: { partnerId: { in: ids } }, _max: { updatedAt: true } }),
    prisma.partnerActivity.groupBy({ by: ['referralPartnerId'], where: { referralPartnerId: { in: ids } }, _max: { at: true } }),
    prisma.partnerCommission.groupBy({ by: ['partnerId'], where: { partnerId: { in: ids } }, _max: { updatedAt: true } }),
    prisma.partnerContract.groupBy({ by: ['referralPartnerId'], where: { referralPartnerId: { in: ids } }, _max: { updatedAt: true } }),
    userIds.length ? prisma.session.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _max: { lastSeenAt: true } }) : Promise.resolve([]),
  ]);
  const bump = (id: string | null, d: Date | null | undefined) => id && out.has(id) && out.set(id, newer(out.get(id) ?? null, d));
  for (const r of cases) bump(r.partnerId, r._max.updatedAt);
  for (const r of acts) bump(r.referralPartnerId, r._max.at);
  for (const r of coms) bump(r.partnerId, r._max.updatedAt);
  for (const r of contracts) bump(r.referralPartnerId, r._max.updatedAt);
  const seen = new Map(users.map((u) => [u.userId, u._max.lastSeenAt]));
  for (const p of partners) if (p.userId) bump(p.id, seen.get(p.userId));
  return out;
};

/** Clients of one partner: everyone with a case of the partner or owned by the partner; active = with a running case. */
export const partnerClientTotals = async (partnerId: string) => {
  const [cases, owned] = await Promise.all([
    prisma.case.findMany({ where: { partnerId }, select: { clientId: true, status: true, processingStage: true } }),
    prisma.user.findMany({ where: { ownerPartnerId: partnerId }, select: { id: true } }),
  ]);
  const all = new Set<string>([...cases.map((c) => c.clientId), ...owned.map((u) => u.id)]);
  const active = new Set(cases.filter((c) => !FINAL_STATUSES.includes(c.status) && !isRefused(c)).map((c) => c.clientId));
  return { total: all.size, active: active.size, owned: owned.length, withoutCase: owned.filter((u) => !cases.some((c) => c.clientId === u.id)).length };
};
