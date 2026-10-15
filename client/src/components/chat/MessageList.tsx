import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Check, Download, FileText, Link2, MessageSquare, Pencil, Pin, SmilePlus, Trash2, X } from 'lucide-react';
import type { Attachment, Message, Person } from './types';
import { attachmentUrl } from './api';
import { Avatar, EmojiPicker } from './bits';
import { ChatMarkdown } from './ChatMarkdown';
import { PollCard, pollIdOf } from './PollCard';
import { GROUP_GAP_MS, autosize, dayKey, fmtDayLabel, fmtTime, formatBytes, fullName, isImage } from './utils';

export interface MessageActions {
  react: (m: Message, emoji: string) => void;
  reply: (m: Message) => void;
  edit: (m: Message, body: string) => Promise<void>;
  remove: (m: Message) => void;
  pin: (m: Message) => void;
  copyLink: (m: Message) => void;
}

const AttachmentView = ({ a }: { a: Attachment }) => {
  const { t } = useTranslation();
  if (isImage(a.mimeType)) {
    return (
      <a href={attachmentUrl(a.id)} target="_blank" rel="noopener noreferrer" className="block max-w-xs overflow-hidden rounded-lg border border-line bg-surface">
        <img src={attachmentUrl(a.id)} alt={a.filename} loading="lazy" className="max-h-64 w-auto object-contain" />
      </a>
    );
  }
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm">
      <FileText className="size-4 shrink-0 text-brand-600" aria-hidden />
      <a href={attachmentUrl(a.id)} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-medium text-ink hover:underline">
        {a.filename}
      </a>
      <span className="shrink-0 text-xs text-muted">{formatBytes(a.size)}</span>
      <a href={attachmentUrl(a.id, true)} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink" aria-label={t('chat.actions.download')} title={t('chat.actions.download')}>
        <Download className="size-3.5" />
      </a>
    </span>
  );
};

const Reactions = ({ m, onReact }: { m: Message; onReact: (emoji: string) => void }) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  if (!m.reactions.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {m.reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onReact(r.emoji)}
          className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors', r.me ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-line bg-card text-ink hover:border-brand-300')}
          aria-pressed={r.me}
        >
          <span>{r.emoji}</span>
          <span className="font-semibold">{r.count}</span>
        </button>
      ))}
      <span className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} className="grid size-6 place-items-center rounded-full border border-dashed border-line text-muted hover:border-brand-300 hover:text-brand-600" aria-label={t('chat.actions.react')}>
          <SmilePlus className="size-3.5" />
        </button>
        <EmojiPicker open={open} onClose={() => setOpen(false)} onPick={onReact} />
      </span>
    </div>
  );
};

const Editor = ({ initial, onSave, onCancel }: { initial: string; onSave: (body: string) => Promise<void>; onCancel: () => void }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    autosize(ref.current);
    ref.current?.focus();
    ref.current?.setSelectionRange(value.length, value.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave(value);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-1 rounded-lg border border-brand-400 bg-card p-2 ring-4 ring-brand-500/10">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          autosize(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
        rows={1}
        maxLength={4000}
        className="w-full resize-none bg-transparent text-sm text-ink outline-none"
      />
      <div className="mt-1 flex justify-end gap-1">
        <button type="button" onClick={onCancel} className="btn-secondary btn-sm">
          {t('chat.actions.cancel')}
        </button>
        <button type="button" onClick={() => void save()} disabled={busy || !value.trim()} className="btn-primary btn-sm">
          {t('chat.actions.save')}
        </button>
      </div>
    </div>
  );
};

