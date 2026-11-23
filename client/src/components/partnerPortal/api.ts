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
  partner: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    active: boolean;
    commissionCents: number | null;
    currency: string;
    /** Personal sign-up code and links (clients who use them belong to the partner). */
    code?: string | null;
    shareLink?: string | null;
    shortLink?: string | null;
    commissionTrigger?: 'ASSIGNED' | 'CONTRACT_SIGNED' | 'VISA_APPROVED';
    visibility?: 'MINIMAL' | 'EXTENDED';
    /** Schools get the Students view (/partner/students); language schools also record attendance / exams. */
    category?: 'AGENCY' | 'SCHOOL' | 'LANGUAGE_SCHOOL';
  };
  user: { firstName: string; lastName: string; email: string; phone: string | null; locale: string };
  alsoAgent: boolean;
  /** What this login may do (server: lib/partnerAccess; every request is checked there). Missing on old servers = everything. */
  access?: PartnerAccess;
}

export type ClientListLevel = 'none' | 'masked' | 'full';
export type DocumentLevel = 'none' | 'status' | 'list' | 'upload' | 'download';
export type DriveLevel = 'none' | 'view' | 'upload';
export interface PartnerPerms {
  clientList: ClientListLevel;
  caseStage: boolean;
  documents: DocumentLevel;
  payments: boolean;
  addClients: boolean;
  messaging: boolean;
  vacancies: boolean;
  drive: DriveLevel;
}
export type PartnerTemplate = 'LEGACY' | 'DEFAULT' | 'REFERRER' | 'DOCUMENTS' | 'FULL' | 'CUSTOM';
export interface PartnerAccess {
  role: 'OWNER' | 'MEMBER';
  template: PartnerTemplate;
  permissions: PartnerPerms;
  areas: { clients: boolean; cases: boolean; commissions: boolean; addClients: boolean; messages: boolean; vacancies: boolean; drive: boolean; team: boolean; profile: boolean };
}

/** Today's portal (a server without per-partner permissions). */
export const LEGACY_ACCESS: PartnerAccess = {
  role: 'OWNER',
  template: 'LEGACY',
  permissions: { clientList: 'masked', caseStage: true, documents: 'upload', payments: true, addClients: true, messaging: false, vacancies: false, drive: 'none' },
  areas: { clients: true, cases: true, commissions: true, addClients: true, messages: false, vacancies: false, drive: false, team: true, profile: true },
};
export const accessOf = (me: PartnerMe | undefined | null): PartnerAccess => me?.access ?? LEGACY_ACCESS;

const DOC_ORDER: DocumentLevel[] = ['none', 'status', 'list', 'upload', 'download'];
export const docsAtLeast = (have: DocumentLevel, want: DocumentLevel) => DOC_ORDER.indexOf(have) >= DOC_ORDER.indexOf(want);

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
  /** Stage figures are null without the case-stage permission. */
  counts: { clients: number; cases: number; activeCases: number | null; approvedVisas: number | null; rejected?: number | null };
  /** null without the payments permission. */
  commissions: (Totals & { thisMonthCents: number }) | null;
  /** Counts per visa kind (category, else type). */
  byVisa?: VisaFacet[];
  /** Last 12 months (oldest first); `approved` is null without the case-stage permission. */
  trend?: { months: string[]; clients: number[]; cases: number[]; approved: number[] | null };
  recent: { id: string; type: string; toStatus: CaseStatus | null; createdAt: string; caseId: string; caseNumber: string; client: string }[];
}

/** One visa kind of the partner's cases: `cat:<visaCategoryId>` or `type:<VisaType>` with counts. */
export interface VisaFacet {
  key: string;
  visaType: string;
  visaCategory: { title: L10n; visaLabel: string } | null;
  count: number;
  /** Missing without the case-stage permission. */
  active?: number;
  approved?: number;
  refused?: number;
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

export type PaymentState = 'NONE' | 'OPEN' | 'PARTIAL' | 'PAID' | 'OVERDUE';

/** One client of GET /partner/clients (owned clients + clients of cases linked by the team). */
export interface PartnerClientRow {
  id: string;
  firstName: string;
  lastName: string;
  passport: string | null;
  registeredAt: string;
  owned: boolean;
  activated: boolean;
  consent: boolean | null;
  extended: boolean;
  contact: { email: string; phone: string | null } | null;
  /** null without the payments permission. */
  payment: { state: PaymentState; totalCents?: number; paidCents?: number; currency?: string } | null;
  cases: number;
  latestCase: { id: string; number: string; status: CaseStatus; step: PortalStep; nextAction: NextAction; missingDocuments: number; refused: boolean; updatedAt: string } | null;
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
  /** null at the "status only" document level. */
  documentCount: number | null;
  /** Download level only: every file of the requirement (GET /partner/cases/:id/documents/:docId/file). */
  files?: { id: string; name: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; createdAt: string }[];
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

/** Error-key namespaces of the partner portal, in lookup order (permission-matrix codes live in partnerAccess.errors). */
export const PORTAL_ERROR_NAMESPACES = ['partnerPortal.errors', 'partnerAccess.errors'] as const;

/** Translated portal error message (falls back to the generic error). */
export const portalError = (err: unknown) => {
  const code = errorCode(err);
  if (code) for (const ns of PORTAL_ERROR_NAMESPACES) if (i18n.exists(`${ns}.${code}`)) return i18n.t(`${ns}.${code}`);
  return i18n.t('partnerPortal.common.error');
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
