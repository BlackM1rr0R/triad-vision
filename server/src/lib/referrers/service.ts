import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { isRefused } from '../caseProcessing/index.js';
import { clientPaymentTotals, paymentStateOf, type PaymentState } from '../partners/owned.js';
import { aggregateSubtree, childrenIndex, emptyStats, subtreeIds, type NodeStats } from './tree.js';

/**
 * Referrer tree from the database (pure tree logic: ./tree.ts). Used by the admin page /admin/referrers
 * (routes/admin/referrers.ts) and the referrer's "Komandam" area of the partner portal (./portalRoutes.ts).
 *
 * Privacy: the portal never gets more of a downline referrer's client than name, case number, stage and payment
 * state (`downlineClients`) — no contacts, passport, documents or amounts.
 */

/** Same as caseFlow's FINAL_STATUSES (not imported: caseFlow pulls in a lot). */
const FINAL: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];

export const REFERRER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  note: true,
  active: true,
  userId: true,
  parentPartnerId: true,
  approvalStatus: true,
  approvalNote: true,
  approvalDecidedAt: true,
  createdByPartnerId: true,
  createdAt: true,
} as const;

/** All referrers (the tree is small: a few hundred rows at most). */
export const loadReferrers = () => prisma.referralPartner.findMany({ where: { isReferrer: true }, select: REFERRER_SELECT, orderBy: { name: 'asc' } });
export type ReferrerRow = Awaited<ReturnType<typeof loadReferrers>>[number];

/** Clients per referrer: owned clients (User.ownerPartnerId) plus clients of cases linked to the referrer. */
const clientSets = async (ids: string[]) => {
  const [owned, cases] = await Promise.all([
    prisma.user.findMany({ where: { ownerPartnerId: { in: ids }, role: 'CLIENT' }, select: { id: true, ownerPartnerId: true } }),
    prisma.case.findMany({ where: { partnerId: { in: ids } }, select: { clientId: true, partnerId: true, status: true, processingStage: true } }),
  ]);
  const sets = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const u of owned) sets.get(u.ownerPartnerId!)?.add(u.id);
  for (const c of cases) sets.get(c.partnerId!)?.add(c.clientId);
  return { sets, cases };
};

/** Own figures of each referrer (clients, active cases, approved visas, paid / outstanding of its clients). */
export const ownStats = async (ids: string[]) => {
  const out = new Map<string, NodeStats>(ids.map((id) => [id, emptyStats()]));
  if (!ids.length) return out;
  const { sets, cases } = await clientSets(ids);
  const payments = await clientPaymentTotals([...new Set([...sets.values()].flatMap((s) => [...s]))]);
  for (const id of ids) {
    const s = out.get(id)!;
    const clients = sets.get(id)!;
    s.clients = clients.size;
    for (const cid of clients) {
      const p = payments.get(cid);
      if (!p) continue;
      s.paidCents += p.paidCents;
      s.outstandingCents += p.outstandingCents;
    }
  }
  for (const c of cases) {
    const s = out.get(c.partnerId!);
    if (!s) continue;
    if (c.status === 'APPROVED') s.approvedVisas++;
    else if (!FINAL.includes(c.status) && !isRefused(c)) s.activeCases++;
  }
  return out;
};

/** Latest session per login (last time the referrer used the portal). */
export const lastSeenOf = async (userIds: string[]) => {
  const out = new Map<string, Date>();
  if (!userIds.length) return out;
  const rows = await prisma.session.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _max: { lastSeenAt: true } });
  for (const r of rows) if (r._max.lastSeenAt) out.set(r.userId, r._max.lastSeenAt);
  return out;
};

/** Nodes with own + subtree figures (pending / rejected referrers are listed too; the UI marks them). */
export const treeWithStats = async (rows: ReferrerRow[]) => {
  const ids = rows.map((r) => r.id);
  const [own, seen] = await Promise.all([ownStats(ids), lastSeenOf(rows.map((r) => r.userId).filter((x): x is string => !!x))]);
  const total = aggregateSubtree(rows, own);
  const kids = childrenIndex(rows);
  return rows.map((r) => ({
    row: r,
    own: own.get(r.id) ?? emptyStats(),
    total: total.get(r.id) ?? emptyStats(),
    subReferrers: (kids.get(r.id) ?? []).length,
    descendants: subtreeIds(rows, r.id).length - 1,
    lastLoginAt: r.userId ? (seen.get(r.userId) ?? null) : null,
  }));
};

export interface DownlineClient {
  name: string;
  caseNumber: string | null;
  status: CaseStatus | null;
  refused: boolean;
  paymentState: PaymentState;
}

/**
 * The clients of one downline referrer as the upline may see them: name, case number, stage and payment state —
 * nothing else (no ids, contacts, passport, documents or amounts).
 */
export const downlineClients = async (partnerId: string): Promise<DownlineClient[]> => {
  const { sets } = await clientSets([partnerId]);
  const ids = [...(sets.get(partnerId) ?? [])];
  if (!ids.length) return [];
  const [users, cases, invoices] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.case.findMany({ where: { clientId: { in: ids }, partnerId }, orderBy: { createdAt: 'desc' }, select: { clientId: true, number: true, status: true, processingStage: true } }),
    prisma.clientInvoice.findMany({ where: { clientId: { in: ids } }, select: { clientId: true, status: true, grossCents: true, paidCents: true, dueDate: true } }),
  ]);
  return users.map((u) => {
    const latest = cases.find((c) => c.clientId === u.id) ?? null;
    return {
      name: `${u.firstName} ${u.lastName}`.trim(),
      caseNumber: latest?.number ?? null,
      status: latest?.status ?? null,
      refused: latest ? isRefused(latest) : false,
      paymentState: paymentStateOf(invoices.filter((i) => i.clientId === u.id)),
    };
  });
};
