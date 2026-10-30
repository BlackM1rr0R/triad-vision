import type { CaseStatus, DocAccess, DocStatus, L10n, Role } from '@/lib/types';
import type { InquiryStatus } from './labels';
import type { NextStepSummary } from '@/components/caseNext/api';

export interface AdminCaseListItem {
  id: string;
  number: string;
  profession: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  client: { firstName: string; lastName: string; email: string; phone: string | null };
  assignedStaff: { firstName: string; lastName: string } | null;
  visaCategory: { title: L10n; visaLabel: string } | null;
  lastEvent: { type: string; createdAt: string; actor: { role: Role } | null } | null;
  messagesCount: number;
  pendingDocs: number;
  statusSince: string;
  daysInStatus: number;
  ageDays: number;
  /** Top "next step" from the server rules (lib/caseNext), null for closed cases. */
  nextStep?: NextStepSummary | null;
  /** "Top kimdÉ™dir?" â€” who acts next (lib/clientProcess/ballInCourt). */
  ballInCourt?: import('@/components/clientProcess/api').BallInCourt | null;
  /** Team document workflow (Schon geschrieben → Fertig, lib/caseProcessing). */
  processing?: import('@/components/caseProcessing/api').ProcessingSummary | null;
}

export interface AdminCasesResponse {
  items: AdminCaseListItem[];
  total: number;
  pageSize: number;
  counts: Partial<Record<CaseStatus, number>>;
  processingCounts?: import('@/components/caseProcessing/api').StageCounts;
}

export interface DashboardEvent {
  id: string;
  type: string;
  note: string | null;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus | null;
  visibleToClient: boolean;
  createdAt: string;
  case: { id: string; number: string };
  actor: { firstName: string; lastName: string; role: Role } | null;
}

export interface DashboardWaiting {
  id: string;
  number: string;
  profession: string;
  status: CaseStatus;
  updatedAt: string;
  client: { firstName: string; lastName: string };
}

export interface DashboardAppointment {
  id: string;
  number: string;
  appointmentAt: string;
  appointmentPlace: string | null;
  client: { firstName: string; lastName: string };
}

export interface DashboardResponse {
  counts: Partial<Record<CaseStatus, number>>;
  newInquiries: number;
  newClients30d: number;
  recentEvents: DashboardEvent[];
  waiting: DashboardWaiting[];
  docsPending: number;
  casesNew7d: number;
  appointments: DashboardAppointment[];
  waitingOverdue3d: number;
  decided30d: Partial<Record<'APPROVED' | 'REJECTED', number>>;
  inquiriesByStatus: Partial<Record<InquiryStatus, number>>;
  myOpenCases: number;
  unansweredClientMessages: number;
  avgDaysToDecision: number | null;
}

/** `stats` half of GET /admin/cases/:id: figures derived from the case, never stored. */
export interface CaseStats {
  ageDays: number;
  daysInStatus: number;
  statusSince: string;
  statusHistory: { status: CaseStatus; enteredAt: string; days: number; current: boolean }[];
  statusChanges: number;
  daysToDecision: number | null;
  documents: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    bytes: number;
    requiredTotal: number;
    requiredAccepted: number;
    lastUploadAt: string | null;
  };
  messages: {
    total: number;
    fromClient: number;
    fromStaff: number;
    lastClientAt: string | null;
    lastStaffAt: string | null;
    awaitingStaffReply: boolean;
  };
  lastActivity: { type: string; at: string; byRole: Role | null } | null;
  eventsTotal: number;
}

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
}

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone: string | null;
  locale: string;
  isActive: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  lastLoginAt: string | null;
  online: boolean;
  liveSessions: number;
  logins30d: number;
  /** Set on a client account that was merged into another one (closed stub). */
  mergedIntoId?: string | null;
  /** Referral partner who owns this client (sign-up link / partner portal / admin). */
  ownerPartner?: { id: string; name: string } | null;
  _count: { cases: number; assignedCases: number; docFiles: number; messages: number };
}

export interface Inquiry {
  id: string;
  kind: string;
  companyName: string | null;
  contactName: string;
  email: string;
  phone: string | null;
  sector: string | null;
  workersNeeded: number | null;
  message: string;
  locale: string;
  status: InquiryStatus;
  createdAt: string;
}

