import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CaseStatus, L10n, Role } from '@/lib/types';

/**
 * Staff desk round: client 360° (/api/admin/clients), team workload (/api/admin/workload), the embassy layer of the
 * workspace calendar (/api/admin/ops-calendar) and canned replies (/api/admin/canned-replies).
 */

type Locale = 'az' | 'de' | 'en' | 'ru';
const enc = encodeURIComponent;

// ─── Client 360° ────────────────────────────────────────────────────────

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
  role?: Role;
}

export interface Client360 {
  client: {
    id: string;
    email: string;
    phone: string | null;
    firstName: string;
    lastName: string;
    locale: Locale;
    isActive: boolean;
    createdAt: string;
    birthDate: string | null;
    nationality: string | null;
    city: string | null;
    profession: string | null;
    germanLevel: string | null;
    mergedIntoId: string | null;
    whatsappOptIn: boolean;
    marketingOptIn: boolean;
    lastSeenAt: string | null;
    ownerPartner: { id: string; name: string } | null;
  };
  tags: string[];
  contactId: string | null;
  flags: string[];
  owner: PersonRef | null;
  partner: { id: string; name: string } | null;
  agent: { id: string; code: string; name: string | null } | null;
  nextAppointment: { caseId: string; number: string; at: string; place: string | null } | null;
  counts: { cases: number; openCases: number; invoices: number; overdueInvoices: number; messages: number; calls: number; documents: number; pendingDocuments: number; tasks: number; family: number };
  money: { billed: Record<string, number>; paid: Record<string, number>; open: Record<string, number> };
  cases: {
    id: string;
    number: string;
    status: CaseStatus;
    profession: string;
    visaType: string | null;
    createdAt: string;
    updatedAt: string;
    appointmentAt: string | null;
    appointmentPlace: string | null;
    parentCaseId: string | null;
    assignedStaff: PersonRef | null;
    partner: { id: string; name: string } | null;
    company: { id: string; name: string } | null;
    visaCategory: { title: L10n; visaLabel: string } | null;
    open: boolean;
  }[];
  invoices: { id: string; number: string; status: string; currency: string; grossCents: number; paidCents: number; issueDate: string; dueDate: string; paidAt: string | null; caseId: string | null; caseNumber: string | null; overdue: boolean }[];
  messages: { id: string; caseId: string; caseNumber: string | null; body: string | null; channel: string; createdAt: string; readAt: string | null; author: { id: string; name: string | null; role: Role } }[];
  calls: { id: string; direction: 'INBOUND' | 'OUTBOUND'; status: string; outcome: string | null; startedAt: string; durationSec: number | null; summary: string | null; note: string | null; staffName: string | null; caseId: string | null; caseNumber: string | null }[];
  documents: { id: string; caseId: string; caseNumber: string | null; originalName: string; stage: string; status: string; mimeType: string; size: number; createdAt: string; expiresAt: string | null }[];
  tasks: { id: string; number: number; title: string; status: string; priority: string; dueAt: string | null; caseId: string | null; caseNumber: string | null; assignees: { id: string; name: string | null }[]; overdue: boolean }[];
  clientTasks: { id: string; title: string; status: 'OPEN' | 'DONE' | 'CANCELLED'; dueAt: string | null; caseId: string; caseNumber: string | null; completedAt: string | null; overdue: boolean }[];
  family: { id: string; relation: 'SPOUSE' | 'CHILD' | 'PARENT' | 'OTHER'; firstName: string; lastName: string; birthDate: string | null; joinsWhen: 'WITH_MAIN' | 'LATER'; plannedEntryAt: string | null; side: 'member' | 'main'; caseId: string; caseNumber: string; caseStatus: CaseStatus | null; otherClientId: string | null; mainApplicant: string | null }[];
  inquiries: { id: string; kind: string; status: string; createdAt: string; source: string | null; message: string | null }[];
  liveChats: { id: string; status: string; createdAt: string; closedAt: string | null }[];
}

export const TIMELINE_TYPES = ['case', 'note', 'message', 'call', 'document', 'payment', 'task', 'audit'] as const;
export type TimelineType = (typeof TIMELINE_TYPES)[number];

export interface TimelineEntry {
  id: string;
  type: TimelineType;
  kind: string;
  at: string;
  text: string | null;
  actor: string | null;
  actorRole: Role | null;
  caseId: string | null;
  caseNumber: string | null;
  meta?: Record<string, unknown>;
}

export const client360Key = (id: string) => ['client-360', id] as const;

export const useClient360 = (id: string | undefined) =>
  useQuery({ queryKey: client360Key(id ?? ''), queryFn: async () => (await api.get<Client360>(`/admin/clients/${enc(id!)}`)).data, enabled: !!id, staleTime: 30_000 });

export const useClientTimeline = (id: string | undefined, types: TimelineType[], caseId: string | null) =>
  useInfiniteQuery({
    queryKey: ['client-360', id ?? '', 'timeline', types.join(','), caseId ?? ''],
    queryFn: async ({ pageParam }) =>
      (await api.get<{ entries: TimelineEntry[]; nextBefore: string | null }>(`/admin/clients/${enc(id!)}/timeline`, { params: { types: types.join(',') || undefined, before: pageParam || undefined, limit: 40, caseId: caseId || undefined } })).data,
    initialPageParam: '',
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!id,
    staleTime: 30_000,
  });

export const saveClientTags = async (id: string, tags: string[]) => (await api.put<{ contactId: string; tags: string[] }>(`/admin/clients/${enc(id)}/tags`, { tags })).data;

/** Link to a client's 360° page. */
export const clientHref = (id: string) => `/admin/clients/${enc(id)}`;

