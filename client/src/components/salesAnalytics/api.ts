import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { L10n } from '@/lib/types';

/** GET /api/admin/analytics/sales (ADMIN+) — server lib/salesAnalytics/service.ts. */

export type LeadSource = 'website' | 'partner' | 'referral' | 'campaign' | 'direct';
export type DueKind = 'client' | 'company' | 'installment';
export const SALES_SECTIONS = ['revenue', 'expected', 'services', 'leads', 'partners'] as const;
export type SalesSection = (typeof SALES_SECTIONS)[number];

export interface SalesResponse {
  range: { from: string; to: string; prevFrom: string; prevTo: string; months: string[]; prevMonths: string[] };
  summary: {
    revenueCents: number;
    revenuePrevCents: number;
    revenueDelta: number | null;
    invoicesCents: number;
    paymentsCents: number;
    upcomingCents: number;
    overdueCents: number;
    overdueCount: number;
    leads: number;
    leadsPrev: number;
    leadsDelta: number | null;
    conversion: number | null;
    conversionPrev: number | null;
    partnerShare: number | null;
  };
  revenue: { months: string[]; invoices: number[]; payments: number[]; total: number[]; prevTotal: number[] };
  expected: {
    months: ({ month: string; total: number } & Record<DueKind, number>)[];
    later: { total: number } & Record<DueKind, number>;
    overdue: {
      cents: number;
      count: number;
      byKind: Record<DueKind, number>;
      rows: { kind: DueKind; id: string; number: string; who: string; dueDate: string; cents: number; daysOverdue: number; link: string }[];
    };
  };
  services: { key: string; kind: 'package' | 'category' | 'employer' | 'other'; title: L10n | null; tier: string | null; cents: number; prevCents: number; share: number | null; delta: number | null }[];
  leads: {
    sourceKeys: LeadSource[];
    sources: { source: LeadSource; count: number; prev: number; share: number | null; clients: number; clientRate: number | null; approved: number; delta: number | null }[];
    monthly: Record<LeadSource, number[]>;
  };
  funnel: { key: 'leads' | 'clients' | 'cases' | 'approved'; count: number; rate: number | null; ofFirst: number | null; prev: number; prevOfFirst: number | null }[];
  partners: { id: string; name: string | null; revenueCents: number; prevRevenueCents: number; delta: number | null; share: number | null; clients: number; payments: number; commissionCents: number }[];
}

export const useSalesAnalytics = (range: { from: string; to: string }, enabled = true) =>
  useQuery({
    queryKey: ['admin-sales-analytics', range.from, range.to],
    queryFn: async () => (await api.get<SalesResponse>('/admin/analytics/sales', { params: range })).data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  });

export const salesCsvHref = (range: { from: string; to: string }, section: SalesSection) =>
  `/api/admin/analytics/sales.csv?${new URLSearchParams({ ...range, section }).toString()}`;
