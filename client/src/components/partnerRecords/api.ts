import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import i18n from '@/i18n';
import { errorMessage } from '@/components/admin/labels';

/**
 * Client of /api/admin/partner-records (server routes/admin/partnerRecords.ts): contracts, timeline and contact
 * persons of an employer or a referral partner. Every component takes an `owner`:
 *   { companyId: string }         → employer (Company)
 *   { referralPartnerId: string } → referral partner (ReferralPartner)
 */
export type PartnerOwner = { companyId: string; referralPartnerId?: undefined } | { referralPartnerId: string; companyId?: undefined };

/** Query params / body fields of the owner. */
export const ownerParams = (o: PartnerOwner) => (o.companyId ? { companyId: o.companyId } : { referralPartnerId: o.referralPartnerId! });
export const ownerKey = (o: PartnerOwner) => (o.companyId ? `company:${o.companyId}` : `partner:${o.referralPartnerId}`);

export const CONTRACT_KINDS = ['COOPERATION', 'PERSONNEL', 'COMMISSION', 'FRAMEWORK', 'NDA', 'OTHER'] as const;
export type PartnerContractKind = (typeof CONTRACT_KINDS)[number];
export const CONTRACT_STATUSES = ['DRAFT', 'SENT', 'ACTIVE', 'EXPIRED', 'TERMINATED'] as const;
export type PartnerContractStatus = (typeof CONTRACT_STATUSES)[number];

export interface PartnerContract {
  id: string;
  companyId: string | null;
  referralPartnerId: string | null;
  title: string;
  kind: PartnerContractKind;
  status: PartnerContractStatus;
  /** "YYYY-MM-DD" */
  startDate: string | null;
  endDate: string | null;
  signedAt: string | null;
  autoRenew: boolean;
  noticePeriodDays: number | null;
  reminderDays: number;
  reminderSentAt: string | null;
  valueCents: number | null;
  currency: string;
  templateId: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  signedFileName: string | null;
  note: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  hasFile: boolean;
  hasSignedFile: boolean;
  /** days until endDate (negative = ended) */
  daysLeft: number | null;
  noticeDeadline: string | null;
  noticeDaysLeft: number | null;
}

export interface MissingField {
  key: string;
  group: string;
  field: string | null;
}

export interface PartnerTemplate {
  id: string;
  name: string;
  kind: 'EMPLOYER' | 'PARTNER';
  language: string;
  isDefault: boolean;
  missing: MissingField[];
}

export const ACTIVITY_KINDS = ['NOTE', 'CALL', 'MEETING', 'EMAIL', 'TASK'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface TimelineChange {
  field: string;
  from: unknown;
  to: unknown;
  hidden?: boolean;
}
export type TimelineItem =
  | { type: 'activity'; id: string; at: string; kind: ActivityKind; body: string; contact: { id: string; name: string } | null; actor: { id: string; name: string } | null; canEdit: boolean }
  | { type: 'audit'; id: string; at: string; action: string; actor: { id: string; name: string } | null; changes: TimelineChange[]; details: Record<string, unknown> };

export interface TimelinePage {
  items: TimelineItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PartnerContact {
  id: string;
  firstName: string;
  lastName: string | null;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isPrimary: boolean;
  companyId: string | null;
  referralPartnerId: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

const BASE = '/admin/partner-records';
const t = (key: string, opts?: Record<string, unknown>): string => String(i18n.t(key, opts));
const has = (key: string) => i18n.exists(key);

// ─── Errors ───────────────────────────────────────────────────────────

/** Validation issue messages (INVALID_BETRIEBSNUMMER …) first, then the usual admin error codes. */
export const recordsError = (err: unknown) => {
  const issues = err instanceof AxiosError ? (err.response?.data as { issues?: { message?: string }[] } | undefined)?.issues : undefined;
  const msg = issues?.find((i) => i.message && has(`partnerRecords.errors.${i.message}`))?.message;
  return msg ? t(`partnerRecords.errors.${msg}`) : errorMessage(err);
};
export const toastRecordsError = (err: unknown) => {
  toast.error(recordsError(err));
};

/** The 422 MISSING_FIELDS list of a generate call (null for any other error). */
export const missingOf = (err: unknown): MissingField[] | null => {
  if (!(err instanceof AxiosError) || err.response?.status !== 422) return null;
  const body = err.response.data as { error?: string; missing?: MissingField[] } | undefined;
  return body?.error === 'MISSING_FIELDS' ? (body.missing ?? []) : null;
};

/** Label of a missing placeholder: the form field it comes from (Betriebsnummer, Start …), else the key. */
export const missingLabel = (m: MissingField) => (m.field && has(`partnerRecords.fields.${m.field}`) ? t(`partnerRecords.fields.${m.field}`) : m.key);

// ─── Queries ──────────────────────────────────────────────────────────

export const recordsKeys = {
  contracts: (o: PartnerOwner) => ['partner-records', 'contracts', ownerKey(o)] as const,
  templates: (o: PartnerOwner) => ['partner-records', 'templates', ownerKey(o)] as const,
  timeline: (o: PartnerOwner) => ['partner-records', 'timeline', ownerKey(o)] as const,
  contacts: (o: PartnerOwner) => ['partner-records', 'contacts', ownerKey(o)] as const,
};

export const useContracts = (o: PartnerOwner) =>
  useQuery({ queryKey: recordsKeys.contracts(o), queryFn: async () => (await api.get<{ items: PartnerContract[] }>(`${BASE}/contracts`, { params: ownerParams(o) })).data.items });

export const useContractTemplates = (o: PartnerOwner, enabled = true) =>
  useQuery({ queryKey: recordsKeys.templates(o), enabled, queryFn: async () => (await api.get<{ items: PartnerTemplate[] }>(`${BASE}/contracts/templates`, { params: ownerParams(o) })).data.items });

export const useContacts = (o: PartnerOwner) =>
  useQuery({ queryKey: recordsKeys.contacts(o), queryFn: async () => (await api.get<{ items: PartnerContact[] }>(`${BASE}/contacts`, { params: ownerParams(o) })).data.items });

export const fetchTimeline = async (o: PartnerOwner, page: number, pageSize: number, kind?: string) =>
  (await api.get<TimelinePage>(`${BASE}/activities`, { params: { ...ownerParams(o), page, pageSize, ...(kind ? { kind } : {}) } })).data;

/** Invalidate everything of one owner (contracts change the timeline too). */
export const useRefreshRecords = (o: PartnerOwner) => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['partner-records'], predicate: (q) => q.queryKey[2] === ownerKey(o) });
    // company profile header / partner profile summaries
    void qc.invalidateQueries({ queryKey: ['admin-company-profile'] });
  };
};

