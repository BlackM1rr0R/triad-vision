import type { StageCounts } from '@/components/caseProcessing/api';

/** Contract status of a partner (server lib/partners/overview.ts). */
export type ContractStatus = 'active' | 'expiring' | 'expired' | 'none';
export const CONTRACT_STATUSES: ContractStatus[] = ['active', 'expiring', 'expired', 'none'];

export interface ContractSummary {
  status: ContractStatus;
  /** "YYYY-MM-DD"; null = open-ended or none. */
  endDate: string | null;
  daysLeft: number | null;
  count: number;
  /** From the legacy profile dates (no PartnerContract yet). */
  legacy: boolean;
}

/** Which profile fields a partner contract needs and which are missing (server contractReadiness). */
export interface Readiness {
  required: string[];
  missing: string[];
  percent: number;
}

/** GET /admin/partners/:id/stats */
export interface PartnerStats {
  clients: { total: number; active: number; owned: number; withoutCase: number };
  cases: { total: number; active: number; approved: number; refused: number; cancelled: number; stages: StageCounts };
  commissions: { currency: string; earnedCents: number; pendingCents: number; paidCents: number; thisMonthCents: number; count: number };
  contract: ContractSummary;
  lastActivityAt: string | null;
  readiness: Readiness;
  legacyContract: { start: string | null; end: string | null } | null;
  counts: { settlements: number; contacts: number; activities: number };
  portal: { hasLogin: boolean; active: boolean; lastSeenAt: string | null; visibility: string };
}

/** "Germany" in the spellings the team uses (server isGermany). */
const GERMANY = new Set(['de', 'deu', 'germany', 'deutschland', 'almaniya', 'almanya', 'германия', 'allemagne']);
export const isGermany = (country: string | null | undefined) => !!country && GERMANY.has(country.trim().toLocaleLowerCase());

/** Profile fields a contract needs, by partner type — mirrors server contractFieldsFor (form hints only). */
export const contractFieldsFor = (p: { partnerType?: string | null; country?: string | null }): string[] =>
  p.partnerType === 'COMPANY'
    ? ['companyName', 'legalForm', ...(isGermany(p.country) ? ['registerNumber', 'registerCourt'] : []), 'street', 'postalCode', 'city', 'country', 'taxId', 'signatoryName', 'signatoryRole', 'email']
    : ['name', 'street', 'postalCode', 'city', 'country', 'taxId', 'phone'];

export const PARTNER_STATS_KEY = (id: string) => ['referral-partners', 'stats', id] as const;