export interface InquiriesResponse {
  items: Inquiry[];
  summary: {
    byStatus: Partial<Record<InquiryStatus, number>>;
    byKind: Partial<Record<string, number>>;
    new7d: number;
    oldestOpenDays: number | null;
    workersRequested: number;
  };
}

// ─── Oversight (super admin) ───────────────────────────────────────────

export interface StaffWorkspaceSummary {
  folderId: string;
  slug: string;
  files: number;
  bytes: number;
  lastUploadAt: string | null;
}

export interface OversightStaffRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  online: boolean;
  lastSeenAt: string | null;
  logins30d: number;
  activeMinutes7d: number;
  activeMinutes30d: number;
  activeDays30d: number;
  caseActions30d: number;
  documentsReviewed30d: number;
  messages30d: number;
  workspaceUploads30d: number;
  adminActions30d: number;
  assignedOpen: number;
  assignedClosed: number;
  workspace: StaffWorkspaceSummary | null;
}

export interface OversightSummary {
  generatedAt: string;
  users: {
    byRole: Partial<Record<Role, number>>;
    total: number;
    clientsNew7d: number;
    clientsNew30d: number;
    clientsActive7d: number;
    clientsActive30d: number;
    clientsOnline: number;
    staffOnline: number;
    sessionsLive: number;
  };
  cases: {
    byStatus: Partial<Record<CaseStatus, number>>;
    total: number;
    new7d: number;
    new30d: number;
    decided30d: Partial<Record<'APPROVED' | 'REJECTED', number>>;
    approvalRate: number | null;
    avgDaysToDecision: number | null;
    appointmentsNext7d: number;
    waitingOverdue3d: number;
  };
  inquiries: { byStatus: Partial<Record<InquiryStatus, number>>; byKind: Partial<Record<string, number>> };
  documents: { byStatus: Partial<Record<DocStatus, number>>; total: number };
  workspaces: { folders: number; files: number; bytes: number };
  emails30d: Partial<Record<'SENT' | 'FAILED' | 'CONSOLE', number>>;
  security: { loginFailed24h: number; auditEntries30d: number };
  staff: OversightStaffRow[];
}

export interface ActivityPoint {
  day: string;
  logins: number;
  caseEvents: number;
  messages: number;
  documents: number;
  inquiries: number;
  newClients: number;
  newCases: number;
  workspaceUploads: number;
  failedLogins: number;
  staffActiveMinutes: number;
}

export interface ActivityResponse {
  days: number;
  since: string;
  series: ActivityPoint[];
}

export interface StaffSession {
  id: string;
  client: 'web' | 'mobile';
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  expiresAt: string;
  activeMinutes: number;
  live: boolean;
}

export interface StaffCaseEvent {
  id: string;
  type: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus | null;
  note: string | null;
  createdAt: string;
  case: { id: string; number: string; client: { firstName: string; lastName: string } };
}

export interface StaffAuditEntry {
  id: string;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface StaffAssignedCase {
  id: string;
  number: string;
  status: CaseStatus;
  profession: string;
  updatedAt: string;
  createdAt: string;
  client: { firstName: string; lastName: string };
}

export interface StaffDetailResponse {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    role: Role;
    isActive: boolean;
    locale: string;
    createdAt: string;
  };
  totals: { assignedCases: number; events: number; messages: number; documents: number; docFiles: number; auditLogs: number; sessions: number };
  online: boolean;
  lastSeenAt: string | null;
  activeMinutes30d: number;
  dailyActive: { day: string; minutes: number }[];
  hourHistogram: number[];
  sessions: StaffSession[];
  eventTypes30d: Record<string, number>;
  documentsReviewed: Partial<Record<'DOCUMENT_ACCEPTED' | 'DOCUMENT_REJECTED', number>>;
  events: StaffCaseEvent[];
  audit: StaffAuditEntry[];
  assignedCases: { open: StaffAssignedCase[]; closed: StaffAssignedCase[] };
  workspace:
    | (StaffWorkspaceSummary & {
        sharedWith: { access: DocAccess; user: { id: string; firstName: string; lastName: string } }[];
        accessTo: { access: DocAccess; folder: { id: string; slug: string; owner: { firstName: string; lastName: string } } }[];
      })
    | null;
}
