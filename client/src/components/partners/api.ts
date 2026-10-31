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
  // Profile (server lib/partners/profile.ts); bank data arrives masked for staff (bankLocked).
  partnerType?: PartnerType;
  companyName?: string | null;
  contactPerson?: string | null;
  phone2?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  /** VÖEN; masked ("•••• 7890") per the masking settings. */
  taxId?: string | null;
  bankName?: string | null;
  bankAccountHolder?: string | null;
  iban?: string | null;
  bic?: string | null;
  /** True when the viewer is below ADMIN: bank data is masked and read-only. */
  bankLocked?: boolean;
  /** "YYYY-MM-DD" */
  contractStart?: string | null;
  contractEnd?: string | null;
  preferredLanguage?: PartnerLang | null;
  website?: string | null;
  tags?: string[];
  /** Values of the admin-defined fields: { [fieldId]: value }. */
  customData?: Record<string, string | number | boolean>;
  /** The partner's own extra fields ("+ add field"). */
  extraFields?: { label: string; value: string }[];
  // Legal data (contracts are generated from it; server lib/partners/profile.ts).
  legalForm?: string | null;
  registerNumber?: string | null;
  registerCourt?: string | null;
  /** USt-IdNr; masked for staff like the tax id (mask group TAX_ID). */
  vatId?: string | null;
  /** 8 digits, German partners only. */
  betriebsnummer?: string | null;
  street?: string | null;
  postalCode?: string | null;
  signatoryName?: string | null;
  signatoryRole?: string | null;
  /** List / detail: contract status from PartnerContract rows (else the legacy dates). */
  contract?: import('./hub/types').ContractSummary;
  /** List / detail: which contract fields are filled in. */
  readiness?: import('./hub/types').Readiness;
  /** List: newest case, timeline entry, commission, contract change or portal visit. */
  lastActivityAt?: string | null;
}

export type PartnerType = 'INDIVIDUAL' | 'COMPANY';
export const PARTNER_LANGS = ['az', 'de', 'en', 'ru', 'tr'] as const;
export type PartnerLang = (typeof PARTNER_LANGS)[number];
export const PARTNER_FIELD_TYPES = ['TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX'] as const;
export type PartnerFieldType = (typeof PARTNER_FIELD_TYPES)[number];

/** Admin-defined field shown on every partner form (GET /admin/partners/fields). */
export interface PartnerFieldDef {
  id: string;
  label: string;
  type: PartnerFieldType;
  options: string[];
  sortOrder: number;
}

/** Below PARTNERS_KEY, so invalidating the partners refreshes the definitions too. */
export const PARTNER_FIELDS_KEY = ['referral-partners', 'fields'] as const;

/** The admin-defined partner form fields. */
export const usePartnerFields = (enabled = true) =>
  useQuery({
    queryKey: PARTNER_FIELDS_KEY,
    queryFn: async () => (await api.get<{ fields: PartnerFieldDef[] }>('/admin/partners/fields')).data.fields,
    staleTime: 60_000,
    enabled,
  });

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
