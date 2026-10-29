import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';

/** Types and hooks of housing search + Anmeldung (server: routes/housing.ts, routes/admin/housing.ts). */

export const HOUSING_STEPS = ['budget', 'documents', 'search', 'viewings', 'scams', 'contract', 'deposit', 'handover'] as const;
export type HousingStepKey = (typeof HOUSING_STEPS)[number];
export const BRING_ITEMS = ['passport', 'wohnungsgeber', 'form', 'contract', 'family'] as const;
export type BringKey = (typeof BRING_ITEMS)[number];
export const OPTIONAL_BRING: BringKey[] = ['contract', 'family'];
export const LISTING_TYPES = ['ROOM', 'SHARED_FLAT', 'APARTMENT', 'WORKER_HOUSING', 'BOARDING_HOUSE'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export type DeadlineState = 'none' | 'done' | 'ok' | 'soon' | 'overdue';
export type AnmeldungStatus = 'NOT_STARTED' | 'APPOINTMENT_SET' | 'DONE';
export type ReviewStatus = 'NONE' | 'REQUESTED' | 'REVIEWED';
export type ProposalResponse = 'PENDING' | 'INTERESTED' | 'NOT_INTERESTED';

export interface FileRef {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface HousingView {
  caseId: string;
  city: string | null;
  effectiveCity: string | null;
  budgetMax: number | null;
  steps: { key: HousingStepKey; doneAt: string | null }[];
  progress: { done: number; total: number };
  contract: { file: FileRef | null; uploadedAt: string | null; review: ReviewStatus; question: string | null; reply: string | null; requestedAt: string | null; reviewedAt: string | null };
  anmeldung: {
    status: AnmeldungStatus;
    moveInDate: string | null;
    deadline: string | null;
    daysLeft: number | null;
    state: DeadlineState;
    appointment: {
      at: string;
      day: string;
      time: string;
      address: string | null;
      note: string | null;
      past: boolean;
      reminders: { kind: '3d' | '1d' | 'morning'; at: string; skipped: boolean; sent: boolean }[];
    } | null;
    bring: { key: BringKey; doneAt: string | null }[];
    certificate: FileRef | null;
    doneAt: string | null;
    doneVia: string | null;
  };
  updatedAt: string;
}

export interface ClientListing {
  id: string;
  name: string;
  city: string;
  type: ListingType;
  priceMin: number | null;
  priceMax: number | null;
  description: string | null;
  photos: string[];
  employer: string | null;
  contact: { name: string | null; phone: string | null; email: string | null; address: string | null } | null;
  proposal: { id: string; source: string; staffNote: string | null; response: ProposalResponse; clientNote: string | null; respondedAt: string | null; introducedAt: string | null; createdAt: string } | null;
}

export interface FollowUp {
  id: string;
  template: 'STEUER_ID' | 'BANK_ACCOUNT' | 'HEALTH_CARD';
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  dueAt: string | null;
  completedAt: string | null;
}

export interface HousingResponse {
  case: { id: string; number: string; employer: string | null; arrivalStatus: string | null } | null;
  housing: HousingView | null;
  listings: { proposed: ClientListing[]; matching: ClientListing[] };
  followUps: FollowUp[];
}

export interface StaffListing {
  id: string;
  name: string;
  city: string;
  type: ListingType;
  priceMin: number | null;
  priceMax: number | null;
  description: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  notes: string | null;
  photos: string[];
  active: boolean;
  companyId: string | null;
  company: { id: string; name: string } | null;
  proposals?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffProposal {
  id: string;
  listingId: string;
  caseId: string;
  source: 'STAFF' | 'CLIENT';
  staffNote: string | null;
  response: ProposalResponse;
  clientNote: string | null;
  respondedAt: string | null;
  introducedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  listing: StaffListing;
}

export interface StaffCaseHousing {
  case: { id: string; number: string; status: string; companyId?: string | null; employer?: string | null; client?: { id: string; firstName: string; lastName: string } };
  housing: HousingView | null;
  proposals: StaffProposal[];
  suggestions: StaffListing[];
}

export const HOUSING_KEY = ['housing'] as const;
export const staffHousingKey = (caseId: string) => ['admin-housing', 'case', caseId] as const;

export const useHousing = (enabled = true) =>
  useQuery({ queryKey: HOUSING_KEY, queryFn: async () => (await api.get<HousingResponse>('/housing')).data, enabled, staleTime: 30_000 });

export const useStaffHousing = (caseId: string, enabled = true) =>
  useQuery({ queryKey: staffHousingKey(caseId), queryFn: async () => (await api.get<StaffCaseHousing>(`/admin/housing/cases/${caseId}`)).data, enabled: !!caseId && enabled, staleTime: 30_000 });

/** Toast for a server error: housing.errors.CODE, then portal.errors.CODE, then the generic error. */
export const useHousingError = () => {
  const { t, i18n } = useTranslation();
  return useCallback(
    (err: unknown) => {
      const code = errorCode(err);
      const key = i18n.exists(`housing.errors.${code}`) ? `housing.errors.${code}` : i18n.exists(`portal.errors.${code}`) ? `portal.errors.${code}` : 'common.error';
      toast.error(t(key));
    },
    [t, i18n],
  );
};

/** "2026-11-12" → a date in the UI language (calendar day, no time-zone shift). */
export const fmtDay = (day: string, locale: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

/** An instant in German local time. */
export const fmtBerlin = (iso: string, locale: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(iso));

export const priceLabel = (t: (k: string, o?: Record<string, unknown>) => string, min: number | null, max: number | null) =>
  min != null && max != null ? t('housing.offers.price', { min, max }) : min != null ? t('housing.offers.priceFrom', { min }) : max != null ? t('housing.offers.priceTo', { max }) : null;

/** Badge tone for the deadline state (status vocabulary of components/ui/status.ts). */
export const deadlineTone = (s: DeadlineState) => (s === 'done' ? 'success' : s === 'overdue' ? 'danger' : s === 'soon' ? 'warning' : s === 'ok' ? 'info' : 'neutral') as 'success' | 'danger' | 'warning' | 'info' | 'neutral';
