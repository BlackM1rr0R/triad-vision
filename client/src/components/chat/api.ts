import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Attachment, Channel, Message, MessagePage, Person, SharedFile } from './types';

export const chatKeys = {
  all: ['chat'] as const,
  channels: ['chat', 'channels'] as const,
  summary: ['chat', 'summary'] as const,
  messages: (channelId: string) => ['chat', 'messages', channelId] as const,
  thread: (messageId: string) => ['chat', 'thread', messageId] as const,
  pinned: (channelId: string) => ['chat', 'pinned', channelId] as const,
  files: (channelId: string) => ['chat', 'files', channelId] as const,
  people: ['chat', 'people'] as const,
  search: (q: string, channelId: string) => ['chat', 'search', q, channelId] as const,
};

export const attachmentUrl = (id: string, download = false) => `/api/chat/attachments/${encodeURIComponent(id)}${download ? '?download=1' : ''}`;

export const useChannels = () =>
  useQuery({
    queryKey: chatKeys.channels,
    queryFn: async () => (await api.get<{ channels: Channel[] }>('/chat/channels')).data.channels,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

export const useMessages = (channelId: string | null) =>
  useInfiniteQuery({
    queryKey: chatKeys.messages(channelId ?? ''),
    queryFn: async ({ pageParam }) =>
      (await api.get<MessagePage>(`/chat/channels/${encodeURIComponent(channelId!)}/messages`, { params: { limit: 50, before: pageParam || undefined } })).data,
    initialPageParam: '' as string,
    getNextPageParam: (last) => (last.hasMore && last.messages.length ? last.messages[last.messages.length - 1].createdAt : undefined),
    enabled: !!channelId,
    staleTime: 30_000,
  });

export const useThread = (messageId: string | null) =>
  useQuery({
    queryKey: chatKeys.thread(messageId ?? ''),
    queryFn: async () => (await api.get<{ root: Message; replies: Message[] }>(`/chat/messages/${encodeURIComponent(messageId!)}/thread`)).data,
    enabled: !!messageId,
    retry: false,
  });

export const usePinned = (channelId: string | null, enabled = true) =>
  useQuery({
    queryKey: chatKeys.pinned(channelId ?? ''),
    queryFn: async () => (await api.get<{ messages: Message[] }>(`/chat/channels/${encodeURIComponent(channelId!)}/pinned`)).data.messages,
    enabled: !!channelId && enabled,
  });

export const useSharedFiles = (channelId: string | null, enabled = true) =>
  useQuery({
    queryKey: chatKeys.files(channelId ?? ''),
    queryFn: async () => (await api.get<{ files: SharedFile[] }>(`/chat/channels/${encodeURIComponent(channelId!)}/files`)).data.files,
    enabled: !!channelId && enabled,
  });

export const usePeople = () =>
  useQuery({
    queryKey: chatKeys.people,
    queryFn: async () => (await api.get<{ people: Person[] }>('/chat/people')).data.people,
    staleTime: 5 * 60_000,
  });

export const useSearch = (q: string, channelId: string) =>
  useQuery({
    queryKey: chatKeys.search(q, channelId),
    queryFn: async () => (await api.get<{ messages: Message[]; mode: string }>('/chat/search', { params: { q, channelId: channelId || undefined } })).data,
    enabled: q.trim().length > 0,
    staleTime: 10_000,
  });

// ─── Mutations (plain functions; callers handle optimistic state) ──────

const enc = encodeURIComponent;

export const chatApi = {
  createChannel: async (body: { kind: 'PUBLIC' | 'PRIVATE'; name: string; topic?: string | null; memberIds?: string[] }) => (await api.post<{ channel: Channel }>('/chat/channels', body)).data.channel,
  updateChannel: async (id: string, body: { name?: string; topic?: string | null }) => (await api.patch<{ channel: Channel }>(`/chat/channels/${enc(id)}`, body)).data.channel,
  archive: async (id: string) => (await api.post<{ channel: Channel }>(`/chat/channels/${enc(id)}/archive`)).data.channel,
  join: async (id: string) => (await api.post<{ channel: Channel }>(`/chat/channels/${enc(id)}/join`)).data.channel,
  leave: async (id: string) => (await api.post<{ channel: Channel }>(`/chat/channels/${enc(id)}/leave`)).data.channel,
  members: async (id: string, body: { add?: string[]; remove?: string[] }) => (await api.post<{ channel: Channel }>(`/chat/channels/${enc(id)}/members`, body)).data.channel,
  read: async (id: string) => (await api.post<{ lastReadAt: string }>(`/chat/channels/${enc(id)}/read`)).data,
  mute: async (id: string, value: boolean) => (await api.post<{ muted: boolean }>(`/chat/channels/${enc(id)}/mute`, { value })).data,
  pinChannel: async (id: string, value: boolean) => (await api.post<{ pinned: boolean }>(`/chat/channels/${enc(id)}/pin`, { value })).data,
  typing: (id: string) => api.post(`/chat/channels/${enc(id)}/typing`).catch(() => undefined),
  dm: async (userId: string) => (await api.post<{ channel: Channel }>('/chat/dm', { userId })).data.channel,
  send: async (channelId: string, body: { body: string; parentId?: string | null; attachmentIds?: string[]; mentions?: string[] }) =>
    (await api.post<{ message: Message }>(`/chat/channels/${enc(channelId)}/messages`, body)).data.message,
  edit: async (id: string, body: string, mentions?: string[]) => (await api.patch<{ message: Message }>(`/chat/messages/${enc(id)}`, { body, mentions })).data.message,
  remove: async (id: string) => api.delete(`/chat/messages/${enc(id)}`),
  pin: async (id: string, pinned: boolean) => (await api.post<{ message: Message }>(`/chat/messages/${enc(id)}/${pinned ? 'pin' : 'unpin'}`)).data.message,
  react: async (id: string, emoji: string) => (await api.post<{ reactions: Message['reactions']; added: boolean }>(`/chat/messages/${enc(id)}/reactions`, { emoji })).data,
  message: async (id: string) => (await api.get<{ message: Message }>(`/chat/messages/${enc(id)}`)).data.message,
  upload: async (file: File, onProgress: (percent: number) => void) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return (
      await api.post<{ attachment: Attachment }>('/chat/attachments', form, {
        onUploadProgress: (e) => onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 50),
      })
    ).data.attachment;
  },
  fromDrive: async (driveNodeId: string) => (await api.post<{ attachment: Attachment }>('/chat/attachments/from-drive', { driveNodeId })).data.attachment,
};

