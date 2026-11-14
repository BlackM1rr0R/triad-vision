import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CheckCheck, Clock, MessageSquareReply, Mic } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole, type CaseStatus } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesStaffMobile } from '@/i18n/pagesStaffMobile';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { Chip, PageHead } from '@/components/admin/ui';
import { fmtRelative, fullName, toastError } from '@/components/admin/labels';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { SwipeRow } from '@/components/staffMobile/SwipeRow';
import { ReplySheet } from '@/components/staffMobile/ReplySheet';

registerCopy(pagesStaffMobile);

// ─── API (server routes/admin/inbox.ts) ─────────────────────────────────

interface InboxItem {
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
interface InboxResponse {
  items: InboxItem[];
  counts: { awaiting: number; unread: number };
  scope: 'mine' | 'all';
}

/**
 * Messages (/admin/inbox, STAFF+): the client conversations of the viewer's open cases — waiting for the team's
 * answer first (oldest wait on top), then recent threads. Designed for the phone tab bar: swipe right = reply sheet,
 * swipe left = mark read, tap = the case's communication tab; the same actions are buttons in every row.
 */
export default function AdminInbox() {
  const { t } = useTranslation();
  usePageTitle(t('smob.inbox.title'));
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [filter, setFilter] = useState<'all' | 'awaiting'>('all');
  const [replyTo, setReplyTo] = useState<InboxItem | null>(null);

  const key = ['admin-inbox', scope, filter] as const;
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<InboxResponse>('/admin/inbox', { params: { scope, filter } })).data,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (caseId: string) => api.post(`/admin/cases/${caseId}/messages/read`),
    onMutate: (caseId) => {
      const prev = qc.getQueryData<InboxResponse>(key);
      if (prev) {
        const row = prev.items.find((i) => i.caseId === caseId);
        qc.setQueryData<InboxResponse>(key, {
          ...prev,
          counts: { ...prev.counts, unread: Math.max(0, prev.counts.unread - (row?.unread ?? 0)) },
          items: prev.items.map((i) => (i.caseId === caseId ? { ...i, unread: 0 } : i)),
        });
      }
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toastError(err);
    },
    onSuccess: () => toast.success(t('smob.inbox.markedRead')),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['admin-inbox'] }),
  });

  const open = (i: InboxItem) => {
    if (i.unread) markRead.mutate(i.caseId);
    navigate(`/admin/cases/${i.caseId}?tab=communication`);
  };

  const items = data?.items ?? [];
  const awaiting = items.filter((i) => i.awaitingReply);
  const recent = items.filter((i) => !i.awaitingReply);

  const row = (i: InboxItem) => (
    <li key={i.caseId}>
      <SwipeRow
        right={{ label: t('smob.inbox.reply'), icon: MessageSquareReply, tone: 'primary', onTrigger: () => setReplyTo(i) }}
        left={i.unread ? { label: t('smob.inbox.markRead'), icon: CheckCheck, tone: 'success', onTrigger: () => markRead.mutate(i.caseId) } : undefined}
      >
        <div className={clsx('rounded-xl border bg-card p-3', i.awaitingReply ? 'border-warning-border' : 'border-line')}>
          <button type="button" onClick={() => open(i)} className="flex w-full min-w-0 items-start gap-3 text-left">
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
              <span className={clsx('mt-1 line-clamp-2 block text-sm break-words', i.unread ? 'text-ink' : 'text-muted')}>
                {!i.lastMessage.fromClient && <span className="font-medium">{t('smob.inbox.you')}</span>}
                {i.lastMessage.excerpt ||
                  (i.lastMessage.voice ? (
                    <span className="inline-flex items-center gap-1">
                      <Mic className="size-3.5" aria-hidden /> {t('smob.inbox.voice')}
                    </span>
                  ) : null)}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                {i.awaitingReply && i.since && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-1.5 py-0.5 font-medium text-warning-fg">
                    <Clock className="size-3" aria-hidden /> {t('smob.inbox.waitingFor', { count: i.waitingCount, when: fmtRelative(i.since) })}
                  </span>
                )}
                {i.unread > 0 && <span className="rounded-full bg-danger px-1.5 py-0.5 font-semibold text-white">{t('smob.inbox.unread', { count: i.unread })}</span>}
                {scope === 'all' && i.assignedStaff && <span className="text-muted">{fullName(i.assignedStaff)}</span>}
              </span>
            </span>
          </button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary min-h-11 justify-center" disabled={!i.unread} onClick={() => markRead.mutate(i.caseId)}>
              <CheckCheck className="size-4" aria-hidden /> {t('smob.inbox.markRead')}
            </button>
            <button type="button" className="btn-primary min-h-11 justify-center" onClick={() => setReplyTo(i)}>
              <MessageSquareReply className="size-4" aria-hidden /> {t('smob.inbox.reply')}
            </button>
          </div>
        </div>
      </SwipeRow>
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title={t('smob.inbox.title')} subtitle={t('smob.inbox.subtitle')} />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          {t('smob.inbox.filterAll')}
        </Chip>
        <Chip active={filter === 'awaiting'} onClick={() => setFilter('awaiting')}>
          {t('smob.inbox.filterAwaiting')} {data ? `(${data.counts.awaiting})` : ''}
        </Chip>
        {isAdmin && (
          <>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
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
      <p className="mb-3 text-[11px] text-muted md:hidden">{t('smob.swipe.hint')}</p>

      {isLoading ? (
        <div className="grid place-items-center py-16 text-muted">
          <Spinner className="size-6" />
        </div>
      ) : error ? (
        <div className="py-12 text-center text-sm">
          <p className="text-danger-fg">{t('admin.common.loadFailed')}</p>
          <button type="button" className="btn-secondary mt-3 min-h-11" onClick={() => refetch()}>
            {t('admin.common.retry')}
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">{filter === 'awaiting' ? t('smob.inbox.empty') : t('smob.inbox.emptyAll')}</p>
      ) : (
        <div className="space-y-6">
          {awaiting.length > 0 && (
            <section aria-labelledby="inbox-awaiting">
              <h2 id="inbox-awaiting" className="type-overline mb-2">
                {t('smob.inbox.awaiting')} · {awaiting.length}
              </h2>
              <ul className="space-y-2.5">{awaiting.map(row)}</ul>
            </section>
          )}
          {recent.length > 0 && (
            <section aria-labelledby="inbox-recent">
              <h2 id="inbox-recent" className="type-overline mb-2">
                {t('smob.inbox.recent')}
              </h2>
              <ul className="space-y-2.5">{recent.map(row)}</ul>
            </section>
          )}
        </div>
      )}

      <ReplySheet open={!!replyTo} onClose={() => setReplyTo(null)} caseId={replyTo?.caseId ?? null} number={replyTo?.number} clientName={replyTo ? fullName(replyTo.client) : undefined} />
    </div>
  );
}
