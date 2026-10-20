import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRealtimeStatus } from '@/lib/realtime';
import type { BulkAction, FoldersResponse, ListParams, ListResponse, MailAccount, MailLabel, MailRule, MailTemplate, MessageDetail, ProviderPreset, SnoozePreset } from './types';

export const mailKeys = {
  all: ['mail'] as const,
  folders: (accountId?: string) => ['mail', 'folders', accountId ?? ''] as const,
  lists: ['mail', 'list'] as const,
  list: (params: ListParams) => ['mail', 'list', params] as const,
  message: (id: string) => ['mail', 'message', id] as const,
  thread: (id: string) => ['mail', 'thread', id] as const,
  labels: ['mail', 'labels'] as const,
  rules: ['mail', 'rules'] as const,
  templates: ['mail', 'templates'] as const,
  providers: ['mail', 'providers'] as const,
  summary: ['mail', 'summary'] as const,
  recipients: (q: string) => ['mail', 'recipients', q] as const,
};

const listQuery = (p: ListParams, cursor?: string) => {
  const q: Record<string, string> = {};
  if (p.accountId) q.accountId = p.accountId;
  if (p.folderId) q.folderId = p.folderId;
  if (p.view) q.view = p.view;
  if (p.labelId) q.labelId = p.labelId;
  if (p.q) q.q = p.q;
  if (p.from) q.from = p.from;
  if (p.to) q.to = p.to;
  if (p.hasAttachments) q.hasAttachments = '1';
  if (p.unread) q.unread = '1';
  if (p.threads) q.threads = '1';
  if (p.ai) q.ai = p.ai;
  if (cursor) q.cursor = cursor;
  return q;
};

export const useFolders = (accountId?: string) => {
  // Changes are pushed (mail.new / mail.updated invalidate this query); poll slowly while the stream is up.
  const live = useRealtimeStatus() === 'open';
  return useQuery({
    queryKey: mailKeys.folders(accountId),
    queryFn: async () => (await api.get<FoldersResponse>('/mail/folders', { params: accountId ? { accountId } : {} })).data,
    staleTime: 15_000,
    refetchInterval: live ? 300_000 : 60_000,
  });
};

export const useMessageList = (params: ListParams, enabled = true) =>
  useInfiniteQuery({
    queryKey: mailKeys.list(params),
    queryFn: async ({ pageParam }) => (await api.get<ListResponse>('/mail/messages', { params: listQuery(params, pageParam || undefined) })).data,
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 10_000,
    enabled,
  });

export const useMessage = (id: string | null) =>
  useQuery({
    queryKey: mailKeys.message(id ?? ''),
    queryFn: async () => (await api.get<{ message: MessageDetail }>(`/mail/messages/${encodeURIComponent(id!)}`)).data.message,
    enabled: !!id,
    retry: false,
    staleTime: 30_000,
  });

export const useThread = (id: string | null, enabled: boolean) =>
  useQuery({
    queryKey: mailKeys.thread(id ?? ''),
    queryFn: async () => (await api.get<{ messages: MessageDetail[] }>(`/mail/messages/${encodeURIComponent(id!)}/thread`)).data.messages,
    enabled: !!id && enabled,
    staleTime: 30_000,
  });

export const useLabels = () => useQuery({ queryKey: mailKeys.labels, queryFn: async () => (await api.get<{ labels: MailLabel[] }>('/mail/labels')).data.labels, staleTime: 60_000 });
export const useRules = (enabled = true) => useQuery({ queryKey: mailKeys.rules, queryFn: async () => (await api.get<{ rules: MailRule[] }>('/mail/rules')).data.rules, enabled });
export const useTemplates = (enabled = true) => useQuery({ queryKey: mailKeys.templates, queryFn: async () => (await api.get<{ templates: MailTemplate[] }>('/mail/templates')).data.templates, enabled, staleTime: 60_000 });
export const useProviders = (enabled = true) =>
  useQuery({ queryKey: mailKeys.providers, queryFn: async () => (await api.get<{ providers: ProviderPreset[] }>('/mail/providers')).data.providers, enabled, staleTime: Infinity });

export interface BulkInput {
  ids: string[];
  action: BulkAction;
  folderId?: string;
  labelId?: string;
  until?: string;
  preset?: SnoozePreset;
  tzOffset?: number;
}

/** Invalidates everything that shows message state (lists, counts, open message). */
export const useInvalidateMail = () => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: mailKeys.lists });
    void qc.invalidateQueries({ queryKey: ['mail', 'folders'] });
    void qc.invalidateQueries({ queryKey: ['mail', 'message'] });
    void qc.invalidateQueries({ queryKey: ['mail', 'thread'] });
    void qc.invalidateQueries({ queryKey: mailKeys.summary });
  };
};

export const useBulkAction = () => {
  const invalidate = useInvalidateMail();
  return useMutation({
    mutationFn: async (input: BulkInput) => (await api.post<{ ok: true; ids: string[] }>('/mail/messages/bulk', input)).data,
    onSettled: () => invalidate(),
  });
};

export const syncAccount = async (id: string) => (await api.post<{ ok: boolean; error?: string; newMessages: number; account: MailAccount | null }>(`/mail/accounts/${id}/sync`)).data;

export const attachmentUrl = (id: string, inline = false) => `/api/mail/attachments/${id}${inline ? '?inline=1' : ''}`;
