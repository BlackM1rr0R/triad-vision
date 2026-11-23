import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Clock, MessagesSquare, Mic, Search, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRealtime } from '@/lib/realtime';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesStaffMobile } from '@/i18n/pagesStaffMobile';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { Chip } from '@/components/admin/ui';
import { fmtRelative, fullName } from '@/components/admin/labels';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { caseKey, type CaseDetailResponse } from '@/components/admin/case/shared';
import { Messages, type MessagesCase } from '@/components/admin/case/Communication';
import { InboxProfile } from './InboxProfile';
import { WIDE_QUERY, useMedia } from './useMedia';
import type { InboxFilter, InboxItem, InboxResponse } from './types';

registerCopy(pagesStaffMobile);

/** Message list height inside the split view (the page header and the filters sit above). */
const THREAD_LIST_CLASS = 'h-[calc(100dvh-24rem)] min-h-56 max-h-none';

/**
 * Desktop "Mesajlar" (from 1024 px): conversations per client on the left (search, awaiting / unread filters),
 * the open thread with the reply composer in the middle (the case page's own messages panel: realtime, voice,
 * canned replies, translation) and the client / case profile on the right. The open conversation lives in the
 * URL (?case=<id>), which is also where staff notifications about a client message point.
 */
export const InboxSplit = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const wide = useMedia(WIDE_QUERY);
  const [params, setParams] = useSearchParams();
  const selected = params.get('case');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [mid, setMid] = useState<'thread' | 'profile'>('thread');

  useEffect(() => {
    const id = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-inbox', 'split', scope, filter, q] as const,
    queryFn: async () => (await api.get<InboxResponse>('/admin/inbox', { params: { scope, filter, ...(q ? { q } : {}) } })).data,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const items = data?.items ?? [];
  const item = items.find((i) => i.caseId === selected) ?? null;

  // Realtime: a new / read message anywhere refreshes the list and the nav badge (the open thread updates itself).
  const refreshTimer = useRef(0);
  const refreshLists = () => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      void qc.invalidateQueries({ queryKey: ['admin-inbox'] });
      void qc.invalidateQueries({ queryKey: ['my-work'] });
    }, 800);
  };
  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);
  useRealtime('message.new', refreshLists);
  useRealtime('message.read', refreshLists);

  // Opening a conversation marks the client's messages read (explicit POST, the same endpoint as the case page).
  const markRead = useMutation({
    mutationFn: (caseId: string) => api.post(`/admin/cases/${caseId}/messages/read`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['admin-inbox'] });
      void qc.invalidateQueries({ queryKey: ['my-work'] });
    },
  });
  const marked = useRef(new Set<string>());
  const unread = item?.unread ?? 0;
  useEffect(() => {
    if (selected && unread > 0 && !marked.current.has(selected) && !markRead.isPending) {
      marked.current.add(selected);
      markRead.mutate(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, unread]);

  const select = (id: string) => {
    setMid('thread');
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('case', id);
        return n;
      },
      { replace: true },
    );
  };

  // The thread needs only the case id (messages come from the thread query); the language and employer link
  // arrive with the profile (same query the profile panel uses).
  const profile = useQuery({ queryKey: caseKey(selected ?? ''), queryFn: async () => (await api.get<CaseDetailResponse>(`/admin/cases/${selected}`)).data, enabled: !!selected, retry: false });
  const detailCase = profile.data?.case;
  const threadCase = useMemo<MessagesCase | null>(
    () => (selected ? { id: selected, messages: [], client: { locale: detailCase?.client.locale ?? 'az' }, companyId: (detailCase as { companyId?: string | null } | undefined)?.companyId } : null),
    [selected, detailCase],
  );
  const headClient = detailCase?.client ?? item?.client ?? null;
  const headNumber = detailCase?.number ?? item?.number;
  const headStatus = detailCase?.status ?? item?.status;

  const awaiting = data?.counts.awaiting;
  const unreadCount = data?.counts.unread;

  const row = (i: InboxItem) => (
    <li key={i.caseId}>
      <button
        type="button"
        onClick={() => select(i.caseId)}
        aria-current={i.caseId === selected ? 'true' : undefined}
        className={clsx(
          'flex w-full min-w-0 items-start gap-3 border-b border-line px-3 py-3 text-left transition-colors hover:bg-sunken',
          i.caseId === selected && 'bg-sunken',
          i.awaitingReply && 'border-l-2 border-l-warning',
        )}
      >
        <Avatar name={fullName(i.client)} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={clsx('truncate text-sm text-ink', i.unread ? 'font-bold' : 'font-semibold')}>{fullName(i.client)}</span>
            <time className="shrink-0 text-[11px] text-muted" dateTime={i.lastMessage.at}>
              {fmtRelative(i.lastMessage.at)}
            </time>
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span className="code-id">{i.number}</span>
            <StatusBadge status={i.status} />
          </span>
          <span className="mt-1 flex items-start justify-between gap-2">
            <span className={clsx('line-clamp-2 min-w-0 text-sm break-words', i.unread ? 'text-ink' : 'text-muted')}>
              {!i.lastMessage.fromClient && <span className="font-medium">{t('smob.inbox.you')}</span>}
              {i.lastMessage.excerpt ||
                (i.lastMessage.voice ? (
                  <span className="inline-flex items-center gap-1">
                    <Mic className="size-3.5" aria-hidden /> {t('smob.inbox.voice')}
                  </span>
                ) : null)}
            </span>
            {i.unread > 0 && (
              <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-danger px-1.5 text-[11px] leading-[18px] font-semibold text-white tabular-nums" title={t('smob.inbox.unread', { count: i.unread })}>
                {i.unread > 99 ? '99+' : i.unread}
              </span>
            )}
          </span>
          {i.awaitingReply && i.since && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-warning-bg px-1.5 py-0.5 text-[11px] font-medium text-warning-fg">
              <Clock className="size-3" aria-hidden /> {t('smob.inbox.waitingFor', { count: i.waitingCount, when: fmtRelative(i.since) })}
            </span>
          )}
          {scope === 'all' && i.assignedStaff && <span className="mt-1 block text-[11px] text-muted">{fullName(i.assignedStaff)}</span>}
        </span>
      </button>
    </li>
  );

  const showThread = wide || mid === 'thread';
  const showProfile = wide || mid === 'profile';

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[34rem] overflow-hidden rounded-xl border border-line bg-card">
      {/* ── Conversations ── */}
      <section className="flex w-80 shrink-0 flex-col border-r border-line xl:w-96" aria-label={t('smob.inbox.list')}>
        <div className="space-y-2 border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              className="input pl-9"
              value={search}
              maxLength={80}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('smob.inbox.search')}
              aria-label={t('smob.inbox.search')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
              {t('smob.inbox.filterAll')}
            </Chip>
            <Chip active={filter === 'awaiting'} onClick={() => setFilter('awaiting')}>
              {t('smob.inbox.filterAwaiting')} {awaiting !== undefined ? `(${awaiting})` : ''}
            </Chip>
            <Chip active={filter === 'unread'} onClick={() => setFilter('unread')}>
              {t('smob.inbox.filterUnread')} {unreadCount !== undefined ? `(${unreadCount})` : ''}
            </Chip>
            {isAdmin && (
              <>
                <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
                <Chip active={scope === 'mine'} onClick={() => setScope('mine')}>
                  {t('smob.inbox.scopeMine')}
                </Chip>
                <Chip active={scope === 'all'} onClick={() => setScope('all')}>
                  {t('smob.inbox.scopeAll')}
                </Chip>
              </>
            )}
            {isFetching && !isLoading && <Spinner className="ml-1 size-3.5 text-link" />}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="grid place-items-center py-16 text-muted">
              <Spinner className="size-6" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm">
              <p className="text-danger-fg">{t('admin.common.loadFailed')}</p>
              <button type="button" className="btn-secondary mt-3" onClick={() => refetch()}>
                {t('admin.common.retry')}
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-muted">{q ? t('smob.inbox.noResults') : filter === 'all' ? t('smob.inbox.emptyAll') : t('smob.inbox.empty')}</p>
          ) : (
            <ul>{items.map(row)}</ul>
          )}
        </div>
      </section>

      {/* ── Thread + profile ── */}
      {!selected || !threadCase ? (
        <div className="grid min-w-0 flex-1 place-items-center p-8 text-center">
          <div>
            <MessagesSquare className="mx-auto size-10 text-muted" aria-hidden />
            <p className="mt-3 font-semibold text-ink">{t('smob.inbox.pick')}</p>
            <p className="mt-1 max-w-xs text-sm text-muted">{t('smob.inbox.pickHint')}</p>
          </div>
        </div>
      ) : (
        <>
          <section className={clsx('min-w-0 flex-1 flex-col', showThread ? 'flex' : 'hidden', wide && 'border-r border-line')} aria-label={t('smob.reply.title')}>
            <header className="flex items-center gap-3 border-b border-line px-4 py-3">
              {headClient && <Avatar name={fullName(headClient)} size="sm" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{headClient ? fullName(headClient) : '…'}</p>
                <p className="flex items-center gap-2 text-xs text-muted">
                  {headNumber && <span className="code-id">{headNumber}</span>}
                  {headStatus && <StatusBadge status={headStatus} />}
                </p>
              </div>
              {!wide && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setMid('profile')}>
                  <UserRound className="size-3.5" aria-hidden /> {t('smob.inbox.profile')}
                </button>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Messages key={selected} c={threadCase} listClassName={THREAD_LIST_CLASS} />
            </div>
          </section>
          <aside className={clsx('w-full shrink-0 overflow-y-auto bg-card xl:w-80', showProfile ? 'block' : 'hidden', !wide && 'flex-1')} aria-label={t('smob.inbox.profile')}>
            {!wide && (
              <div className="border-b border-line px-4 py-2">
                <button type="button" className="text-xs font-semibold text-link hover:underline" onClick={() => setMid('thread')}>
                  ← {t('smob.reply.title')}
                </button>
              </div>
            )}
            <InboxProfile key={selected} caseId={selected} item={item} />
          </aside>
        </>
      )}
    </div>
  );
};
