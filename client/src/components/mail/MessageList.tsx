import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Archive, CheckSquare, Clock, Flag, Inbox, Mail, MailOpen, MessagesSquare, Paperclip, Search, SlidersHorizontal, Square, Tag, Trash2, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { AiFilterChips, TriageRowChips } from '@/components/aiMail/TriageChips';
import type { AiFilter } from '@/components/aiMail/api';
import type { MessageRow, View } from './types';
import { avatarTone, displayName, fmtListDate, initialsOf, subjectOf } from './utils';
import { EmptyState } from '@/components/ui/EmptyState';

export interface ListFilters {
  q: string;
  from: string;
  to: string;
  unread: boolean;
  hasAttachments: boolean;
}

export const EMPTY_LIST_FILTERS: ListFilters = { q: '', from: '', to: '', unread: false, hasAttachments: false };

const IconBtn = ({ onClick, label, children, active, danger }: { onClick: () => void; label: string; children: ReactNode; active?: boolean; danger?: boolean }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label} className={clsx('grid size-8 place-items-center rounded-lg transition', active ? 'bg-primary/10 text-link' : 'text-muted hover:bg-sunken hover:text-ink', danger && 'hover:text-danger-fg')}>
    {children}
  </button>
);

export const MessageList = ({
  items,
  view,
  loading,
  error,
  hasMore,
  fetchingMore,
  onLoadMore,
  onRetry,
  activeId,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  filters,
  onFilters,
  threads,
  onThreads,
  bulk,
  myEmails,
  searchRef,
  title,
  aiFilter = null,
  onAiFilter,
}: {
  items: MessageRow[];
  view: View | null;
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  fetchingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  activeId: string | null;
  selected: Set<string>;
  onToggle: (id: string, shift?: boolean) => void;
  onToggleAll: () => void;
  onOpen: (m: MessageRow) => void;
  filters: ListFilters;
  onFilters: (f: ListFilters) => void;
  threads: boolean;
  onThreads: (on: boolean) => void;
  bulk: (action: 'read' | 'unread' | 'archive' | 'trash' | 'flag' | 'label' | 'snooze' | 'clear') => void;
  myEmails: Set<string>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  title: string;
  /** AI triage filter chips (shown when onAiFilter is given) */
  aiFilter?: AiFilter | null;
  onAiFilter?: (f: AiFilter | null) => void;
}) => {
  const { t } = useTranslation();
  const [q, setQ] = useState(filters.q);
  const [more, setMore] = useState(!!(filters.from || filters.to));
  const sentinel = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQ(filters.q), [filters.q]);
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (q !== filters.q) onFilters({ ...filters, q });
    }, 350);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !fetchingMore) onLoadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, fetchingMore, onLoadMore, items.length]);

  // Keep the active row in view when navigating with j/k.
  useEffect(() => {
    if (!activeId) return;
    listRef.current?.querySelector<HTMLElement>(`[data-id="${activeId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const allSelected = items.length > 0 && items.every((m) => selected.has(m.id));
  const isSent = view === 'sent' || view === 'drafts';
  const searching = !!(filters.q || filters.from || filters.to || filters.unread || filters.hasAttachments || aiFilter);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="shrink-0 border-b border-line px-3 pt-3 pb-2">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{title}</h2>
          <button type="button" onClick={() => onThreads(!threads)} className={clsx('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold', threads ? 'bg-primary/10 text-link' : 'text-muted hover:bg-sunken')} title={t('mail.list.threadsOn')} aria-pressed={threads}>
            <MessagesSquare className="size-3.5" /> {t('mail.list.threads')}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mail.searchPlaceholder')} className="input py-1.5 pr-8 pl-8 text-sm" aria-label={t('mail.search')} />
            {q && (
              <button type="button" onClick={() => setQ('')} className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-ink" aria-label={t('mail.actions.close')}>
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <IconBtn onClick={() => setMore((m) => !m)} label={t('mail.list.filters.from')} active={more || !!filters.from || !!filters.to}>
            <SlidersHorizontal className="size-4" />
          </IconBtn>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => onFilters({ ...filters, unread: !filters.unread })} className={clsx('rounded-full border px-2 py-0.5 text-xs font-semibold', filters.unread ? 'border-primary bg-primary/[0.06] text-link' : 'border-line text-muted hover:text-ink')}>
            {t('mail.list.filters.unread')}
          </button>
          <button type="button" onClick={() => onFilters({ ...filters, hasAttachments: !filters.hasAttachments })} className={clsx('rounded-full border px-2 py-0.5 text-xs font-semibold', filters.hasAttachments ? 'border-primary bg-primary/[0.06] text-link' : 'border-line text-muted hover:text-ink')}>
            {t('mail.list.filters.attachments')}
          </button>
          {more && (
            <>
              <input value={filters.from} onChange={(e) => onFilters({ ...filters, from: e.target.value })} placeholder={t('mail.list.filters.from')} className="input min-w-0 flex-1 py-1 text-xs" />
              <input value={filters.to} onChange={(e) => onFilters({ ...filters, to: e.target.value })} placeholder={t('mail.list.filters.to')} className="input min-w-0 flex-1 py-1 text-xs" />
            </>
          )}
        </div>
        {onAiFilter && <AiFilterChips value={aiFilter} onChange={onAiFilter} />}
      </div>

      {selected.size > 0 ? (
        <div className="flex shrink-0 items-center gap-1 border-b border-line bg-primary/[0.06] px-2 py-1 text-xs">
          <IconBtn onClick={onToggleAll} label={t('mail.list.selectAll')}>
            {allSelected ? <CheckSquare className="size-4 text-link" /> : <Square className="size-4" />}
          </IconBtn>
          <span className="font-semibold text-link">{t('mail.list.selected', { count: selected.size })}</span>
          <span className="flex-1" />
          <IconBtn onClick={() => bulk('read')} label={t('mail.actions.markRead')}>
            <MailOpen className="size-4" />
          </IconBtn>
          <IconBtn onClick={() => bulk('unread')} label={t('mail.actions.markUnread')}>
            <Mail className="size-4" />
          </IconBtn>
          <IconBtn onClick={() => bulk('flag')} label={t('mail.actions.flag')}>
            <Flag className="size-4" />
          </IconBtn>
          <IconBtn onClick={() => bulk('label')} label={t('mail.actions.labels')}>
            <Tag className="size-4" />
          </IconBtn>
          <IconBtn onClick={() => bulk('snooze')} label={t('mail.actions.snooze')}>
            <Clock className="size-4" />
          </IconBtn>
          <IconBtn onClick={() => bulk('archive')} label={t('mail.actions.archive')}>
            <Archive className="size-4" />
          </IconBtn>
          <IconBtn onClick={() => bulk('trash')} label={t('mail.actions.delete')} danger>
            <Trash2 className="size-4" />
          </IconBtn>
          <IconBtn onClick={() => bulk('clear')} label={t('mail.list.clearSelection')}>
            <X className="size-4" />
          </IconBtn>
        </div>
      ) : (
        items.length > 0 && (
          <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-0.5 text-xs text-muted">
            <IconBtn onClick={onToggleAll} label={t('mail.list.selectAll')}>
              <Square className="size-4" />
            </IconBtn>
            <span>{t('mail.list.selectAll')}</span>
          </div>
        )
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label={title}>
        {loading && !items.length && (
          <div className="grid h-40 place-items-center text-link">
            <Spinner />
          </div>
        )}
        {error && !items.length && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-ink">{t('mail.error.load')}</p>
            <p className="mt-1 text-xs text-muted">{t('mail.error.body')}</p>
            <button type="button" onClick={onRetry} className="btn-primary btn-sm mt-4">
              {t('mail.retry')}
            </button>
          </div>
        )}
        {!loading && !error && !items.length && (
          <EmptyState
            tone="brand"
            icon={searching ? Search : Inbox}
            title={searching ? t('mail.empty.search') : view === 'snoozed' ? t('mail.empty.snoozed') : view === 'drafts' ? t('mail.empty.drafts') : t('mail.empty.folder')}
            text={searching ? t('mail.empty.searchBody') : undefined}
          />
        )}
        <ul>
          {items.map((m) => {
            const counterpart = isSent ? (m.to[0] ?? null) : m.from;
            const who = isSent ? (m.to.length ? `${t('mail.list.toPrefix')} ${m.to.map((a) => displayName(a)).join(', ')}` : t('mail.list.toPrefix')) : m.from && myEmails.has(m.from.address.toLowerCase()) ? t('mail.list.me') : displayName(m.from) || t('mail.list.unknownSender');
            const isSel = selected.has(m.id);
            const isActive = m.id === activeId;
            return (
              <li key={m.id} data-id={m.id} className={clsx('group relative border-b border-line/70', isActive ? 'bg-primary/[0.06]' : isSel ? 'bg-primary/[0.04]' : 'hover:bg-sunken')}>
                <div className={clsx('absolute inset-y-0 left-0 w-0.5', isActive ? 'bg-primary' : !m.seen ? 'bg-primary/40' : 'bg-transparent')} aria-hidden />
                <div className="flex items-start gap-2 px-2 py-2.5 pl-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(m.id, e.shiftKey);
                    }}
                    className={clsx('mt-1 grid size-7 shrink-0 place-items-center rounded-full text-[0.65rem] font-bold', isSel ? 'bg-primary text-primary-contrast' : avatarTone(counterpart?.address ?? m.id))}
                    aria-label={t('mail.list.selectAll')}
                    aria-pressed={isSel}
                  >
                    {isSel ? <CheckSquare className="size-3.5" /> : <span className="group-hover:hidden">{initialsOf(counterpart)}</span>}
                    {!isSel && <Square className="hidden size-3.5 group-hover:block" />}
                  </button>
                  <button type="button" onClick={() => onOpen(m)} className="min-w-0 flex-1 text-left" aria-current={isActive ? 'true' : undefined}>
                    <span className="flex items-baseline gap-2">
                      <span className={clsx('min-w-0 flex-1 truncate text-sm', m.seen ? 'text-ink' : 'font-bold text-ink')}>{who}</span>
                      {m.threadCount > 1 && <span className="shrink-0 rounded-md bg-sunken px-1 text-[0.65rem] font-semibold text-muted">{m.threadCount}</span>}
                      <span className={clsx('shrink-0 text-[0.7rem] tabular-nums', m.seen ? 'text-muted' : 'font-semibold text-link')}>{fmtListDate(m.date)}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className={clsx('min-w-0 flex-1 truncate text-sm', m.seen ? 'text-ink/90' : 'font-semibold text-ink')}>
                        {m.isDraft && <span className="mr-1 text-danger-fg">{t('mail.list.draft')}:</span>}
                        {subjectOf(m)}
                      </span>
                      <TriageRowChips ai={m.ai} />
                      {m.hasAttachments && <Paperclip className="size-3.5 shrink-0 text-muted" aria-hidden />}
                      {m.flagged && <Flag className="size-3.5 shrink-0 fill-warning text-warning-fg" aria-hidden />}
                      {m.snoozedUntil && <Clock className="size-3.5 shrink-0 text-accent-fg" aria-hidden />}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">{m.snippet}</span>
                      {m.labels.slice(0, 3).map((l) => (
                        <span key={l.id} className="shrink-0 rounded-md px-1.5 text-[0.62rem] font-semibold text-white" style={{ background: l.color }}>
                          {l.name}
                        </span>
                      ))}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {hasMore && (
          <div ref={sentinel} className="grid place-items-center py-4 text-link">
            {fetchingMore ? (
              <Spinner className="size-4" />
            ) : (
              <button type="button" onClick={onLoadMore} className="text-xs font-semibold text-link hover:underline">
                {t('mail.loadMore')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
