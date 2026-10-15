import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Role } from '@/lib/types';

/** Types and query hooks for /api/workspace and /api/contacts. */

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

// ─── Presence / status ─────────────────────────────────────────────────

export type LeaveType = 'VACATION' | 'SICK' | 'REMOTE' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export const LEAVE_TYPES: LeaveType[] = ['VACATION', 'SICK', 'REMOTE', 'OTHER'];

export interface PresenceRow extends Person {
  email: string;
  role: Role;
  online: boolean;
  lastSeenAt: string | null;
  statusText: string | null;
  statusEmoji: string | null;
  statusUntil: string | null;
  onLeave: { id: string; type: LeaveType; until: string } | null;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  user: Person & { role: Role };
  type: LeaveType;
  status: LeaveStatus;
  startsAt: string;
  endsAt: string;
  note: string | null;
  decidedById: string | null;
  decidedBy: Person | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
  days: number;
}

export interface LeaveBalance {
  year: number;
  used: Record<LeaveType, number>;
  pending: Record<LeaveType, number>;
}

// ─── Announcements / notes / polls ─────────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: Person;
  read: boolean;
  expired: boolean;
  readCount?: number;
  canEdit: boolean;
}

export type NoteColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
export const NOTE_COLORS: NoteColor[] = ['yellow', 'green', 'blue', 'pink', 'purple'];

export interface Note {
  id: string;
  title: string | null;
  body: string;
  color: NoteColor | null;
  pinned: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PollOption {
  id: string;
  text: string;
  count: number;
  mine: boolean;
  voters: Person[] | null;
}

export interface Poll {
  id: string;
  question: string;
  multiple: boolean;
  anonymous: boolean;
  closesAt: string | null;
  closedAt: string | null;
  open: boolean;
  createdAt: string;
  channelId: string | null;
  author: Person;
  options: PollOption[];
  totalVotes: number;
  voterCount: number;
  myVotes: string[];
  canClose: boolean;
  canDelete: boolean;
}

export interface HomeData {
  now: string;
  announcements: { items: Announcement[]; unread: number };
  notes: Note[];
  polls: Poll[];
  presence: { total: number; online: number; onLeave: number; people: PresenceRow[] };
  leave: { mine: LeaveRequest[]; pending: LeaveRequest[] };
}

// ─── Contacts ──────────────────────────────────────────────────────────

export type ContactSource = 'MANUAL' | 'MAIL' | 'IMPORT';

export interface Contact {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  emails: string[];
  phone: string | null;
  company: string | null;
  companyId: string | null;
  position: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  shared: boolean;
  source: ContactSource;
  lastContactAt: string | null;
  userId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface ContactDetail {
  contact: Contact;
  user: (Person & { role: Role; email: string }) | null;
  cases: { id: string; number: string; status: string; profession: string; updatedAt: string }[];
  companyRef: { id: string; name: string; status: string; city: string | null } | null;
}

export interface ContactList {
  items: Contact[];
  total: number;
  page: number;
  pageSize: number;
  mode: 'fulltext' | 'like' | null;
}

export interface Suggestions {
  clients: { kind: 'client'; userId: string; firstName: string; lastName: string; email: string; phone: string | null; cases: number }[];
  employers: { kind: 'employer'; userId: string; firstName: string; lastName: string; email: string; phone: string | null; company: string | null; companyId: string | null }[];
  companies: { kind: 'company'; companyId: string; name: string; contactName: string | null; email: string | null; phone: string | null; city: string | null; status: string }[];
}

export interface ContactInput {
  firstName: string;
  lastName: string | null;
  email: string | null;
  emails: string[];
  phone: string | null;
  company: string | null;
  position: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  shared: boolean;
}

// ─── Keys & hooks ──────────────────────────────────────────────────────

export const wsKeys = {
  home: ['workspace', 'home'] as const,
  presence: ['workspace', 'presence'] as const,
  announcements: (all: boolean) => ['workspace', 'announcements', all] as const,
  notes: ['workspace', 'notes'] as const,
  polls: ['workspace', 'polls'] as const,
  leave: (params: Record<string, string>) => ['workspace', 'leave', params] as const,
  leaveCalendar: (from: string, to: string) => ['workspace', 'leave', 'calendar', from, to] as const,
  leaveBalance: ['workspace', 'leave', 'balance'] as const,
  contacts: (params: Record<string, string>) => ['contacts', 'list', params] as const,
  contact: (id: string) => ['contacts', 'detail', id] as const,
  tags: ['contacts', 'tags'] as const,
  suggest: ['contacts', 'suggest'] as const,
};

export const useHome = () =>
  useQuery({
    queryKey: wsKeys.home,
    queryFn: async () => (await api.get<HomeData>('/workspace/home')).data,
    refetchInterval: 60_000,
    staleTime: 15_000,
  });

export const usePresence = (enabled = true) =>
  useQuery({
    queryKey: wsKeys.presence,
    queryFn: async () => (await api.get<{ people: PresenceRow[]; now: string }>('/workspace/presence')).data,
    refetchInterval: 60_000,
    staleTime: 15_000,
    enabled,
  });

export const useAnnouncements = (all: boolean) =>
  useQuery({
    queryKey: wsKeys.announcements(all),
    queryFn: async () => (await api.get<{ items: Announcement[] }>('/workspace/announcements', { params: all ? { all: 1 } : {} })).data.items,
    staleTime: 15_000,
  });

export const useLeave = (params: Record<string, string>, enabled = true) =>
  useQuery({
    queryKey: wsKeys.leave(params),
    queryFn: async () => (await api.get<{ items: LeaveRequest[] }>('/workspace/leave', { params })).data.items,
    staleTime: 15_000,
    enabled,
  });

export const useLeaveCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: wsKeys.leaveCalendar(from, to),
    queryFn: async () => (await api.get<{ items: LeaveRequest[] }>('/workspace/leave/calendar', { params: { from, to } })).data.items,
    staleTime: 30_000,
  });

