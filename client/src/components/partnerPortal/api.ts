import { useQuery } from '@tanstack/react-query';
import i18n from '@/i18n';
import { api, errorCode } from '@/lib/api';
import type { CaseStatus, L10n } from '@/lib/types';

/** Responses of /api/partner/* (the referral-partner portal). Amounts in cents. */

export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
export type PortalStep = 'DOCUMENTS' | 'CONTRACT' | 'EMBASSY' | 'APPOINTMENT' | 'DECISION' | 'DONE';
export const STEPS: PortalStep[] = ['DOCUMENTS', 'CONTRACT', 'EMBASSY', 'APPOINTMENT', 'DECISION'];
export type NextAction =
  | 'UPLOAD_DOCUMENTS'
  | 'SUBMIT_DOCUMENTS'
  | 'WAIT_REVIEW'
  | 'SIGN_CONTRACT'
  | 'WAIT_CONTRACT_CHECK'
  | 'ATTEND_APPOINTMENT'
  | 'WAIT_DECISION'
  | 'NONE';
export type DocState = 'MISSING' | 'UPLOADED' | 'ACCEPTED' | 'REJECTED';

export interface PartnerMe {
  partner: { id: string; name: string; phone: string | null; email: string | null; active: boolean; commissionCents: number | null; currency: string };
  user: { firstName: string; lastName: string; email: string; phone: string | null; locale: string };
  alsoAgent: boolean;
}

export interface Totals {
  pendingCents: number;
  pendingCount: number;
  approvedCents: number;
  approvedCount: number;
  paidCents: number;
  paidCount: number;
  cancelledCents: number;
  cancelledCount: number;
  totalCents: number;
}

export interface PartnerDashboard {
  currency: string;
  counts: { clients: number; cases: number; activeCases: number; approvedVisas: number; rejected?: number };
  commissions: Totals & { thisMonthCents: number };
  /** Counts per visa kind (category, else type). */
  byVisa?: VisaFacet[];
  recent: { id: string; type: string; toStatus: CaseStatus | null; createdAt: string; caseId: string; caseNumber: string; client: string }[];
}

/** One visa kind of the partner's cases: `cat:<visaCategoryId>` or `type:<VisaType>` with counts. */
export interface VisaFacet {
  key: string;
  visaType: string;
  visaCategory: { title: L10n; visaLabel: string } | null;
  count: number;
  active: number;
  approved: number;
  refused: number;
}

export interface PartnerCaseRow {
  id: string;
  number: string;
  client: { firstName: string; lastName: string; passport: string | null };
  visaType: string;
  visaCategory: { title: L10n; visaLabel: string } | null;
  visaKey?: string;
  /** Visa refused (REJECTED or marked "Ablehnung" by the team). */
  refused?: boolean;
  status: CaseStatus;
  step: PortalStep;
  nextAction: NextAction;
  missingDocuments: number;
  appointmentAt: string | null;
  decisionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerRequirement {
  id: string;
  stage: 'INITIAL' | 'EMBASSY';
  title: L10n;
  description: L10n | null;
  required: boolean;
  state: DocState;
  rejectionReason: string | null;
  canUpload: boolean;
  documentCount: number;
  myUploads: { id: string; name: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; createdAt: string }[];
}

export interface PartnerCaseDetail extends PartnerCaseRow {
  appointmentPlace: string | null;
  visaValidFrom: string | null;
  visaValidTo: string | null;
  uploadStage: 'INITIAL' | 'EMBASSY' | null;
  timeline: { id: string; type: string; fromStatus: CaseStatus | null; toStatus: CaseStatus | null; createdAt: string }[];
  requirements: PartnerRequirement[];
}

export interface PartnerCommissionRow {
  id: string;
  amountCents: number;
  currency: string;
  status: CommissionStatus;
  createdAt: string;
  dueAt: string | null;
  paidAt: string | null;
  note: string | null;
  case: { id: string; number: string; client: string } | null;
  /** Client name (also for settlement-ledger rows without a case). */
  clientName: string | null;
}

export const PARTNER_ME_KEY = ['partner-portal', 'me'] as const;

export const usePartnerMe = (enabled = true) =>
  useQuery({
    queryKey: PARTNER_ME_KEY,
    queryFn: async () => (await api.get<PartnerMe>('/partner/me')).data,
    staleTime: 60_000,
    retry: false,
    enabled,
  });

/** Translated portal error message (falls back to the generic error). */
export const portalError = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`partnerPortal.errors.${code}`) ? i18n.t(`partnerPortal.errors.${code}`) : i18n.t('partnerPortal.common.error');
};

/** Downloads a file from the API (cookie session) and saves it under `name`. */
export const downloadFile = async (url: string, name: string, params?: Record<string, string | undefined>) => {
  const res = await api.get<Blob>(url, { params, responseType: 'blob' });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};
