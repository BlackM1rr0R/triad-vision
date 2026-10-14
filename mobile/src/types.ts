// Shapes returned by the API (server/src). Copied from client/src/lib/types.ts and trimmed for mobile.

export type L10n = { az: string; de: string; en: string; ru: string };
export type L10nList = { az: string[]; de: string[]; en: string[]; ru: string[] };
export type Locale = 'az' | 'de' | 'en' | 'ru';
export type Role = 'CLIENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';

/** Staff roles (STAFF < ADMIN < SUPER_ADMIN) — mirror of server ROLE_RANK. */
export const STAFF_ROLES: readonly Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
export const isStaffRole = (role?: Role | null) => !!role && STAFF_ROLES.includes(role);

/** Why the server rejected a token (401 body / GET /auth/me reason). */
export type AuthFailure = 'SESSION_EXPIRED' | 'SESSION_REVOKED' | 'INVALID_TOKEN' | 'UNAUTHENTICATED';

export interface SessionInfo {
  id: string;
  expiresAt: string;
}

/** GET /auth/sessions item. */
export interface SessionListItem extends SessionInfo {
  client: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone: string | null;
  locale: Locale;
}

export interface VisaCategory {
  id: string;
  slug: string;
  icon: string;
  image: string;
  visaLabel: string;
  title: L10n;
  summary: L10n;
  items: L10nList;
  body: L10n;
  sortOrder: number;
}

export interface Service {
  id: string;
  slug: string;
  icon: string;
  image: string;
  audience: 'all' | 'company' | 'candidate';
  title: L10n;
  summary: L10n;
  body: L10n;
  features: L10nList;
  sortOrder: number;
}

export interface Faq {
  id: string;
  question: L10n;
  answer: L10n;
  audience: 'all' | 'company' | 'candidate';
  sortOrder: number;
}

export interface Stat {
  id: string;
  icon: string;
  value: number;
  prefix: string;
  suffix: string;
  label: L10n;
}

export interface Office {
  city: L10n;
  address: string;
  lat: number;
  lng: number;
}

export interface SiteSettings {
  contact?: { phone: string; whatsapp: string; email: string; hours: L10n; offices: Office[] };
  social?: Record<string, string>;
}

export interface SiteContent {
  stats: Stat[];
  visaCategories: VisaCategory[];
  services: Service[];
  faqs: Faq[];
  settings: SiteSettings;
}

// ─── Visa case workflow ────────────────────────────────────────────────

export type CaseStatus =
  | 'DOCUMENTS_PENDING'
  | 'DOCUMENTS_REVIEW'
  | 'CONTRACT_SENT'
  | 'CONTRACT_SIGNED'
  | 'EMBASSY_DOCUMENTS'
  | 'EMBASSY_REVIEW'
  | 'APPOINTMENT_SCHEDULED'
  | 'DECISION_PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type DocStage = 'INITIAL' | 'EMBASSY' | 'CONTRACT' | 'CONTRACT_SIGNED' | 'VISA' | 'OTHER';
export type DocStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface CaseDocument {
  id: string;
  caseId: string;
  requirementId: string | null;
  stage: DocStage;
  originalName: string;
  mimeType: string;
  size: number;
  status: DocStatus;
  reviewNote: string | null;
  uploadedById: string;
  createdAt: string;
}

export interface Requirement {
  id: string;
  stage: DocStage;
  title: L10n;
  description: L10n | null;
  required: boolean;
  sortOrder: number;
  documents: CaseDocument[];
}

export interface CaseEvent {
  id: string;
  type: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus | null;
  note: string | null;
  visibleToClient: boolean;
  createdAt: string;
  actor: { firstName: string; lastName: string; role: Role } | null;
}

export interface CaseMessage {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string; role: Role };
}

export interface Contract {
  id: string;
  version: number;
  sentAt: string;
  signedAt: string | null;
  signerName: string | null;
  signerIp?: string | null;
  signerUserAgent?: string | null;
  file: CaseDocument | null;
  signedFile: CaseDocument | null;
}

export interface CaseSummary {
  id: string;
  number: string;
  profession: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  visaCategory: { title: L10n; visaLabel: string } | null;
}

export interface CaseDetail extends CaseSummary {
  staffNote: string | null;
  appointmentAt: string | null;
  appointmentPlace: string | null;
  decisionAt: string | null;
  decisionReason: string | null;
  visaValidFrom: string | null;
  visaValidTo: string | null;
  cancelReason: string | null;
  client: { id: string; firstName: string; lastName: string; email: string; phone: string | null; locale: string };
  assignedStaff: { id: string; firstName: string; lastName: string } | null;
  visaCategory: { id: string; slug: string; title: L10n; visaLabel: string } | null;
  requirements: Requirement[];
  otherDocuments: CaseDocument[];
  contract: Contract | null;
  events: CaseEvent[];
  messages: CaseMessage[];
}

export interface AdminCaseListItem extends CaseSummary {
  client: { firstName: string; lastName: string; email: string; phone: string | null };
  assignedStaff: { firstName: string; lastName: string } | null;
}

export interface AdminCaseList {
  items: AdminCaseListItem[];
  total: number;
  pageSize: number;
  counts: Partial<Record<CaseStatus, number>>;
}

export interface DashboardData {
  counts: Partial<Record<CaseStatus, number>>;
  newInquiries: number;
  newClients30d: number;
  recentEvents: (CaseEvent & { case: { id: string; number: string } })[];
  waiting: (CaseSummary & { client: { firstName: string; lastName: string } })[];
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  caseId?: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Workflow action bodies accepted by POST /api/admin/cases/:id/actions. */
export type StaffAction =
  | { action: 'REQUEST_CHANGES'; note: string }
  | { action: 'REJECT_SIGNATURE'; note: string }
  | { action: 'CONFIRM_CONTRACT' }
  | { action: 'SCHEDULE_APPOINTMENT'; at: string; place: string; note?: string }
  | { action: 'MARK_LODGED' }
  | { action: 'DECIDE'; decision: 'APPROVED' | 'REJECTED'; reason?: string; validFrom?: string; validTo?: string }
  | { action: 'CANCEL'; reason: string }
  | { action: 'REOPEN'; to: 'DOCUMENTS_PENDING' | 'EMBASSY_DOCUMENTS'; note?: string };
