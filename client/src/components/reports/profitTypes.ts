import { registerCopy } from '@/i18n';
import { pagesTimeCare } from '@/i18n/pagesTimeCare';

registerCopy(pagesTimeCare); // profit.costCats.LABOUR

/** Shapes of /api/admin/profitability. Amounts are EUR cents. */

// LABOUR = staff time × hourly cost rate (time tracking; its label comes from pagesTimeCare).
export const COST_KEYS = ['TRANSLATION', 'COURIER', 'EMBASSY_FEE', 'VISA_FEE', 'AGENT_COMMISSION', 'PARTNER_COMMISSION', 'TRAVEL', 'OTHER', 'LEDGER_EXPENSES', 'LABOUR'] as const;
export type CostKey = (typeof COST_KEYS)[number];
export const MANUAL_CATEGORIES = ['TRANSLATION', 'COURIER', 'EMBASSY_FEE', 'VISA_FEE', 'AGENT_COMMISSION', 'PARTNER_COMMISSION', 'TRAVEL', 'OTHER'] as const;
export type ManualCategory = (typeof MANUAL_CATEGORIES)[number];

export interface ProfitSettings {
  eurAzn: number;
  translationAs: 'revenue' | 'cost';
  rateSource: 'profitability' | 'settlement';
}

export interface ProfitLine {
  kind: 'revenue' | 'cost';
  source: string;
  category: CostKey | null;
  ref: string;
  date: string | null;
  amountCents: number;
  currency: string;
  eurCents: number;
  allocation?: 'line' | 'split';
  splitOver?: number;
  costId?: string;
  note?: string | null;
}

export interface CaseProfitRow {
  caseId: string;
  number: string;
  status: string;
  visaType: string;
  visaCategoryId: string | null;
  categoryLabel: string | null;
  clientName: string;
  staffName: string | null;
  partnerName: string | null;
  agentName: string | null;
  companyName: string | null;
  createdAt: string;
  revenue: { INVOICE: number; SETTLEMENT: number; TRANSLATION: number; total: number };
  costs: Record<CostKey, number> & { total: number };
  marginCents: number;
  marginPct: number | null;
}

export interface Bucket {
  key: string | null;
  label: string | null;
  cases: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number | null;
}

export interface ProfitOverview {
  settings: ProfitSettings;
  totals: {
    cases: number;
    revenueCents: number;
    costCents: number;
    marginCents: number;
    marginPct: number | null;
    avgMarginCents: number | null;
    avgMarginPct: number | null;
    unprofitable: number;
  };
  costsByCategory: Record<CostKey, number>;
  revenueBySource: { INVOICE: number; SETTLEMENT: number; TRANSLATION: number };
  byVisaType: Bucket[];
  byCategory: Bucket[];
  byPartner: Bucket[];
  byAgent: Bucket[];
  byStaff: Bucket[];
  byEmployer: Bucket[];
  byMonth: Bucket[];
  top: CaseProfitRow[];
  bottom: CaseProfitRow[];
  rows: CaseProfitRow[];
  rowsTruncated: boolean;
}

export interface CaseCost {
  id: string;
  caseId: string;
  category: ManualCategory;
  amountCents: number;
  currency: 'EUR' | 'AZN';
  fxRate: number;
  incurredAt: string;
  note: string | null;
  documentId: string | null;
  documentName: string | null;
}

export interface CaseProfitResponse {
  settings: ProfitSettings;
  profit: (CaseProfitRow & { lines: ProfitLine[] }) | null;
  costs: CaseCost[];
  documents: { id: string; originalName: string; stage: string }[];
}
