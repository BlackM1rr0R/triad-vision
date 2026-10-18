import type { CommissionStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * Commissions of referral partners (one row per client case, or manual rows without a case).
 *
 * - Assigning a case to a partner with a default amount (`ReferralPartner.commissionCents`) creates a
 *   PENDING commission for that case; the unique (partnerId, caseId) keeps it idempotent.
 * - Unassigning cancels the commission while it is still PENDING (approved / paid rows stay).
 * - Rows with `settlementEntryId` belong to the settlement ledger (lib/settlement) and are never
 *   touched by the automatic assign / unassign logic here.
 * - Period rule (same as the finance reports): PENDING / APPROVED / CANCELLED count by `createdAt`,
 *   PAID counts by `paidAt`.
 */

export const COMMISSION_STATUSES = ['PENDING', 'APPROVED', 'PAID', 'CANCELLED'] as const;

export interface CommissionLike {
  amountCents: number;
  status: CommissionStatus;
  createdAt: Date;
  paidAt: Date | null;
}

export interface CommissionTotals {
  pendingCents: number;
  pendingCount: number;
  approvedCents: number;
  approvedCount: number;
  paidCents: number;
  paidCount: number;
  cancelledCents: number;
  cancelledCount: number;
  /** Pending + approved + paid. */
  totalCents: number;
}

const inRange = (d: Date | null | undefined, start?: Date, end?: Date) =>
  !!d && (!start || d >= start) && (!end || d < end);

/** Sums by status; with a period, applies the period rule above (without one: all rows). */
export const commissionTotals = (rows: CommissionLike[], start?: Date, end?: Date): CommissionTotals => {
  const t: CommissionTotals = { pendingCents: 0, pendingCount: 0, approvedCents: 0, approvedCount: 0, paidCents: 0, paidCount: 0, cancelledCents: 0, cancelledCount: 0, totalCents: 0 };
  for (const r of rows) {
    if (r.status === 'PAID') {
      if (!inRange(r.paidAt ?? r.createdAt, start, end)) continue;
      t.paidCents += r.amountCents;
      t.paidCount++;
    } else {
      if (!inRange(r.createdAt, start, end)) continue;
      if (r.status === 'PENDING') {
        t.pendingCents += r.amountCents;
        t.pendingCount++;
      } else if (r.status === 'APPROVED') {
        t.approvedCents += r.amountCents;
        t.approvedCount++;
      } else {
        t.cancelledCents += r.amountCents;
        t.cancelledCount++;
      }
    }
  }
  t.totalCents = t.pendingCents + t.approvedCents + t.paidCents;
  return t;
};

/** UTC month boundaries of `YYYY-MM` (or the current month). */
export const monthRange = (month?: string, now = new Date()) => {
  const [y, m] = month ? month.split('-').map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = new Date(Date.UTC(y!, m! - 1, 1));
  const end = new Date(Date.UTC(y!, m!, 1));
  return { start, end, key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}` };
};

/** Rows that matter for a period: created in it, or paid in it. */
export const periodWhere = (start: Date, end: Date): Prisma.PartnerCommissionWhereInput => ({
  OR: [{ createdAt: { gte: start, lt: end } }, { paidAt: { gte: start, lt: end } }],
});

export interface PartnerTotals extends CommissionTotals {
  /** Non-cancelled commissions created this calendar month (UTC). */
  thisMonthCents: number;
  /** Commissions paid this calendar month (UTC). */
  paidThisMonthCents: number;
}

/** All-time totals per partner plus the current month. */
export const partnerCommissionTotals = async (partnerIds: string[], now = new Date()) => {
  const out = new Map<string, PartnerTotals>();
  if (!partnerIds.length) return out;
  const rows = await prisma.partnerCommission.findMany({
    where: { partnerId: { in: partnerIds } },
    select: { partnerId: true, amountCents: true, status: true, createdAt: true, paidAt: true },
  });
  const { start, end } = monthRange(undefined, now);
  for (const id of partnerIds) {
    const mine = rows.filter((r) => r.partnerId === id);
    const month = commissionTotals(mine, start, end);
    out.set(id, { ...commissionTotals(mine), thisMonthCents: month.totalCents, paidThisMonthCents: month.paidCents });
  }
  return out;
};

/**
 * Keeps the automatic commissions in line after cases changed partner: a PENDING commission of the
 * previous partner is cancelled; the new partner gets a PENDING row with their default amount
 * (a cancelled row of the same pair is revived). Returns the number of rows created or revived.
 */
export const syncCaseCommissions = async (
  changes: { caseId: string; from: string | null; to: string | null }[],
  actorId: string | null,
) => {
  let created = 0;
  for (const ch of changes) {
    if (ch.from === ch.to) continue;
    if (ch.from) {
      await prisma.partnerCommission.updateMany({
        where: { partnerId: ch.from, caseId: ch.caseId, status: 'PENDING', settlementEntryId: null },
        data: { status: 'CANCELLED', note: 'Partnyor müraciətdən ayrıldı' },
      });
    }
    if (!ch.to) continue;
    const partner = await prisma.referralPartner.findUnique({ where: { id: ch.to }, select: { commissionCents: true, currency: true } });
    if (!partner?.commissionCents || partner.commissionCents <= 0) continue;
    const existing = await prisma.partnerCommission.findUnique({ where: { partnerId_caseId: { partnerId: ch.to, caseId: ch.caseId } } });
    if (existing) {
      // Never a second row for the same partner + case; settlement-owned rows stay as they are.
      if (existing.status === 'CANCELLED' && !existing.settlementEntryId) {
        await prisma.partnerCommission.update({
          where: { id: existing.id },
          data: { status: 'PENDING', amountCents: partner.commissionCents, currency: partner.currency, note: null, paidAt: null },
        });
        created++;
      }
      continue;
    }
    try {
      await prisma.partnerCommission.create({
        data: { partnerId: ch.to, caseId: ch.caseId, amountCents: partner.commissionCents, currency: partner.currency, createdById: actorId },
      });
      created++;
    } catch (err) {
      // A concurrent assign created it first (unique partnerId + caseId): nothing to do.
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }
  return created;
};

export const commissionInclude = {
  partner: { select: { id: true, name: true } },
} satisfies Prisma.PartnerCommissionInclude;

/**
 * Client name of rows without a case: settlement-ledger rows carry it on their SettlementEntry
 * (clients who are not in the system yet). Map settlementEntryId → clientName.
 */
export const settlementClientNames = async (rows: { caseId: string | null; settlementEntryId?: string | null }[]) => {
  const ids = [...new Set(rows.filter((r) => !r.caseId && r.settlementEntryId).map((r) => r.settlementEntryId!))];
  if (!ids.length) return new Map<string, string>();
  const entries = await prisma.settlementEntry.findMany({ where: { id: { in: ids } }, select: { id: true, clientName: true } });
  return new Map(entries.map((e) => [e.id, e.clientName]));
};

/** Case number + client name of commission rows (PartnerCommission has no Case relation). */
export const caseLabels = async (caseIds: (string | null)[]) => {
  const ids = [...new Set(caseIds.filter((x): x is string => !!x))];
  if (!ids.length) return new Map<string, { id: string; number: string; status: string; client: { firstName: string; lastName: string } }>();
  const cases = await prisma.case.findMany({
    where: { id: { in: ids } },
    select: { id: true, number: true, status: true, client: { select: { firstName: true, lastName: true } } },
  });
  return new Map(cases.map((c) => [c.id, c]));
};