// ─── Workload ───────────────────────────────────────────────────────────

export type CapacityLevel = 'low' | 'ok' | 'high' | 'over';

export interface WorkloadRow {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  activeCases: number;
  weighted: number;
  overdue: number;
  overdueTasks: number;
  overdueClientTasks: number;
  openTasks: number;
  unanswered: number;
  appointments: number;
  appointmentsByType: { embassy: number; interview: number; consultation: number; arrival: number };
  capacity: number;
  capacityCustom: boolean;
  capacityPct: number;
  level: CapacityLevel;
  absentUntil: string | null;
}

export interface WorkloadResponse {
  scope: 'team' | 'self';
  rows: WorkloadRow[];
  totals?: { staff: number; activeCases: number; overdue: number; openTasks: number; unanswered: number; appointments: number; overCapacity: number };
  unassigned?: number;
  week: { from: string; to: string };
}

export const useWorkload = (role: Role | '') =>
  useQuery({
    queryKey: ['workload', role],
    queryFn: async () => (await api.get<WorkloadResponse>('/admin/workload', { params: { role: role || undefined } })).data,
    staleTime: 30_000,
    refetchInterval: 120_000,
    placeholderData: (prev) => prev,
  });

export interface AssignSuggestion {
  id: string;
  firstName: string;
  lastName: string;
  open?: number;
  weighted?: number;
  capacityPct?: number;
  eligible: boolean;
  reasons: string[];
}

export const useAssignSuggest = (caseId: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: ['workload', 'suggest', caseId ?? ''],
    queryFn: async () => (await api.get<{ suggested: AssignSuggestion | null; staff: AssignSuggestion[] }>('/admin/workload/suggest', { params: { caseId: caseId || undefined } })).data,
    enabled: enabled && !!caseId,
    staleTime: 60_000,
  });

// ─── Embassy calendar layer ─────────────────────────────────────────────

export const OPS_TYPES = ['embassy', 'interview', 'arrival', 'consultation'] as const;
export type OpsType = (typeof OPS_TYPES)[number];

export interface OpsItem {
  key: string;
  type: OpsType;
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  status: string;
  client: { id: string; name: string } | null;
  staff: { id: string; name: string } | null;
  caseId: string | null;
  caseNumber: string | null;
  link: string;
  movable: boolean;
  place?: string | null;
}

export const useOpsCalendar = (from: Date, to: Date, staffId: string, types: OpsType[], enabled: boolean) =>
  useQuery({
    queryKey: ['ops-calendar', from.toISOString(), to.toISOString(), staffId, types.join(',')],
    queryFn: async () =>
      (await api.get<{ items: OpsItem[]; counts: Record<OpsType, number> }>('/admin/ops-calendar', { params: { from: from.toISOString(), to: to.toISOString(), staffId: staffId || undefined, types: types.join(',') } })).data,
    enabled: enabled && types.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 20_000,
    refetchInterval: 120_000,
  });

export const refreshOps = (qc: QueryClient) => {
  void qc.invalidateQueries({ queryKey: ['ops-calendar'] });
  void qc.invalidateQueries({ queryKey: ['calendar', 'range'] });
};

// ─── Canned replies ─────────────────────────────────────────────────────

export interface CannedReply {
  id: string;
  name: string;
  shortcut: string | null;
  lang: Locale | null;
  shared: boolean;
  body: string;
  fromMail: boolean;
  mine: boolean;
  canEdit: boolean;
  author: string | null;
  updatedAt: string;
}

export interface CannedPickerItem {
  id: string;
  name: string;
  shortcut: string | null;
  lang: Locale | null;
  shared: boolean;
  mine: boolean;
  body: string;
  filled: string;
}

export interface CannedContext {
  caseId?: string;
  userId?: string;
  inquiryId?: string;
  liveChatId?: string;
}

export const cannedKeys = { all: ['canned-replies'] as const, picker: (ctx: CannedContext) => ['canned-replies', 'picker', ctx.caseId ?? '', ctx.userId ?? '', ctx.inquiryId ?? '', ctx.liveChatId ?? ''] as const };

export const useCannedReplies = () =>
  useQuery({
    queryKey: cannedKeys.all,
    queryFn: async () => (await api.get<{ replies: CannedReply[]; variables: string[]; languages: Locale[]; canManageTeam: boolean }>('/admin/canned-replies')).data,
    staleTime: 60_000,
  });

export const useCannedPicker = (ctx: CannedContext, enabled: boolean) =>
  useQuery({
    queryKey: cannedKeys.picker(ctx),
    queryFn: async () => (await api.get<{ lang: Locale | null; vars: Record<string, string>; replies: CannedPickerItem[] }>('/admin/canned-replies/picker', { params: ctx })).data,
    enabled,
    staleTime: 30_000,
  });

export interface CannedInput {
  name: string;
  text: string;
  shortcut?: string | null;
  lang?: Locale | null;
  shared?: boolean;
}

export const cannedApi = {
  create: async (body: CannedInput) => (await api.post<{ reply: CannedReply }>('/admin/canned-replies', body)).data.reply,
  update: async (id: string, body: Partial<CannedInput>) => (await api.patch<{ reply: CannedReply }>(`/admin/canned-replies/${enc(id)}`, body)).data.reply,
  remove: (id: string) => api.delete(`/admin/canned-replies/${enc(id)}`),
};

export const refreshCanned = (qc: QueryClient) => {
  void qc.invalidateQueries({ queryKey: cannedKeys.all });
  void qc.invalidateQueries({ queryKey: ['mail', 'templates'] });
};
