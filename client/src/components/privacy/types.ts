import type { Role } from '@/lib/types';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';

export const CONSENT_TYPES = ['PRIVACY_POLICY', 'TERMS', 'MARKETING_EMAIL', 'WHATSAPP', 'SMS', 'EMPLOYER_SHARING', 'PASSPORT_OCR'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];
export const TOGGLE_TYPES = ['MARKETING_EMAIL', 'WHATSAPP', 'SMS', 'EMPLOYER_SHARING'] as const;
export type ToggleType = (typeof TOGGLE_TYPES)[number];

export const REQUEST_TYPES = ['EXPORT', 'DELETION', 'RECTIFICATION', 'RESTRICTION', 'OBJECTION'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
/** Types a signed-in user can file (EXPORT is the instant download). */
export const CLIENT_REQUEST_TYPES = ['RECTIFICATION', 'RESTRICTION', 'OBJECTION', 'DELETION'] as const;
export type ClientRequestType = (typeof CLIENT_REQUEST_TYPES)[number];

export const REQUEST_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const isOpenStatus = (s: RequestStatus) => s === 'OPEN' || s === 'IN_PROGRESS';

export const STATUS_TONE: Record<RequestStatus, string> = toneClasses(STATUS_TONES.privacy);

export interface EffectiveConsent {
  granted: boolean | null;
  at: string | null;
  version: string | null;
  source: string | null;
}

export interface ConsentHistoryRow {
  id: string;
  type: ConsentType;
  granted: boolean;
  version: string;
  source: string;
  createdAt: string;
}

export interface MyPrivacyRequest {
  id: string;
  type: RequestType;
  status: RequestStatus;
  message: string | null;
  decisionNote: string | null;
  dueAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface DataOverview {
  cases: number;
  documents: number;
  messages: number;
  translationOrders: number;
  sessions: number;
  devices: number;
  applications: number;
  interviews: number;
  notifications: number;
  consents: number;
}

export interface PrivacyState {
  policyVersion: string;
  /** Current AGB / privacy policy version and the version this user accepted (versioned legal texts). */
  legal?: import('@/components/legal/LegalVersions').LegalAcceptance[];
  retention: { months: number; includeMessages: boolean };
  consents: Record<ConsentType, EffectiveConsent>;
  history: ConsentHistoryRow[];
  requests: MyPrivacyRequest[];
  overview: DataOverview;
  emailNotifications: boolean;
  hasPhone: boolean;
}

// ─── Admin ─────────────────────────────────────────────────────────────

export interface AdminPrivacyRequest extends MyPrivacyRequest {
  userId: string | null;
  email: string;
  handledById: string | null;
  updatedAt: string;
  overdue: boolean;
  dueSoon: boolean;
  user: { id: string; firstName: string; lastName: string; email: string; role: Role; locale: string } | null;
  handledBy: { id: string; firstName: string; lastName: string } | null;
}

export interface AdminRequestsResponse {
  items: AdminPrivacyRequest[];
  counts: { byStatus: Record<RequestStatus, number>; overdue: number; dueSoon: number };
}

export interface DeletionPreviewCounts {
  cases: number;
  documents: number;
  caseMessages: number;
  applications: number;
  notifications: number;
  interviews: number;
  reviews: number;
  assignedCases: number;
  personalFiles: number;
  bookedSlots: number;
}

export interface ConsentLogRow {
  id: string;
  userId: string | null;
  email: string | null;
  type: ConsentType;
  granted: boolean;
  version: string;
  source: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: { id: string; email: string; firstName: string; lastName: string } | null;
}

export interface AdminRequestDetail {
  item: AdminPrivacyRequest;
  subject: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    phone: string | null;
    locale: string;
    isActive: boolean;
    createdAt: string;
    matchedByEmail: boolean;
  } | null;
  overview: DataOverview | null;
  deletionPreview: { counts: DeletionPreviewCounts } | null;
  deletionBlocked: string | null;
  consentLog: ConsentLogRow[];
  otherRequests: { id: string; type: RequestType; status: RequestStatus; createdAt: string; dueAt: string }[];
}

export interface ConsentLogResponse {
  items: ConsentLogRow[];
  total: number;
}