export const MessageItem = ({
  m,
  people,
  meId,
  grouped,
  inThread = false,
  highlighted = false,
  actions,
  onOpenThread,
}: {
  m: Message;
  people: Person[];
  meId: string;
  grouped: boolean;
  inThread?: boolean;
  highlighted?: boolean;
  actions: MessageActions;
  onOpenThread?: (m: Message) => void;
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pollId = useMemo(() => pollIdOf(m.body), [m.body]);
  const mentionsMe = m.mentions.includes(meId);

  const Tool = ({ label, onClick, children, danger = false, active = false }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean; active?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx('grid size-7 place-items-center rounded-md transition-colors', danger ? 'text-muted hover:bg-red-50 hover:text-danger' : active ? 'bg-brand-50 text-brand-600' : 'text-muted hover:bg-surface hover:text-ink')}
    >
      {children}
    </button>
  );

  return (
    <div
      id={`msg-${m.id}`}
      className={clsx(
        'group relative flex gap-3 px-4 py-0.5 transition-colors hover:bg-surface/70',
        !grouped && 'mt-2.5',
        mentionsMe && 'bg-amber-50/60',
        highlighted && 'bg-brand-50',
        m.pending && 'opacity-60',
        m.failed && 'bg-red-50',
      )}
      data-message-id={m.id}
    >
      <div className="w-9 shrink-0">
        {grouped ? (
          <span className="block pt-1 text-right text-[0.6rem] leading-5 text-muted opacity-0 group-hover:opacity-100">{fmtTime(m.createdAt)}</span>
        ) : (
          <Avatar person={m.author} size="lg" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-bold text-ink">{fullName(m.author) || '—'}</span>
            <span className="text-xs text-muted">{fmtTime(m.createdAt)}</span>
            {m.pinnedAt && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                <Pin className="size-3" /> {t('chat.message.pinnedBy')}
              </span>
            )}
          </div>
        )}
        {editing ? (
          <Editor
            initial={m.body}
            onCancel={() => setEditing(false)}
            onSave={async (body) => {
              await actions.edit(m, body);
              setEditing(false);
            }}
          />
        ) : (
          <>
            {m.body && <ChatMarkdown source={m.body} people={people} meId={meId} className="text-sm leading-relaxed text-ink" />}
            {m.editedAt && <span className="ml-1 text-[0.65rem] text-muted">({t('chat.message.edited')})</span>}
            {pollId && <PollCard pollId={pollId} />}
            {m.attachments.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {m.attachments.map((a) => (
                  <AttachmentView key={a.id} a={a} />
                ))}
              </div>
            )}
          </>
        )}
        <Reactions m={m} onReact={(e) => actions.react(m, e)} />
        {!inThread && m.replyCount > 0 && onOpenThread && (
          <button type="button" onClick={() => onOpenThread(m)} className="mt-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">
            <MessageSquare className="size-3.5" />
            {t('chat.message.replies', { count: m.replyCount })}
            {m.lastReplyAt && <span className="font-normal text-muted">· {t('chat.message.lastReply', { time: fmtTime(m.lastReplyAt) })}</span>}
          </button>
        )}
      </div>

      {/* Hover toolbar */}
      {!editing && !m.pending && (
        <div className={clsx('absolute -top-3 right-3 flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5 shadow-sm', menuOpen || emojiOpen ? 'flex' : 'hidden group-hover:flex')}>
          <span className="relative">
            <Tool label={t('chat.actions.react')} onClick={() => setEmojiOpen((o) => !o)} active={emojiOpen}>
              <SmilePlus className="size-4" />
            </Tool>
            <EmojiPicker open={emojiOpen} onClose={() => setEmojiOpen(false)} onPick={(e) => actions.react(m, e)} align="right" />
          </span>
          {!inThread && (
            <Tool label={t('chat.actions.reply')} onClick={() => actions.reply(m)}>
              <MessageSquare className="size-4" />
            </Tool>
          )}
          {m.canEdit && (
            <Tool label={t('chat.actions.edit')} onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
            </Tool>
          )}
          <Tool label={m.pinnedAt ? t('chat.actions.unpin') : t('chat.actions.pin')} onClick={() => actions.pin(m)} active={!!m.pinnedAt}>
            {m.pinnedAt ? <Check className="size-4" /> : <Pin className="size-4" />}
          </Tool>
          <Tool
            label={t('chat.actions.copyLink')}
            onClick={() => {
              actions.copyLink(m);
              setMenuOpen(false);
            }}
          >
            <Link2 className="size-4" />
          </Tool>
          {m.canDelete && (
            <Tool label={t('chat.actions.delete')} onClick={() => actions.remove(m)} danger>
              <Trash2 className="size-4" />
            </Tool>
          )}
        </div>
      )}
      {m.failed && <X className="absolute top-2 right-3 size-4 text-danger" aria-hidden />}
    </div>
  );
};

const DaySeparator = ({ label }: { label: string }) => (
  <div className="relative my-3 flex items-center px-4" role="separator">
    <span className="h-px flex-1 bg-line" />
    <span className="mx-3 rounded-full border border-line bg-card px-3 py-0.5 text-xs font-semibold text-muted">{label}</span>
    <span className="h-px flex-1 bg-line" />
  </div>
);

/**
 * Chronological list (oldest at the top) with day separators, grouped consecutive messages, a
 * "new messages" divider at the read marker, a load-earlier trigger and a scroll-to-bottom button.
 * Keeps the viewport anchored when earlier messages are prepended and follows new ones when at the bottom.
 */
