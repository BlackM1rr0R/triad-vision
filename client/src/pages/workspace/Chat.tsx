import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Hash, Info, Lock, Menu, MessagesSquare, Pin, Search, UserPlus } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesChat } from '@/i18n/pagesChat';
import { pagesTasks } from '@/i18n/pagesTasks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRealtime, type RealtimePayload } from '@/lib/realtime';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { cacheBumpReplyCount, cachePatchMessage, cacheRemoveMessage, cacheUpsertMessage, chatApi, chatKeys, refreshChannels, useChannels, useMessages, usePeople } from '@/components/chat/api';
import { Avatar } from '@/components/chat/bits';
import { ChannelDetails } from '@/components/chat/ChannelDetails';
import { Composer, type SendPayload } from '@/components/chat/Composer';
import { AddMembersDialog, NewChannelDialog, NewDmDialog, RenameChannelDialog, SearchPanel } from '@/components/chat/Dialogs';
import { MessageList, type MessageActions } from '@/components/chat/MessageList';
import { Sidebar } from '@/components/chat/Sidebar';
import { ThreadPane } from '@/components/chat/ThreadPane';
import type { Channel, Message, Reaction } from '@/components/chat/types';
import { channelLabel, errorText, fullName, messageLink } from '@/components/chat/utils';

registerCopy(pagesTasks);
registerCopy(pagesChat);

type Pane = { kind: 'thread'; id: string } | { kind: 'details'; tab?: 'about' | 'pinned' | 'files' } | { kind: 'search' } | null;

const groupReactions = (rows: { emoji: string; userId: string }[], meId: string): Reaction[] => {
  const map = new Map<string, Reaction>();
  for (const r of rows) {
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, me: false, userIds: [] };
    g.count++;
    g.userIds!.push(r.userId);
    if (r.userId === meId) g.me = true;
    map.set(r.emoji, g);
  }
  return [...map.values()];
};

/**
 * Team chat: channel sidebar, message pane with composer, and a right pane for threads, channel
 * details or search. URL: /workspace/chat/:channelId?/thread/:messageId? plus ?message=<id> to
 * highlight a message. Realtime events keep the caches in sync without refetching.
 */
