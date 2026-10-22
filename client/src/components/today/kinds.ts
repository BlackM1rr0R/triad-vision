import type { LucideIcon } from 'lucide-react';
import {
  AlarmClock,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarClock,
  FileCheck2,
  FileSignature,
  Hourglass,
  Inbox,
  ListTodo,
  Mail,
  MailWarning,
  PenLine,
  ShieldAlert,
  ShieldHalf,
  Snail,
  UserSearch,
  UsersRound,
} from 'lucide-react';
import type { WorkCategory, WorkKind, WorkPriority } from './api';

export const KIND_ICON: Record<WorkKind, LucideIcon> = {
  doc_review: FileCheck2,
  case_waiting: AlarmClock,
  case_stuck: Snail,
  appointment: CalendarCheck2,
  sign_mine: PenLine,
  sign_waiting: FileSignature,
  task: ListTodo,
  mail_triage: MailWarning,
  mail_unread: Mail,
  inquiry: Inbox,
  booking: CalendarClock,
  application: UserSearch,
  employer_decision: BriefcaseBusiness,
  candidate_request: UsersRound,
  expiring: Hourglass,
  security_alert: ShieldAlert,
  privacy: ShieldHalf,
};

/** Icon tile colours per category (light + dark via the brand / status tokens used across the admin). */
export const CATEGORY_TONE: Record<WorkCategory, string> = {
  documents: 'bg-amber-100 text-amber-700',
  tasks: 'bg-brand-100 text-brand-700',
  mail: 'bg-sky-100 text-sky-700',
  signatures: 'bg-violet-100 text-violet-700',
  bookings: 'bg-emerald-100 text-emerald-700',
  leads: 'bg-rose-100 text-rose-700',
  other: 'bg-slate-100 text-slate-600',
};

export const PRIORITY_DOT: Record<WorkPriority, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-amber-400',
  NORMAL: 'bg-slate-300',
};

export const FILTERS = ['all', 'urgent', 'documents', 'tasks', 'mail', 'signatures', 'bookings', 'leads', 'other'] as const;
export type WorkFilter = (typeof FILTERS)[number];