export const MessageList = ({
  messages,
  people,
  meId,
  hasMore,
  loadingMore,
  onLoadMore,
  lastReadAt,
  typing,
  actions,
  onOpenThread,
  highlightId,
  intro,
}: {
  messages: Message[];
  people: Person[];
  meId: string;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  lastReadAt: string | null;
  typing: string[];
  actions: MessageActions;
  onOpenThread: (m: Message) => void;
  highlightId?: string | null;
  intro?: ReactNode;
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const prevCount = useRef(0);
  const prevHeight = useRef(0);
  const prevFirstId = useRef<string | null>(null);
  // The divider stays where it was when the channel was opened (reading does not move it).
  const [marker] = useState(lastReadAt);

  // Follow new messages when at the bottom; preserve position on prepend.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const firstId = messages[0]?.id ?? null;
    const prepended = prevFirstId.current && firstId !== prevFirstId.current && messages.length > prevCount.current && messages.some((m) => m.id === prevFirstId.current);
    if (prepended) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (atBottom || prevCount.current === 0) {
      el.scrollTop = el.scrollHeight;
    } else if (messages.length > prevCount.current) {
      setUnseen((u) => u + (messages.length - prevCount.current));
    }
    prevCount.current = messages.length;
    prevHeight.current = el.scrollHeight;
    prevFirstId.current = firstId;
  }, [messages, atBottom]);

  useEffect(() => {
    if (!highlightId) return;
    const node = document.getElementById(`msg-${highlightId}`);
    node?.scrollIntoView({ block: 'center' });
  }, [highlightId, messages.length]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAtBottom(bottom);
    if (bottom) setUnseen(0);
    if (el.scrollTop < 80 && hasMore && !loadingMore) {
      prevHeight.current = el.scrollHeight;
      onLoadMore();
    }
  };

  const rows = useMemo(() => {
    type Row = { kind: 'day'; key: string; label: string } | { kind: 'msg'; m: Message; grouped: boolean; firstNew: boolean };
    const list: Row[] = [];
    let prev: Message | null = null;
    let newShown = false;
    for (const m of messages) {
      const day = dayKey(new Date(m.createdAt));
      if (!prev || dayKey(new Date(prev.createdAt)) !== day) {
        list.push({ kind: 'day', key: `d-${day}`, label: fmtDayLabel(m.createdAt) });
        prev = null;
      }
      const firstNew = !newShown && !!marker && m.createdAt > marker && m.authorId !== meId;
      if (firstNew) newShown = true;
      const grouped = !!prev && prev.authorId === m.authorId && !m.pinnedAt && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_GAP_MS && !firstNew;
      list.push({ kind: 'msg', m, grouped, firstNew });
      prev = m;
    }
    return list;
  }, [messages, marker, meId]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain pb-3">
        {hasMore ? (
          <div className="flex justify-center py-3">
            <button type="button" onClick={onLoadMore} disabled={loadingMore} className="btn-secondary btn-sm">
              {t('chat.actions.loadMore')}
            </button>
          </div>
        ) : (
          intro
        )}
        {rows.map((r) =>
          r.kind === 'day' ? (
            <DaySeparator key={r.key} label={r.label} />
          ) : (
            <Fragment key={r.m.id}>
              {r.firstNew && (
                <div className="my-2 flex items-center gap-2 px-4" role="separator">
                  <span className="h-px flex-1 bg-danger/50" />
                  <span className="text-[0.65rem] font-bold tracking-wider text-danger uppercase">{t('chat.message.newMessages')}</span>
                </div>
              )}
              <MessageItem m={r.m} people={people} meId={meId} grouped={r.grouped} actions={actions} onOpenThread={onOpenThread} highlighted={highlightId === r.m.id} />
            </Fragment>
          ),
        )}
        {typing.length > 0 && (
          <p className="px-4 pt-2 text-xs text-muted" aria-live="polite">
            <span className="mr-1 inline-flex gap-0.5 align-middle">
              <span className="size-1 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
              <span className="size-1 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
              <span className="size-1 animate-bounce rounded-full bg-muted" />
            </span>
            {typing.length === 1 ? t('chat.message.typingOne', { name: typing[0] }) : t('chat.message.typingMany', { names: typing.join(', ') })}
          </p>
        )}
      </div>
      {!atBottom && (
        <button
          type="button"
          onClick={() => {
            const el = ref.current;
            if (el) el.scrollTop = el.scrollHeight;
            setUnseen(0);
          }}
          className="absolute right-4 bottom-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink shadow-lg hover:bg-surface"
        >
          <ArrowDown className="size-3.5" />
          {unseen > 0 ? unseen : t('chat.message.scrollBottom')}
        </button>
      )}
    </div>
  );
};