// ─── Mutations ────────────────────────────────────────────────────────

export type ContractInput = Partial<Pick<PartnerContract, 'title' | 'kind' | 'status' | 'startDate' | 'endDate' | 'signedAt' | 'autoRenew' | 'noticePeriodDays' | 'reminderDays' | 'valueCents' | 'currency' | 'note'>>;

export const contractsApi = {
  create: (o: PartnerOwner, body: ContractInput) => api.post<{ contract: PartnerContract }>(`${BASE}/contracts`, { ...ownerParams(o), ...body }),
  update: (id: string, body: ContractInput) => api.patch<{ contract: PartnerContract }>(`${BASE}/contracts/${id}`, body),
  remove: (id: string) => api.delete(`${BASE}/contracts/${id}`),
  upload: (id: string, slot: 'file' | 'signed', file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ contract: PartnerContract }>(`${BASE}/contracts/${id}/${slot}`, fd);
  },
  removeFile: (id: string, slot: 'file' | 'signed') => api.delete<{ contract: PartnerContract }>(`${BASE}/contracts/${id}/${slot}`),
  fileUrl: (id: string, slot: 'file' | 'signed', download = false) => `/api${BASE}/contracts/${id}/${slot}${download ? '?download=1' : ''}`,
  generate: (o: PartnerOwner, body: ContractInput & { templateId: string; contractId?: string; allowMissing?: boolean }) =>
    api.post<{ contract: PartnerContract; missing: MissingField[]; unknown: string[] }>(`${BASE}/contracts/generate`, { ...ownerParams(o), ...body }),
  sendSignature: (id: string, body: { signer?: { name: string; email: string } | null; message?: string | null }) =>
    api.post<{ contract: PartnerContract; signatureRequestId: string }>(`${BASE}/contracts/${id}/signature`, body),
};

export const activitiesApi = {
  create: (o: PartnerOwner, body: { kind: ActivityKind; body: string; at?: string; contactId?: string | null }) => api.post(`${BASE}/activities`, { ...ownerParams(o), ...body }),
  update: (id: string, body: { kind?: ActivityKind; body?: string; at?: string; contactId?: string | null }) => api.patch(`${BASE}/activities/${id}`, body),
  remove: (id: string) => api.delete(`${BASE}/activities/${id}`),
};

export type ContactInput = Partial<Pick<PartnerContact, 'firstName' | 'lastName' | 'position' | 'email' | 'phone' | 'notes' | 'isPrimary'>>;

export const contactsApi = {
  create: (o: PartnerOwner, body: ContactInput) => api.post<{ contact: PartnerContact }>(`${BASE}/contacts`, { ...ownerParams(o), ...body }),
  update: (id: string, body: ContactInput) => api.patch<{ contact: PartnerContact }>(`${BASE}/contacts/${id}`, body),
  remove: (id: string) => api.delete(`${BASE}/contacts/${id}`),
};

/** Mutation that refreshes the owner's records and toasts errors. */
export const useRecordsMutation = <V, R = unknown>(o: PartnerOwner, fn: (v: V) => Promise<R>, opts: { success?: string; onSuccess?: (r: R, v: V) => void } = {}) => {
  const refresh = useRefreshRecords(o);
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (opts.success) toast.success(opts.success);
      refresh();
      opts.onSuccess?.(r, v);
    },
    onError: toastRecordsError,
  });
};

// ─── Formatting ───────────────────────────────────────────────────────

/** "2026-11-01" → localised day (shared admin formatter, noon UTC so the day never shifts). */
export const dayLabel = (d: string | null | undefined, fmt: (iso: string) => string) => (d ? fmt(`${d}T12:00:00Z`) : '—');

export const moneyLabel = (cents: number | null | undefined, currency: string, locale: string) =>
  typeof cents === 'number'
    ? new Intl.NumberFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale] ?? 'de-DE', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
    : '—';

/** Tone of the days-left label: red past / ≤ 14 days, amber ≤ 60 days, green otherwise. */
export const daysTone = (days: number | null) => (days === null ? 'text-muted' : days < 0 || days <= 14 ? 'text-danger-fg' : days <= 60 ? 'text-warning-fg' : 'text-success-fg');

export const STATUS_TONE: Record<PartnerContractStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACTIVE: 'success',
  EXPIRED: 'warning',
  TERMINATED: 'danger',
};
