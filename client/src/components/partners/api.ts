import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesPartners } from '@/i18n/pagesPartners';
import { pagesCaseProcessing } from '@/i18n/pagesCaseProcessing'; // visa kinds, "rədd", Ablehnung report, drive card count
import { toastError } from '@/components/admin/labels';
import type { CaseStatus, L10n } from '@/lib/types';

registerCopy(pagesPartners);
registerCopy(pagesCaseProcessing);

/** Referral partners (middlemen who bring clients) — shared client code. */
export interface PartnerRef {
  id: string;
  name: string;
}

export interface PartnerCounts {
  clients: number;
  activeCases: number;
  approved: number;
  closedNegative: number;
  /** Visa refused ("rədd"): REJECTED or marked "Ablehnung" by the team. */
  rejected?: number;
  cancelled?: number;
  /** Team document workflow: cases per stage. */
  stages?: import('@/components/caseProcessing/api').StageCounts;
  lastCaseAt: string | null;
}

export interface PartnerCommissionTotals {
  pendingCents: number;
  pendingCount: number;
  approvedCents: number;
  approvedCount: number;
  paidCents: number;
  paidCount: number;
  cancelledCents: number;
  cancelledCount: number;
  totalCents: number;
  thisMonthCents: number;
  paidThisMonthCents: number;
}

/** The partner's portal login (an AGENT user linked as ReferralPartner.userId). */
export interface PartnerLogin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  locale: string;
  isActive: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  agentCode: string | null;
}

export interface Partner extends PartnerRef {
  phone: string | null;
  email: string | null;
  note: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  counts: PartnerCounts;
  /** Default commission per client in cents (null = no automatic commission). */
  commissionCents?: number | null;
  currency?: string;
  userId?: string | null;
  commissionTotals?: PartnerCommissionTotals;
  /** Only on GET /admin/partners/:id. */
  login?: PartnerLogin | null;
  /** The partner's live folder in the drive ("Partner/<name>"); null when it was deleted there. */
  folderId?: string | null;
}

export interface PartnerCase {
  id: string;
  number: string;
  visaType: string;
  status: CaseStatus;
  createdAt: string;
  decisionAt: string | null;
  client: { id: string; firstName: string; lastName: string; phone: string | null; passportNumber: string | null };
  visaCategory: { title: L10n; visaLabel: string } | null;
  assignedStaff: { firstName: string; lastName: string } | null;
  /** `cat:<visaCategoryId>` or `type:<VisaType>` — the visa kind filter. */
  visaKey?: string;
  refused?: boolean;
  company?: { id: string; name: string } | null;
  processing?: import('@/components/caseProcessing/api').ProcessingSummary | null;
}

export const PARTNERS_KEY = ['referral-partners'] as const;

/** Every partner (for selects and filters). */
export const usePartnerOptions = () =>
  useQuery({
    queryKey: [...PARTNERS_KEY, 'list', { search: '', active: 'all' }],
    queryFn: async () => (await api.get<{ items: Partner[] }>('/admin/partners')).data.items,
    staleTime: 60_000,
  });

/** The partner a case-like object carries (the admin case list / detail return `partner`). */
export const casePartner = (c: object): PartnerRef | null => (c as { partner?: PartnerRef | null }).partner ?? null;

/** Translated message for a partner API error. */
export const partnerError = (err: unknown) => {
  const code = errorCode(err);
  if (code && i18n.exists(`refPartners.errors.${code}`)) toast.error(i18n.t(`refPartners.errors.${code}`));
  else if (code && i18n.exists(`refPartners.errors2.${code}`)) toast.error(i18n.t(`refPartners.errors2.${code}`));
  else toastError(err);
};

/** Bulk (or single) link of cases to a partner; null unlinks. */
export const useAssignPartner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { caseIds: string[]; partnerId: string | null }) =>
      (await api.patch<{ ok: true; updated: number }>('/admin/partners/assign', v)).data,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: PARTNERS_KEY }),
        qc.invalidateQueries({ queryKey: ['admin-cases'] }),
        qc.invalidateQueries({ queryKey: ['admin-case'] }),
      ]),
    onError: partnerError,
  });
};
