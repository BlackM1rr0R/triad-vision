import type { CaseStatus, L10n, Role } from '@/lib/types';
import type { InquiryStatus } from './labels';

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
}

export interface AdminCasesResponse {
  items: AdminCaseListItem[];
  total: number;
  pageSize: number;
  counts: Partial<Record<CaseStatus, number>>;
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

export interface DashboardResponse {
  counts: Partial<Record<CaseStatus, number>>;
  newInquiries: number;
  newClients30d: number;
  recentEvents: DashboardEvent[];
  waiting: DashboardWaiting[];
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
  _count: { cases: number };
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
