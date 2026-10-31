// Authorities catalogue — client types for /api/admin/authorities and /api/account/authorities
// (server lib/authorities/service.ts).

export const AUTHORITY_TYPES = ['EMBASSY', 'AUSLAENDERBEHOERDE', 'AGENTUR_FUER_ARBEIT', 'RECOGNITION', 'OTHER'] as const;
export type AuthorityType = (typeof AUTHORITY_TYPES)[number];

export interface WaitStat {
  days: number;
  samples: number;
}
export interface AuthorityWaiting {
  manualDays: number | null;
  computed: (WaitStat & { basis: 'EMBASSY_DECISION' | 'ABH_PRE_APPROVAL' | 'RECOGNITION_DECISION' }) | null;
  appointmentLead: WaitStat | null;
  effectiveDays: number | null;
}

export interface ChecklistItem {
  label: string;
  required: boolean;
}

export interface AuthorityContact {
  id?: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
}

export interface AuthorityListItem {
  id: string;
  type: AuthorityType;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  waitingDaysManual: number | null;
  active: boolean;
  updatedAt: string;
  linkedCases: number;
  contactCount: number;
  waiting: AuthorityWaiting;
}
export interface AuthorityList {
  items: AuthorityListItem[];
  cities: string[];
  counts: Partial<Record<AuthorityType, number>>;
}

export interface Authority {
  id: string;
  type: AuthorityType;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  openingHours: string | null;
  requirements: string | null;
  checklist: ChecklistItem[];
  notes: string | null;
  waitingDaysManual: number | null;
  aliases: string | null;
  active: boolean;
  contacts: AuthorityContact[];
  updatedAt: string;
}

export interface LinkedCase {
  id: string;
  number: string;
  status: string;
  appointmentAt: string | null;
  decisionAt: string | null;
  client: { firstName: string; lastName: string };
  role: 'EMBASSY' | 'ABH' | 'OTHER';
  note: string | null;
}
export interface AuthorityDetail {
  authority: Authority;
  waiting: AuthorityWaiting;
  cases: LinkedCase[];
  totalCases: number;
}

export interface MatchRow {
  caseId: string;
  number: string;
  status: string;
  clientName: string;
  text: string;
}

export interface AuthorityOption {
  id: string;
  type: AuthorityType;
  name: string;
  city: string | null;
  country: string | null;
}

/** Key info of an authority on a case (staff card). */
export interface CaseAuthorityInfo {
  id: string;
  type: AuthorityType;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  openingHours: string | null;
  requirements: string | null;
  checklist: ChecklistItem[];
  waitingDaysManual: number | null;
  active: boolean;
  waiting: AuthorityWaiting;
  note?: string | null;
}
export interface CaseAuthorities {
  embassy: CaseAuthorityInfo | null;
  abh: CaseAuthorityInfo | null;
  others: CaseAuthorityInfo[];
  appointmentPlace: string | null;
}

/** Public data for the client portal (no notes, aliases or contact persons). */
export interface ClientAuthority {
  id: string;
  type: AuthorityType;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  openingHours: string | null;
  requirements: string | null;
  checklist: ChecklistItem[];
  waitingDays: number | null;
}

export const authorityPlace = (a: { city: string | null; country: string | null }) => [a.city, a.country].filter(Boolean).join(', ');

/** Error code of a failed request (`{ error }` body), or 'generic'. */
export const authorityError = (err: unknown): string => (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'generic';

/** Only http(s) links are rendered as links (the server validates the same). */
export const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);
