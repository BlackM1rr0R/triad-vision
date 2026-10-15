import type { Role } from '@/lib/types';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'];
export const BOARD_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
export const TASK_PRIORITIES: TaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
export const OPEN_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW'];

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  role?: Role;
  email?: string;
}

export interface CaseRef {
  id: string;
  number: string;
  clientName: string;
  status?: string;
}

export interface TaskCard {
  id: string;
  number: number;
  key: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  startAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  assignees: Person[];
  case: CaseRef | null;
  checklist: { done: number; total: number };
  commentCount: number;
  attachmentCount: number;
}

export interface TaskListResponse {
  items: TaskCard[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  sortOrder: number;
}

export interface TaskAttachment {
  nodeId: string;
  name: string;
  kind: 'FILE' | 'FOLDER';
  mimeType: string | null;
  size: number | null;
  createdAt: string;
  accessible: boolean;
}

type Named = { id: string; name: string };
export type Activity =
  | { type: 'created' }
  | { type: 'status'; from: TaskStatus; to: TaskStatus }
  | { type: 'priority'; from: TaskPriority; to: TaskPriority }
  | { type: 'due'; from: string | null; to: string | null }
  | { type: 'assignees'; added: Named[]; removed: Named[] }
  | { type: 'case'; from: string | null; to: string | null }
  | { type: 'title'; from: string; to: string };

export type TimelineEntry =
  | { id: string; kind: 'activity'; author: Person | null; createdAt: string; activity: Activity | null }
  | { id: string; kind: 'comment'; author: Person | null; createdAt: string; body: string; canEdit: boolean; canDelete: boolean };

export interface TaskPermissions {
  edit: boolean;
  delete: boolean;
  assign: boolean;
  status: boolean;
  checklist: boolean;
  comment: boolean;
  attach: boolean;
  take: boolean;
}

export interface TaskDetail {
  id: string;
  number: number;
  key: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  createdBy: Person | null;
  assignees: Person[];
  case: CaseRef | null;
  checklist: ChecklistItem[];
  attachments: TaskAttachment[];
  timeline: TimelineEntry[];
  permissions: TaskPermissions;
}

export type DueFilter = 'overdue' | 'today' | 'week' | 'none';
export type TaskView = 'board' | 'list' | 'calendar';
export type ListSort = 'number' | 'title' | 'priority' | 'dueAt' | 'status' | 'updatedAt' | 'createdAt';

export interface TaskFilters {
  /** 'me' | 'unassigned' | userId | '' (anyone) */
  assignee: string;
  priority: TaskPriority[];
  status: TaskStatus[];
  due: DueFilter | '';
  caseId: string;
  search: string;
  cancelled: boolean;
}
