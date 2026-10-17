import type { CaseStatus, L10n, Notification, User } from '@/lib/types';
import type { ProfileField } from './profileFields';

/** Response of GET /api/account/overview (one request for the whole dashboard). */
export type NextActionKind =
  | 'UPLOAD_DOCUMENTS'
  | 'FIX_DOCUMENTS'
  | 'SUBMIT_DOCUMENTS'
  | 'SIGN_CONTRACT'
  | 'PREPARE_APPOINTMENT'
  | 'WAIT_REVIEW'
  | 'WAIT_DECISION'
  | 'VIEW_RESULT'
  | 'CONTACT_MANAGER';

export type DocItemState = 'missing' | 'pending' | 'accepted' | 'rejected';

export interface DocItem {
  id: string;
  title: L10n;
  required: boolean;
  state: DocItemState;
  note: string | null;
}

export interface DocSummary {
  stage: 'INITIAL' | 'EMBASSY';
  total: number;
  required: number;
  uploaded: number;
  requiredUploaded: number;
  accepted: number;
  rejected: number;
  missingRequired: number;
  items: DocItem[];
}

export interface OverviewCaseRow {
  id: string;
  number: string;
  profession: string;
  /** WORK | AUSBILDUNG | JOB_SEEKER | STUDY | FAMILY | TOURIST */
  visaType?: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  decisionAt: string | null;
  visaCategory: { id: string; slug: string; title: L10n; visaLabel: string } | null;
  /** Family reunion: member cases carry the relation to the main applicant (spouse | child | parent). */
  relation?: string | null;
  parentCaseId?: string | null;
}

export interface ActiveCase extends OverviewCaseRow {
  step: number;
  stepCount: number;
  percent: number;
  turn: 'client' | 'staff' | null;
  nextAction: { kind: NextActionKind; owner: 'client' | 'staff' | null; anchor: string | null };
  staffNote: string | null;
  documents: DocSummary;
  appointment: { at: string; place: string | null } | null;
  manager: { firstName: string; lastName: string } | null;
  contract: { version: number; sentAt: string; signedAt: string | null } | null;
  /** Small counters for the "case in numbers" strip. */
  stats: { ageDays: number; daysInStatus: number; messages: number; events: number; uploads: number };
}

export interface LastMessage {
  id: string;
  caseId: string;
  caseNumber: string;
  body: string;
  createdAt: string;
  fromTeam: boolean;
  author: { firstName: string; lastName: string };
}

export interface AccountOverview {
  user: User;
  profile: { percent: number; missing: ProfileField[] };
  activeCase: ActiveCase | null;
  cases: OverviewCaseRow[];
  notifications: { unread: number; items: Notification[] };
  lastMessage: LastMessage | null;
}