export default function WorkspaceChat() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = useParams();
  const [sp] = useSearchParams();
  const meId = user!.id;
  const isAdmin = hasMinRole(user?.role, 'ADMIN');

  const segments = (params['*'] ?? '').split('/').filter(Boolean);
  const channelId = segments[0] ?? null;
  const threadId = segments[1] === 'thread' ? (segments[2] ?? null) : null;
  const highlightId = sp.get('message');

  const channelsQ = useChannels();
  const people = usePeople();
  const messagesQ = useMessages(channelId);
  const channel = useMemo(() => channelsQ.data?.find((c) => c.id === channelId) ?? null, [channelsQ.data, channelId]);
  usePageTitle(channel ? `${channelLabel(channel)} · ${t('chat.title')}` : t('chat.title'));

  const [pane, setPane] = useState<Pane>(threadId ? { kind: 'thread', id: threadId } : null);
  const [mobileNav, setMobileNav] = useState(!channelId);
  const [dialog, setDialog] = useState<'channel' | 'dm' | 'members' | 'rename' | null>(null);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const typingTimer = useRef(0);

  useEffect(() => setPane(threadId ? { kind: 'thread', id: threadId } : (p) => (p?.kind === 'thread' ? null : p)), [threadId]);
  useEffect(() => {
    setMobileNav(!channelId);
    setTyping({});
  }, [channelId]);

  // Presence (optional endpoint from the team module).
  const presence = useQuery({
    queryKey: ['workspace', 'presence'],
    queryFn: async () => (await api.get<{ online?: string[]; users?: { id: string; online?: boolean }[]; people?: { id: string; online?: boolean }[] }>('/workspace/presence')).data,
    retry: false,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const online = useMemo(() => {
    const d = presence.data;
    if (!d) return undefined;
    if (Array.isArray(d.online)) return new Set(d.online);
    const rows = d.people ?? d.users;
    if (Array.isArray(rows)) return new Set(rows.filter((u) => u.online).map((u) => u.id));
    return undefined;
  }, [presence.data]);

  const messages = useMemo(() => {
    const pages = messagesQ.data?.pages ?? [];
    const seen = new Set<string>();
    const out: Message[] = [];
    for (const p of pages) for (const m of p.messages) if (!seen.has(m.id)) (seen.add(m.id), out.push(m));
    return out.reverse();
  }, [messagesQ.data]);

  const open = useCallback(
    (c: Channel | string, opts: { thread?: string | null; message?: string | null } = {}) => {
      const id = typeof c === 'string' ? c : c.id;
      const q = opts.message ? `?message=${encodeURIComponent(opts.message)}` : '';
      navigate(`/workspace/chat/${id}${opts.thread ? `/thread/${opts.thread}` : ''}${q}`);
    },
    [navigate],
  );

  // First visit: land in #general.
  useEffect(() => {
    if (!channelId && channelsQ.data?.length && window.innerWidth >= 1024) {
      const general = channelsQ.data.find((c) => c.kind === 'PUBLIC' && c.name === 'general') ?? channelsQ.data.find((c) => c.isMember);
      if (general) navigate(`/workspace/chat/${general.id}`, { replace: true });
    }
  }, [channelId, channelsQ.data, navigate]);

  // ─── Read marker ───
  const markRead = useCallback(
    (id: string) => {
      void chatApi
        .read(id)
        .then(() => {
          qc.setQueryData<Channel[]>(chatKeys.channels, (old) => old?.map((c) => (c.id === id ? { ...c, unread: 0, mentions: 0, lastReadAt: new Date().toISOString() } : c)));
          void qc.invalidateQueries({ queryKey: chatKeys.summary });
        })
        .catch(() => undefined);
    },
    [qc],
  );
  useEffect(() => {
    if (channel?.isMember && (channel.unread > 0 || channel.mentions > 0)) markRead(channel.id);
  }, [channel?.id, channel?.isMember, channel?.unread, channel?.mentions, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Realtime ───
  useRealtime('chat.message', (p: RealtimePayload) => {
    const action = p.action as string;
    const cid = p.channelId as string;
    if (action === 'deleted') {
      cacheRemoveMessage(qc, cid, p.messageId as string, (p.parentId as string | null) ?? null);
      refreshChannels(qc);
      return;
    }
    const m = p.message as Message;
    if (!m) return;
    const mine = m.authorId === meId;
    cacheUpsertMessage(qc, { ...m, canEdit: mine, canDelete: mine || isAdmin });
    if (action === 'created' && m.parentId) cacheBumpReplyCount(qc, cid, m.parentId, m.createdAt);
    if (action === 'created' && !mine) {
      const active = cid === channelId && document.visibilityState === 'visible';
      if (active) markRead(cid);
      else {
        refreshChannels(qc);
        const c = qc.getQueryData<Channel[]>(chatKeys.channels)?.find((x) => x.id === cid);
        if (m.mentions.includes(meId)) toast(t('chat.toasts.mention', { name: fullName(m.author), channel: c?.name ?? '' }), { action: { label: t('chat.actions.open'), onClick: () => open(cid, { message: m.id }) } });
        else if (c?.kind === 'DM' && !c.muted) toast(t('chat.toasts.dm', { name: fullName(m.author), text: m.body.slice(0, 80) }), { action: { label: t('chat.actions.open'), onClick: () => open(cid) } });
      }
      setTyping((x) => {
        if (!m.authorId || !x[m.authorId]) return x;
        const { [m.authorId]: _gone, ...rest } = x;
        return rest;
      });
    } else refreshChannels(qc);
  });
  useRealtime('chat.reaction', (p: RealtimePayload) => {
    const reactions = groupReactions((p.reactions as { emoji: string; userId: string }[]) ?? [], meId);
    cachePatchMessage(qc, p.channelId as string, p.messageId as string, (p.parentId as string | null) ?? null, (m) => ({ ...m, reactions }));
  });
  useRealtime('chat.read', (p: RealtimePayload) => {
    if (p.userId === meId) refreshChannels(qc);
  });
  useRealtime('chat.typing', (p: RealtimePayload) => {
    if (p.channelId !== channelId || p.userId === meId) return;
    setTyping((x) => ({ ...x, [p.userId as string]: { name: p.name as string, until: Date.now() + 4000 } }));
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => setTyping((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v.until > Date.now()))), 4100);
  });
  useRealtime('chat.channel', () => refreshChannels(qc));
  useRealtime('presence.updated', () => void qc.invalidateQueries({ queryKey: ['workspace', 'presence'] }));
  const typingNames = useMemo(() => Object.values(typing).filter((v) => v.until > Date.now()).map((v) => v.name.split(' ')[0]), [typing]);

  // ─── Keyboard: Alt+↑/↓ switch channel, Esc closes the pane ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pane) {
        setPane(null);
        if (threadId) open(channelId!);
        return;
      }
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const list = (channelsQ.data ?? []).filter((c) => c.isMember && !c.archivedAt);
      if (!list.length) return;
      e.preventDefault();
      const idx = list.findIndex((c) => c.id === channelId);
      const next = list[(idx + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
      open(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channelsQ.data, channelId, open, pane, threadId]);

  // ─── Actions ───
  const send = async (p: SendPayload, parentId: string | null) => {
    if (!channel) return;
    const tempId = `tmp-${Date.now()}`;
    const temp: Message = {
      id: tempId,
      channelId: channel.id,
      authorId: meId,
      author: { id: meId, firstName: user!.firstName, lastName: user!.lastName },
      body: p.body,
      parentId,
      replyCount: 0,
      lastReplyAt: null,
      mentions: p.mentions,
      editedAt: null,
      deletedAt: null,
      pinnedAt: null,
      createdAt: new Date().toISOString(),
      attachments: [],
      reactions: [],
      canEdit: false,
      canDelete: false,
      pending: true,
    };
    if (!parentId) cacheUpsertMessage(qc, temp);
    try {
      const saved = await chatApi.send(channel.id, { body: p.body, parentId, attachmentIds: p.attachmentIds, mentions: p.mentions });
      if (!parentId) cacheRemoveMessage(qc, channel.id, tempId, null);
      cacheUpsertMessage(qc, saved);
      if (parentId) cacheBumpReplyCount(qc, channel.id, parentId, saved.createdAt);
      refreshChannels(qc);
    } catch (err) {
      if (!parentId) cachePatchMessage(qc, channel.id, tempId, null, (m) => ({ ...m, pending: false, failed: true }));
      throw err;
    }
  };

  const actions: MessageActions = {
    react: (m, emoji) => {
      // optimistic toggle
      cachePatchMessage(qc, m.channelId, m.id, m.parentId, (x) => {
        const cur = x.reactions.find((r) => r.emoji === emoji);
        const reactions = cur
          ? x.reactions.map((r) => (r.emoji === emoji ? { ...r, me: !r.me, count: r.count + (r.me ? -1 : 1) } : r)).filter((r) => r.count > 0)
          : [...x.reactions, { emoji, count: 1, me: true, userIds: [meId] }];
        return { ...x, reactions };
      });
      chatApi.react(m.id, emoji).then((r) => cachePatchMessage(qc, m.channelId, m.id, m.parentId, (x) => ({ ...x, reactions: r.reactions }))).catch((err) => toast.error(errorText(err)));
    },
    reply: (m) => open(m.channelId, { thread: m.parentId ?? m.id }),
    edit: async (m, body) => {
      try {
        const saved = await chatApi.edit(m.id, body);
        cacheUpsertMessage(qc, saved);
      } catch (err) {
        toast.error(errorText(err));
        throw err;
      }
    },
    remove: (m) => {
      // TODO(ui): ConfirmDialog
      if (!window.confirm(t('chat.actions.confirmDelete'))) return;
      chatApi
        .remove(m.id)
        .then(() => {
          cacheRemoveMessage(qc, m.channelId, m.id, m.parentId);
          toast.success(t('chat.toasts.deleted'));
          if (threadId === m.id) open(m.channelId);
        })
        .catch((err) => toast.error(errorText(err)));
    },
    pin: (m) => {
      chatApi
        .pin(m.id, !m.pinnedAt)
        .then((saved) => {
          cacheUpsertMessage(qc, saved);
          void qc.invalidateQueries({ queryKey: chatKeys.pinned(m.channelId) });
        })
        .catch((err) => toast.error(errorText(err)));
    },
    copyLink: (m) => {
      void navigator.clipboard?.writeText(messageLink(m.channelId, m.id)).then(() => toast.success(t('chat.toasts.copied')));
    },
  };

  const updateChannelCache = (c: Channel) => {
    qc.setQueryData<Channel[]>(chatKeys.channels, (old) => (old ? (old.some((x) => x.id === c.id) ? old.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : [c, ...old]) : [c]));
    void qc.invalidateQueries({ queryKey: chatKeys.channels });
  };
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    fn()
      .then(() => ok && toast.success(ok))
      .catch((err) => toast.error(errorText(err)));

  const join = () => channel && run(async () => updateChannelCache(await chatApi.join(channel.id)), t('chat.toasts.joined'));
  const leave = () => {
    // TODO(ui): ConfirmDialog
    if (!channel || !window.confirm(t('chat.actions.confirmLeave', { name: channel.name }))) return;
    void run(async () => {
      await chatApi.leave(channel.id);
      refreshChannels(qc);
      navigate('/workspace/chat');
    }, t('chat.toasts.left'));
  };
  const archive = () => {
    // TODO(ui): ConfirmDialog
    if (!channel || !window.confirm(t('chat.actions.confirmArchive', { name: channel.name }))) return;
    void run(async () => updateChannelCache(await chatApi.archive(channel.id)), t('chat.toasts.archived'));
  };
  const mute = () => channel && run(async () => updateChannelCache({ ...channel, muted: (await chatApi.mute(channel.id, !channel.muted)).muted }));
  const canManage = !!channel && (isAdmin || channel.myRole === 'OWNER');

  const jumpTo = (m: Message) => {
    setPane(null);
    open(m.channelId, { message: m.parentId ? undefined : m.id, thread: m.parentId ?? undefined });
  };

  // ─── Render ───
  const sidebar = (
    <Sidebar
      channels={channelsQ.data ?? []}
      activeId={channelId}
      meId={meId}
      presence={online}
      onSelect={(c) => {
        open(c);
        setMobileNav(false);
      }}
      onNewChannel={() => setDialog('channel')}
      onNewDm={() => setDialog('dm')}
    />
  );
  const rightPane =
    pane && channel ? (
      <aside className="flex w-full shrink-0 flex-col border-l border-line bg-card lg:w-96">
        {pane.kind === 'thread' && (
          <ThreadPane
            rootId={pane.id}
            channel={channel}
            people={people.data ?? []}
            meId={meId}
            actions={actions}
            onSend={(p) => send(p, pane.id)}
            onTyping={() => void chatApi.typing(channel.id)}
            onClose={() => open(channel)}
          />
        )}
        {pane.kind === 'details' && (
          <ChannelDetails
            channel={channel}
            meId={meId}
            canManage={canManage}
            initialTab={pane.tab}
            onClose={() => setPane(null)}
            onAddMembers={() => setDialog('members')}
            onRemoveMember={(id) => void run(async () => updateChannelCache(await chatApi.members(channel.id, { remove: [id] })))}
            onRename={() => setDialog('rename')}
            onLeave={leave}
            onArchive={archive}
            onMute={() => void mute()}
            onJump={jumpTo}
          />
        )}
        {pane.kind === 'search' && <SearchPanel channel={channel} onClose={() => setPane(null)} onJump={jumpTo} />}
      </aside>
    ) : null;

  const HeaderButton = ({ icon: Icon, label, active, onClick }: { icon: typeof Info; label: string; active?: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={clsx('grid size-8 place-items-center rounded-lg', active ? 'bg-brand-50 text-brand-600' : 'text-muted hover:bg-surface hover:text-ink')}>
      <Icon className="size-4" />
    </button>
  );

  return (
    <div className="flex h-full min-h-0 bg-page text-ink">
      {/* Sidebar: fixed column on desktop, drawer on phones */}
      <aside className="hidden w-72 shrink-0 border-r border-line bg-card lg:block">{sidebar}</aside>
      {mobileNav && (
        <div className="absolute inset-0 z-30 bg-card lg:hidden">{sidebar}</div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        {channel ? (
          <>
            <header className="flex items-center gap-2 border-b border-line bg-card px-3 py-2">
              <button type="button" onClick={() => setMobileNav(true)} className="grid size-8 place-items-center rounded-lg text-muted lg:hidden" aria-label={t('workspace.menu')}>
                <Menu className="size-4" />
              </button>
              {channel.kind === 'DM' ? <Avatar person={channel.peer} size="md" /> : <span className="grid size-8 place-items-center rounded-lg bg-surface text-muted">{channel.kind === 'PRIVATE' ? <Lock className="size-4" /> : <Hash className="size-4" />}</span>}
              <button type="button" onClick={() => setPane((p) => (p?.kind === 'details' ? null : { kind: 'details' }))} className="min-w-0 text-left leading-tight">
                <span className="block truncate font-display text-sm font-bold text-ink">{channel.kind === 'DM' ? channel.name : `#${channel.name}`}</span>
                <span className="block truncate text-xs text-muted">
                  {channel.kind !== 'DM' && t('chat.header.members', { count: channel.memberCount })}
                  {channel.topic && ` · ${channel.topic}`}
                </span>
              </button>
              <div className="ml-auto flex items-center gap-0.5">
                {channel.isMember && channel.kind !== 'DM' && <HeaderButton icon={UserPlus} label={t('chat.actions.addMembers')} onClick={() => setDialog('members')} />}
                <HeaderButton icon={Pin} label={t('chat.header.pinned')} active={pane?.kind === 'details' && pane.tab === 'pinned'} onClick={() => setPane({ kind: 'details', tab: 'pinned' })} />
                <HeaderButton icon={Search} label={t('chat.header.search')} active={pane?.kind === 'search'} onClick={() => setPane((p) => (p?.kind === 'search' ? null : { kind: 'search' }))} />
                <HeaderButton icon={Info} label={t('chat.header.details')} active={pane?.kind === 'details' && pane.tab !== 'pinned'} onClick={() => setPane((p) => (p?.kind === 'details' ? null : { kind: 'details' }))} />
              </div>
            </header>
            <div className="flex min-h-0 flex-1">
              <div className={clsx('flex min-w-0 flex-1 flex-col', pane && 'hidden lg:flex')}>
                {messagesQ.isLoading ? (
                  <div className="grid flex-1 place-items-center">
                    <Spinner />
                  </div>
                ) : (
                  <MessageList
                    messages={messages}
                    people={people.data ?? []}
                    meId={meId}
                    hasMore={!!messagesQ.hasNextPage}
                    loadingMore={messagesQ.isFetchingNextPage}
                    onLoadMore={() => void messagesQ.fetchNextPage()}
                    lastReadAt={channel.lastReadAt}
                    typing={typingNames}
                    actions={actions}
                    onOpenThread={(m) => open(channel, { thread: m.id })}
                    highlightId={highlightId}
                    intro={
                      <div className="px-4 pt-8 pb-2">
                        <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">{channel.kind === 'DM' ? <MessagesSquare className="size-6" /> : <Hash className="size-6" />}</span>
                        <h2 className="mt-3 font-display text-lg font-bold text-ink">{channel.kind === 'DM' ? t('chat.empty.dmStart', { name: channel.name }) : t('chat.empty.channelStart', { name: channel.name })}</h2>
                        {channel.topic && <p className="text-sm text-muted">{channel.topic}</p>}
                      </div>
                    }
                  />
                )}
                {channel.archivedAt ? (
                  <p className="border-t border-line px-4 py-3 text-center text-sm text-muted">{t('chat.header.archived')}</p>
                ) : channel.isMember ? (
                  <Composer
                    people={people.data ?? []}
                    placeholder={channel.kind === 'DM' ? t('chat.composer.placeholderDm', { name: channel.name }) : t('chat.composer.placeholder', { name: channel.name })}
                    onSend={(p) => send(p, null)}
                    onTyping={() => void chatApi.typing(channel.id)}
                    channelKey={channel.id}
                    autoFocus
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-3 border-t border-line px-4 py-3 text-sm text-muted">
                    {t('chat.header.preview')}
                    <button type="button" onClick={() => void join()} className="btn-primary btn-sm">
                      {t('chat.header.join')}
                    </button>
                  </div>
                )}
              </div>
              {rightPane}
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center">
            {channelsQ.isLoading ? (
              <Spinner />
            ) : (
              <div>
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                  <MessagesSquare className="size-7" />
                </span>
                <h2 className="mt-4 font-display text-lg font-bold text-ink">{t('chat.empty.noChannel')}</h2>
                <p className="mt-1 text-sm text-muted">{t('chat.empty.noChannelHint')}</p>
                <button type="button" onClick={() => setMobileNav(true)} className="btn-primary btn-sm mt-4 lg:hidden">
                  {t('chat.sidebar.channels')}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <NewChannelDialog open={dialog === 'channel'} onClose={() => setDialog(null)} people={(people.data ?? []).filter((p) => p.id !== meId)} onCreated={(c) => (updateChannelCache(c), open(c))} />
      <NewDmDialog open={dialog === 'dm'} onClose={() => setDialog(null)} people={people.data ?? []} onPicked={(c) => (updateChannelCache(c), open(c))} />
      <RenameChannelDialog open={dialog === 'rename'} onClose={() => setDialog(null)} channel={channel} onSaved={updateChannelCache} />
      <AddMembersDialog
        open={dialog === 'members'}
        onClose={() => setDialog(null)}
        people={people.data ?? []}
        exclude={channel?.members.map((m) => m.id) ?? []}
        onAdd={async (ids) => {
          if (!channel) return;
          await run(async () => updateChannelCache(await chatApi.members(channel.id, { add: ids })));
        }}
      />
    </div>
  );
}