export const useLeaveBalance = () =>
  useQuery({
    queryKey: wsKeys.leaveBalance,
    queryFn: async () => (await api.get<LeaveBalance>('/workspace/leave/balance')).data,
    staleTime: 30_000,
  });

export const useContacts = (params: Record<string, string>, enabled = true) =>
  useQuery({
    queryKey: wsKeys.contacts(params),
    queryFn: async () => (await api.get<ContactList>('/contacts', { params })).data,
    placeholderData: (prev) => prev,
    staleTime: 15_000,
    enabled,
  });

export const useContact = (id: string | null) =>
  useQuery({
    queryKey: wsKeys.contact(id ?? ''),
    queryFn: async () => (await api.get<ContactDetail>(`/contacts/${encodeURIComponent(id!)}`)).data,
    enabled: !!id,
    retry: false,
  });

export const useTags = () =>
  useQuery({
    queryKey: wsKeys.tags,
    queryFn: async () => (await api.get<{ tags: { tag: string; count: number }[] }>('/contacts/tags')).data.tags,
    staleTime: 30_000,
  });

export const useSuggestions = (enabled: boolean) =>
  useQuery({
    queryKey: wsKeys.suggest,
    queryFn: async () => (await api.get<Suggestions>('/contacts/suggest')).data,
    enabled,
    staleTime: 30_000,
  });

/** Optional summaries built by the other workspace modules: a 404 (module missing) renders nothing. */
export const useOptionalSummary = <T,>(key: string, path: string) =>
  useQuery({
    queryKey: ['workspace', 'summary', key],
    queryFn: async () => {
      try {
        return (await api.get<T>(path)).data;
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 404 || status === 501) return null;
        throw err;
      }
    },
    retry: false,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

/** Invalidation helper shared by the mutations in the pages. */
export const useWorkspaceInvalidate = () => {
  const qc = useQueryClient();
  return {
    home: () => qc.invalidateQueries({ queryKey: wsKeys.home }),
    presence: () => {
      void qc.invalidateQueries({ queryKey: wsKeys.presence });
      void qc.invalidateQueries({ queryKey: wsKeys.home });
    },
    announcements: () => {
      void qc.invalidateQueries({ queryKey: ['workspace', 'announcements'] });
      void qc.invalidateQueries({ queryKey: wsKeys.home });
    },
    notes: () => {
      void qc.invalidateQueries({ queryKey: wsKeys.notes });
      void qc.invalidateQueries({ queryKey: wsKeys.home });
    },
    polls: () => {
      void qc.invalidateQueries({ queryKey: wsKeys.polls });
      void qc.invalidateQueries({ queryKey: wsKeys.home });
    },
    leave: () => {
      void qc.invalidateQueries({ queryKey: ['workspace', 'leave'] });
      void qc.invalidateQueries({ queryKey: wsKeys.home });
      void qc.invalidateQueries({ queryKey: wsKeys.presence });
    },
    contacts: () => {
      void qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  };
};
