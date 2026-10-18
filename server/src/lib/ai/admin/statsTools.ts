import { z } from 'zod';
import { prisma } from '../../../db.js';
import { FINAL_STATUSES } from '../../caseFlow.js';
import { listExpiring } from '../../expiry/index.js';
import { buildSummary } from '../../settlement/summary.js';
import { monthRange } from '../../partners/commissions.js';
import type { AnyAiTool } from '../types.js';
import { bag, defineTool, localeOf, money } from './common.js';

/** Overview numbers for the super admin, built from the same helpers as the admin pages. */

const statsOverview = defineTool({
  name: 'stats_overview',
  description: 'Key numbers: cases by status (open / all) and new cases this month by visa type, documents waiting for review, documents expiring within N days (default 30), unpaid settlement shares per beneficiary, pending partner commissions, signature requests waiting.',
  schema: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('YYYY-MM (default: this month)'), expiringDays: z.number().int().min(1).max(365).default(30) }),
  run: async (a, ctx) => {
    const { start, end, key } = monthRange(a.month);
    const [byStatus, newByType, newCount, pendingDocs, reviewCases, expiring, summary, commissions, signatures, decided] = await Promise.all([
      prisma.case.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.case.groupBy({ by: ['visaType'], where: { createdAt: { gte: start, lt: end } }, _count: { _all: true } }),
      prisma.case.count({ where: { createdAt: { gte: start, lt: end } } }),
      prisma.document.count({ where: { status: 'PENDING', case: { status: { notIn: FINAL_STATUSES } } } }),
      prisma.case.count({ where: { status: { in: ['DOCUMENTS_REVIEW', 'EMBASSY_REVIEW'] } } }),
      listExpiring({ days: a.expiringDays, locale: localeOf(ctx) }),
      buildSummary(key),
      prisma.partnerCommission.groupBy({ by: ['status', 'currency'], where: { status: { in: ['PENDING', 'APPROVED'] } }, _sum: { amountCents: true }, _count: { _all: true } }),
      prisma.signatureRequest.count({ where: { status: 'SENT' } }),
      prisma.case.groupBy({ by: ['status'], where: { decisionAt: { gte: start, lt: end } }, _count: { _all: true } }),
    ]);
    const statuses = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
    const open = byStatus.filter((s) => !FINAL_STATUSES.includes(s.status)).reduce((n, s) => n + s._count._all, 0);
    return {
      month: key,
      cases: {
        open,
        total: byStatus.reduce((n, s) => n + s._count._all, 0),
        byStatus: statuses,
        newThisMonth: newCount,
        newByVisaType: Object.fromEntries(newByType.map((s) => [s.visaType, s._count._all])),
        decidedThisMonth: Object.fromEntries(decided.map((s) => [s.status, s._count._all])),
      },
      documents: {
        waitingForReview: pendingDocs,
        casesInReview: reviewCases,
        expiringWithinDays: a.expiringDays,
        expiring: expiring.length,
        expired: expiring.filter((e) => e.daysLeft < 0).length,
        nextExpiring: expiring.slice(0, 10).map((e) => ({ client: e.client.name, document: e.document, expires: e.expiresAt.slice(0, 10), daysLeft: e.daysLeft, case: e.case?.number ?? null })),
      },
      settlement: {
        owedPerBeneficiary: Object.fromEntries(summary.beneficiaries.map((b) => [b.name, bag(b.overall.pending)])),
        paidThisMonth: Object.fromEntries(summary.beneficiaries.map((b) => [b.name, bag(b.month.paid)])),
        revenueThisMonth: { agreed: bag(summary.revenue.monthAgreed), received: bag(summary.revenue.monthReceived) },
        rowsByStage: summary.stages,
      },
      partnerCommissionsOpen: commissions.map((c) => ({ status: c.status, count: c._count._all, amount: money(c._sum.amountCents ?? 0, c.currency) })),
      signaturesWaiting: signatures,
    };
  },
});

export const statsTools: AnyAiTool[] = [statsOverview];