/** Refreshes the channel list and the rail badge. */
export const refreshChannels = (qc: QueryClient) => {
  void qc.invalidateQueries({ queryKey: chatKeys.channels });
  void qc.invalidateQueries({ queryKey: chatKeys.summary });
};

// ─── Cache surgery for realtime events ─────────────────────────────────

type Pages = { pages: MessagePage[]; pageParams: unknown[] };

const mapPages = (data: Pages | undefined, fn: (m: Message) => Message | null): Pages | undefined =>
  data && { ...data, pages: data.pages.map((p) => ({ ...p, messages: p.messages.map(fn).filter((m): m is Message => !!m) })) };

export const cacheUpsertMessage = (qc: QueryClient, msg: Message) => {
  if (msg.parentId) {
    qc.setQueryData<{ root: Message; replies: Message[] }>(chatKeys.thread(msg.parentId), (old) => {
      if (!old) return old;
      const idx = old.replies.findIndex((r) => r.id === msg.id);
      const replies = idx >= 0 ? old.replies.map((r) => (r.id === msg.id ? { ...r, ...msg, canEdit: r.canEdit, canDelete: r.canDelete } : r)) : [...old.replies, msg];
      return { ...old, replies };
    });
    return;
  }
  qc.setQueryData<Pages>(chatKeys.messages(msg.channelId), (old) => {
    if (!old) return old;
    let found = false;
    const next = mapPages(old, (m) => {
      if (m.id !== msg.id) return m;
      found = true;
      return { ...m, ...msg, canEdit: m.canEdit, canDelete: m.canDelete, pending: false, failed: false };
    })!;
    if (found) return next;
    const [first, ...rest] = next.pages;
    return { ...next, pages: [{ ...first, messages: [msg, ...first.messages] }, ...rest] };
  });
  qc.setQueryData<{ root: Message; replies: Message[] }>(chatKeys.thread(msg.id), (old) => (old ? { ...old, root: { ...old.root, ...msg, canEdit: old.root.canEdit, canDelete: old.root.canDelete } } : old));
};

export const cacheRemoveMessage = (qc: QueryClient, channelId: string, messageId: string, parentId: string | null) => {
  if (parentId) {
    qc.setQueryData<{ root: Message; replies: Message[] }>(chatKeys.thread(parentId), (old) => (old ? { ...old, replies: old.replies.filter((r) => r.id !== messageId) } : old));
    qc.setQueryData<Pages>(chatKeys.messages(channelId), (old) => mapPages(old, (m) => (m.id === parentId ? { ...m, replyCount: Math.max(0, m.replyCount - 1) } : m)));
    return;
  }
  qc.setQueryData<Pages>(chatKeys.messages(channelId), (old) => mapPages(old, (m) => (m.id === messageId ? null : m)));
  qc.removeQueries({ queryKey: chatKeys.thread(messageId) });
};

export const cachePatchMessage = (qc: QueryClient, channelId: string, messageId: string, parentId: string | null, patch: (m: Message) => Message) => {
  qc.setQueryData<Pages>(chatKeys.messages(channelId), (old) => mapPages(old, (m) => (m.id === messageId ? patch(m) : m)));
  if (parentId) qc.setQueryData<{ root: Message; replies: Message[] }>(chatKeys.thread(parentId), (old) => (old ? { ...old, replies: old.replies.map((r) => (r.id === messageId ? patch(r) : r)) } : old));
  qc.setQueryData<{ root: Message; replies: Message[] }>(chatKeys.thread(messageId), (old) => (old ? { ...old, root: patch(old.root) } : old));
};

export const cacheBumpReplyCount = (qc: QueryClient, channelId: string, parentId: string, lastReplyAt: string) => {
  qc.setQueryData<Pages>(chatKeys.messages(channelId), (old) => mapPages(old, (m) => (m.id === parentId ? { ...m, replyCount: m.replyCount + 1, lastReplyAt } : m)));
};
