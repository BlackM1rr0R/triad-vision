import type { CaseStatus } from '@/lib/types';

/** GET /admin/inbox (server routes/admin/inbox.ts). */
export interface InboxItem {
  caseId: string;
  number: string;
  status: CaseStatus;
  client: { id: string; firstName: string; lastName: string; phone: string | null };
  assignedStaff: { id: string; firstName: string; lastName: string } | null;
  lastMessage: { excerpt: string; at: string; fromClient: boolean; voice: boolean };
  awaitingReply: boolean;
  since: string | null;
  waitingCount: number;
  unread: number;
}
export interface InboxResponse {
  items: InboxItem[];
  counts: { awaiting: number; unread: number };
  scope: 'mine' | 'all';
}
export type InboxFilter = 'all' | 'awaiting' | 'unread';
