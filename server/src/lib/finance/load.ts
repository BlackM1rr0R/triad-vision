import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import type { AgentInfo, CaseRow, CommissionRow, FinanceData, InvoiceRow, PartnerCommissionRow, PartnerInfo, StaffInfo, TranslationRow } from './aggregate.js';
import type { Period } from './period.js';

const FINAL = ['APPROVED', 'REJECTED', 'CANCELLED'] as const;
const STAFF_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

/** Invoices that can matter for the period: everything issued before its end (receivables need history). */
export const loadInvoices = async (p: Period): Promise<InvoiceRow[]> => {
  const rows = await prisma.invoice.findMany({
    where: { issueDate: { lt: p.end }, status: { in: ['SENT', 'OVERDUE', 'PAID'] } },
    select: {
      id: true,
      number: true,
      companyId: true,
      issueDate: true,
      dueDate: true,
      netCents: true,
      grossCents: true,
      status: true,
      paidAt: true,
      company: { select: { name: true } },
    },
  });
  return rows.map(({ company, ...r }) => ({ ...r, companyName: company.name }));
};

export const loadCommissions = (p: Period): Promise<CommissionRow[]> =>
  prisma.agentCommission.findMany({
    where: { OR: [{ createdAt: { gte: p.start, lt: p.end } }, { paidAt: { gte: p.start, lt: p.end } }] },
    select: { agentId: true, caseId: true, amountCents: true, status: true, createdAt: true, paidAt: true },
  });

export const loadPartnerCommissions = (p: Period): Promise<PartnerCommissionRow[]> =>
  prisma.partnerCommission.findMany({
    where: { OR: [{ createdAt: { gte: p.start, lt: p.end } }, { paidAt: { gte: p.start, lt: p.end } }] },
    select: { partnerId: true, caseId: true, amountCents: true, status: true, createdAt: true, paidAt: true },
  });

export const loadPartners = (): Promise<PartnerInfo[]> => prisma.referralPartner.findMany({ select: { id: true, name: true, active: true } });

export const loadTranslations = (p: Period): Promise<TranslationRow[]> =>
  prisma.translationOrder.findMany({
    where: {
      status: 'DELIVERED',
      OR: [{ completedAt: { gte: p.start, lt: p.end } }, { completedAt: null, updatedAt: { gte: p.start, lt: p.end } }],
    },
    select: { caseId: true, priceCents: true, status: true, completedAt: true, updatedAt: true },
  });

const CASE_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  decisionAt: true,
  closedAt: true,
  assignedStaffId: true,
  visaType: true,
  visaCategoryId: true,
  companyId: true,
} satisfies Prisma.CaseSelect;

/**
 * Cases created or decided in the period, all open cases (active workload), plus the cases needed to
 * attribute revenue: the cases of companies with paid invoices and cases linked to commissions / orders.
 */
export const loadCases = async (p: Period, extra: { companyIds: string[]; caseIds: string[] }): Promise<CaseRow[]> => {
  const or: Prisma.CaseWhereInput[] = [
    { createdAt: { gte: p.start, lt: p.end } },
    { decisionAt: { gte: p.start, lt: p.end } },
    { decisionAt: null, closedAt: { gte: p.start, lt: p.end } },
    { status: { notIn: [...FINAL] } },
  ];
  if (extra.companyIds.length) or.push({ companyId: { in: extra.companyIds } });
  if (extra.caseIds.length) or.push({ id: { in: extra.caseIds } });
  return prisma.case.findMany({ where: { OR: or }, select: CASE_SELECT });
};

export const loadFinanceData = async (p: Period): Promise<FinanceData> => {
  const [invoices, commissions, translations, partnerCommissions] = await Promise.all([loadInvoices(p), loadCommissions(p), loadTranslations(p), loadPartnerCommissions(p)]);
  const companyIds = [...new Set(invoices.filter((i) => i.status === 'PAID' && i.paidAt && i.paidAt >= p.start && i.paidAt < p.end).map((i) => i.companyId))];
  const caseIds = [...new Set([...commissions.map((c) => c.caseId), ...translations.map((t) => t.caseId)].filter((x): x is string => !!x))];
  const cases = await loadCases(p, { companyIds, caseIds });
  return { invoices, commissions, translations, cases, partnerCommissions };
};

export const loadAgents = async (p: Period): Promise<AgentInfo[]> => {
  const [agents, total, inRange] = await Promise.all([
    prisma.agent.findMany({ select: { id: true, code: true, region: true, status: true, user: { select: { firstName: true, lastName: true } } } }),
    prisma.user.groupBy({ by: ['referredByAgentId'], where: { referredByAgentId: { not: null } }, _count: { _all: true } }),
    prisma.user.groupBy({ by: ['referredByAgentId'], where: { referredByAgentId: { not: null }, createdAt: { gte: p.start, lt: p.end } }, _count: { _all: true } }),
  ]);
  const t = new Map(total.map((r) => [r.referredByAgentId, r._count._all]));
  const r = new Map(inRange.map((x) => [x.referredByAgentId, x._count._all]));
  return agents.map((a) => ({
    id: a.id,
    code: a.code,
    name: fullName(a.user) || a.code,
    region: a.region,
    status: a.status,
    referralsTotal: t.get(a.id) ?? 0,
    referralsInRange: r.get(a.id) ?? 0,
  }));
};

export const loadStaff = async (): Promise<StaffInfo[]> => {
  const users = await prisma.user.findMany({
    where: { role: { in: [...STAFF_ROLES] } },
    select: { id: true, firstName: true, lastName: true, role: true, isActive: true },
  });
  return users.map((u) => ({ id: u.id, name: fullName(u), role: u.role, isActive: u.isActive }));
};

/** Document reviews (accept / reject decisions recorded as case events) per staff member in the period. */
export const loadDocsReviewed = async (p: Period) => {
  const rows = await prisma.caseEvent.groupBy({
    by: ['actorId'],
    where: { type: { in: ['DOCUMENT_ACCEPTED', 'DOCUMENT_REJECTED'] }, actorId: { not: null }, createdAt: { gte: p.start, lt: p.end } },
    _count: { _all: true },
  });
  return new Map(rows.filter((r) => r.actorId).map((r) => [r.actorId!, r._count._all]));
};

/** Average recommendation score (0–10) of answered satisfaction surveys per staff member in the period. */
export const loadSatisfaction = async (p: Period) => {
  const rows = await prisma.satisfactionSurvey.groupBy({
    by: ['staffId'],
    where: { staffId: { not: null }, score: { not: null }, answeredAt: { gte: p.start, lt: p.end } },
    _avg: { score: true },
    _count: { _all: true },
  });
  return new Map(rows.filter((r) => r.staffId && r._avg.score !== null).map((r) => [r.staffId!, { avg: r._avg.score!, count: r._count._all }]));
};

export const loadCategories = () =>
  prisma.visaCategory.findMany({ select: { id: true, slug: true, visaLabel: true, title: true }, orderBy: { sortOrder: 'asc' } });
