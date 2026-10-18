/** Responses of /api/admin/finance/* (amounts in euro cents). */
export interface FinanceRange {
  from: string;
  to: string;
}

export interface FinanceSummary {
  revenue: { grossCents: number; netCents: number; count: number };
  receivables: { grossCents: number; count: number; overdueGrossCents: number; overdueCount: number };
  translation: { cents: number; count: number };
  commissions: { pendingCents: number; pendingCount: number; approvedCents: number; approvedCount: number; paidCents: number; paidCount: number };
  /** Referral partners (middlemen) — separate from the agent programme. */
  partnerCommissions?: { pendingCents: number; pendingCount: number; approvedCents: number; approvedCount: number; paidCents: number; paidCount: number };
  netResultCents: number;
  cases: { new: number; approved: number; rejected: number; decided: number; conversionPct: number | null; avgDaysToDecision: number | null };
}

export interface FinanceMonth {
  month: string;
  invoicedCents: number;
  paidCents: number;
  outstandingCents: number | null;
  translationCents: number;
  commissionsPaidCents: number;
  partnerCommissionsPaidCents?: number;
  newCases: number;
  approved: number;
}

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

export interface ReceivablesResponse {
  range: FinanceRange;
  asOf: string;
  rows: {
    id: string;
    number: string;
    companyId: string;
    companyName: string;
    issueDate: string;
    dueDate: string;
    status: string;
    grossCents: number;
    daysOverdue: number;
    bucket: AgingBucket;
  }[];
  aging: { bucket: AgingBucket; count: number; grossCents: number }[];
  totalGrossCents: number;
  count: number;
}

export interface CommissionsResponse {
  range: FinanceRange;
  rows: {
    id: string;
    code: string;
    name: string;
    region: string | null;
    status: string;
    referralsTotal: number;
    referralsInRange: number;
    pendingCents: number;
    approvedCents: number;
    paidCents: number;
    cancelledCents: number;
    totalCents: number;
  }[];
  totals: { referralsInRange: number; pendingCents: number; approvedCents: number; paidCents: number; cancelledCents: number; totalCents: number };
  /** Referral partners (middlemen), separate section. */
  partners?: {
    rows: { id: string; name: string; active: boolean; pendingCents: number; approvedCents: number; paidCents: number; cancelledCents: number; totalCents: number }[];
    totals: { pendingCents: number; approvedCents: number; paidCents: number; cancelledCents: number; totalCents: number };
  };
}

export interface StaffRow {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
  activeCases: number;
  newCases: number;
  approved: number;
  rejected: number;
  approvalPct: number | null;
  avgDaysToDecision: number | null;
  documentsReviewed: number;
  satisfactionAvg: number | null;
  satisfactionCount: number;
}

export interface TypeRow {
  key: string | null;
  newCases: number;
  approved: number;
  rejected: number;
  active: number;
  invoiceRevenueCents: number;
  translationCents: number;
  commissionsPaidCents: number;
  approvalPct: number | null;
  revenueCents: number;
}

export interface ByTypeResponse {
  range: FinanceRange;
  byVisaType: TypeRow[];
  byCategory: (TypeRow & { slug: string | null; visaLabel: string | null; title: Record<string, string> | null })[];
}
