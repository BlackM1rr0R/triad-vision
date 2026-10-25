import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Archive, ArrowLeft, Briefcase, ChevronDown, ChevronUp, Clock, Download, Flag, FolderInput, Forward, Mail, MailOpen, MoreHorizontal, Paperclip, Printer, Reply, ReplyAll, ShieldAlert, Tag, Trash2, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Popover } from '@/components/tasks/bits';
import { attachmentUrl } from './api';
import { MailBody } from './MailBody';
import { CasePickerDialog, LabelsMenu, MenuItem, MoveMenu, SnoozeMenu } from './menus';
import type { Address, CaseRef, MailFolder, MailLabel, MessageDetail, SnoozePreset } from './types';
import { avatarTone, displayName, fmtFull, formatBytes, formatList, initialsOf, subjectOf } from './utils';

export type PaneAction =
  | { type: 'reply' | 'replyAll' | 'forward' | 'archive' | 'trash' | 'deleteForever' | 'flag' | 'unflag' | 'read' | 'unread' | 'spam' | 'notSpam' | 'unsnooze' | 'print' }
  | { type: 'snooze'; preset?: SnoozePreset; until?: string }
  | { type: 'move'; folder: MailFolder }
  | { type: 'label'; label: MailLabel; on: boolean }
  | { type: 'linkCase'; caseRef: CaseRef | null };

const Btn = ({ onClick, label, children, active, danger, kbd }: { onClick: () => void; label: string; children: ReactNode; active?: boolean; danger?: boolean; kbd?: string }) => (
  <button type="button" onClick={onClick} title={kbd ? `${label} (${kbd})` : label} aria-label={label} className={clsx('grid size-9 place-items-center rounded-lg transition', active ? 'bg-primary/10 text-link' : 'text-muted hover:bg-sunken hover:text-ink', danger && 'hover:text-danger-fg')}>
    {children}
  </button>
);

const AddrList = ({ label, list }: { label: string; list: Address[] }) =>
  list.length ? (
    <div className="flex gap-2 text-xs">
      <span className="w-14 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 break-words text-ink">{formatList(list)}</span>
    </div>
  ) : null;

const AttachmentChip = ({ a }: { a: { id: string; filename: string; mimeType: string; size: number } }) => {
  const { t } = useTranslation();
  return (
    <a href={attachmentUrl(a.id)} download className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs hover:border-line-strong hover:bg-primary/[0.06]" title={`${a.filename} · ${formatBytes(a.size)}`}>
      <Paperclip className="size-3.5 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 truncate font-medium text-ink">{a.filename}</span>
      <span className="shrink-0 text-muted">{formatBytes(a.size)}</span>
      <Download className="size-3.5 shrink-0 text-link" aria-label={t('mail.actions.download')} />
    </a>
  );
};

/** One message (header + body + attachments); the conversation view stacks several, collapsed by default. */
export const MessageCard = ({ m, expanded, onToggle, single }: { m: MessageDetail; expanded: boolean; onToggle?: () => void; single?: boolean }) => {
  const { t } = useTranslation();
  const [details, setDetails] = useState(false);
  const [images, setImages] = useState(false);
  useEffect(() => setImages(false), [m.id]);
  const files = m.attachments.filter((a) => !a.inline);
  return (
    <article className={clsx('rounded-xl border border-line bg-card', single && 'border-0 bg-transparent')}>
      <header className={clsx('flex items-start gap-3 px-4 py-3', !single && 'cursor-pointer')} onClick={!single ? onToggle : undefined}>
        <span className={clsx('grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold', avatarTone(m.from?.address ?? m.id))}>{initialsOf(m.from)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 truncate text-sm font-bold text-ink">{displayName(m.from) || t('mail.list.unknownSender')}</span>
            {m.from && <span className="hidden min-w-0 truncate text-xs text-muted sm:inline">&lt;{m.from.address}&gt;</span>}
            <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">{fmtFull(m.date)}</span>
          </div>
          {expanded ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDetails((d) => !d);
                }}
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
              >
                <span className="truncate">
                  {t('mail.header.to')}: {m.to.map((a) => displayName(a)).join(', ') || '—'}
                  {m.cc.length > 0 && ` · ${t('mail.header.cc')}: ${m.cc.length}`}
                </span>
                {details ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </button>
              {details && (
                <div className="mt-2 space-y-1 rounded-lg bg-sunken px-3 py-2">
                  <AddrList label={t('mail.header.from')} list={m.from ? [m.from] : []} />
                  <AddrList label={t('mail.header.to')} list={m.to} />
                  <AddrList label={t('mail.header.cc')} list={m.cc} />
                  <AddrList label={t('mail.header.bcc')} list={m.bcc} />
                  {m.replyTo && <AddrList label={t('mail.header.replyTo')} list={[{ name: '', address: m.replyTo }]} />}
                  <div className="flex gap-2 text-xs">
                    <span className="w-14 shrink-0 text-muted">{t('mail.header.date')}</span>
                    <span className="text-ink">{fmtFull(m.date)}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="truncate text-xs text-muted">{m.snippet}</p>
          )}
        </div>
      </header>
      {expanded && (
        <div className="px-4 pb-4">
          {files.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {files.map((a) => (
                <AttachmentChip key={a.id} a={a} />
              ))}
            </div>
          )}
          <MailBody html={m.html} text={m.text} showImages={images} onShowImages={() => setImages(true)} />
        </div>
      )}
    </article>
  );
};

export const ReadingPane = ({
  message,
  thread,
  loading,
  error,
  conversation,
  folders,
  labels,
  onAction,
  onBack,
  onClose,
  aiSlot,
}: {
  message: MessageDetail | undefined;
  thread: MessageDetail[] | undefined;
  loading: boolean;
  error: boolean;
  conversation: boolean;
  folders: MailFolder[];
  labels: MailLabel[];
  onAction: (a: PaneAction) => void;
  onBack?: () => void;
  onClose: () => void;
  /** AI triage card shown above the message body */
  aiSlot?: ReactNode;
}) => {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<null | 'snooze' | 'move' | 'labels' | 'more'>(null);
  const [casePicker, setCasePicker] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    setMenu(null);
    setExpanded(new Set(message ? [message.id] : []));
  }, [message?.id]);

  if (!message) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        {loading ? (
          <Spinner className="text-link" />
        ) : error ? (
          <div>
            <p className="text-sm font-semibold text-ink">{t('mail.error.message')}</p>
            <p className="mt-1 text-xs text-muted">{t('mail.error.body')}</p>
          </div>
        ) : (
          <div>
            <span className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-primary/[0.06] text-link">
              <MailOpen className="size-6" />
            </span>
            <p className="text-sm font-semibold text-ink">{t('mail.empty.selectMessage')}</p>
            <p className="mt-1 text-xs text-muted">{t('mail.empty.selectMessageBody')}</p>
          </div>
        )}
      </div>
    );
  }

  const inTrash = message.folderRole === 'TRASH';
  const inJunk = message.folderRole === 'JUNK';
  const selectedLabels = new Set(message.labels.map((l) => l.id));
  const list = conversation && thread && thread.length > 1 ? thread : [message];
  const accountFolders = folders.filter((f) => f.accountId === message.accountId);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-line px-2 py-1.5">
        {onBack && (
          <span className="lg:hidden">
            <Btn onClick={onBack} label={t('mail.back')}>
              <ArrowLeft className="size-4" />
            </Btn>
          </span>
        )}
        {!message.isDraft && (
          <>
            <Btn onClick={() => onAction({ type: 'reply' })} label={t('mail.actions.reply')} kbd="r">
              <Reply className="size-4" />
            </Btn>
            <Btn onClick={() => onAction({ type: 'replyAll' })} label={t('mail.actions.replyAll')} kbd="a">
              <ReplyAll className="size-4" />
            </Btn>
            <Btn onClick={() => onAction({ type: 'forward' })} label={t('mail.actions.forward')} kbd="f">
              <Forward className="size-4" />
            </Btn>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          </>
        )}
        <Btn onClick={() => onAction({ type: 'archive' })} label={t('mail.actions.archive')} kbd="e">
          <Archive className="size-4" />
        </Btn>
        <Btn onClick={() => onAction({ type: inTrash ? 'deleteForever' : 'trash' })} label={inTrash ? t('mail.actions.deleteForever') : t('mail.actions.delete')} kbd="#" danger>
          <Trash2 className="size-4" />
        </Btn>
        <Btn onClick={() => onAction({ type: message.flagged ? 'unflag' : 'flag' })} label={message.flagged ? t('mail.actions.unflag') : t('mail.actions.flag')} active={message.flagged} kbd="s">
          <Flag className={clsx('size-4', message.flagged && 'fill-warning text-warning-fg')} />
        </Btn>
        <div className="relative">
          <Btn onClick={() => setMenu(menu === 'snooze' ? null : 'snooze')} label={t('mail.actions.snooze')} active={!!message.snoozedUntil}>
            <Clock className="size-4" />
          </Btn>
          <SnoozeMenu
            open={menu === 'snooze'}
            onClose={() => setMenu(null)}
            onPick={(v) => {
              setMenu(null);
              onAction({ type: 'snooze', ...v });
            }}
          />
        </div>
        <div className="relative">
          <Btn onClick={() => setMenu(menu === 'labels' ? null : 'labels')} label={t('mail.actions.labels')} active={message.labels.length > 0}>
            <Tag className="size-4" />
          </Btn>
          <LabelsMenu open={menu === 'labels'} onClose={() => setMenu(null)} labels={labels} selected={selectedLabels} onToggle={(label, on) => onAction({ type: 'label', label, on })} />
        </div>
        <div className="relative">
          <Btn onClick={() => setMenu(menu === 'move' ? null : 'move')} label={t('mail.actions.move')}>
            <FolderInput className="size-4" />
          </Btn>
          <MoveMenu
            open={menu === 'move'}
            onClose={() => setMenu(null)}
            folders={accountFolders}
            currentFolderId={message.folderId}
            onPick={(folder) => {
              setMenu(null);
              onAction({ type: 'move', folder });
            }}
          />
        </div>
        <span className="flex-1" />
        <div className="relative">
          <Btn onClick={() => setMenu(menu === 'more' ? null : 'more')} label={t('mail.actions.more')}>
            <MoreHorizontal className="size-4" />
          </Btn>
          <Popover open={menu === 'more'} onClose={() => setMenu(null)} className="w-56" align="right">
            <MenuItem
              icon={message.seen ? <Mail className="size-3.5 text-muted" /> : <MailOpen className="size-3.5 text-muted" />}
              onClick={() => {
                setMenu(null);
                onAction({ type: message.seen ? 'unread' : 'read' });
              }}
            >
              {message.seen ? t('mail.actions.markUnread') : t('mail.actions.markRead')}
            </MenuItem>
            <MenuItem
              icon={<Briefcase className="size-3.5 text-muted" />}
              onClick={() => {
                setMenu(null);
                if (message.case) onAction({ type: 'linkCase', caseRef: null });
                else setCasePicker(true);
              }}
            >
              {message.case ? t('mail.actions.unlinkCase') : t('mail.actions.linkCase')}
            </MenuItem>
            <MenuItem
              icon={<ShieldAlert className="size-3.5 text-muted" />}
              onClick={() => {
                setMenu(null);
                onAction({ type: inJunk ? 'notSpam' : 'spam' });
              }}
            >
              {inJunk ? t('mail.actions.notSpam') : t('mail.actions.spam')}
            </MenuItem>
            {message.snoozedUntil && (
              <MenuItem
                icon={<Clock className="size-3.5 text-muted" />}
                onClick={() => {
                  setMenu(null);
                  onAction({ type: 'unsnooze' });
                }}
              >
                {t('mail.actions.unsnooze')}
              </MenuItem>
            )}
            <MenuItem
              icon={<Printer className="size-3.5 text-muted" />}
              onClick={() => {
                setMenu(null);
                onAction({ type: 'print' });
              }}
            >
              {t('mail.actions.print')}
            </MenuItem>
          </Popover>
        </div>
        <Btn onClick={onClose} label={t('mail.actions.close')}>
          <X className="size-4" />
        </Btn>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-lg leading-snug font-bold break-words text-ink">{subjectOf(message)}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {message.labels.map((l) => (
              <span key={l.id} className="rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold text-white" style={{ background: l.color }}>
                {l.name}
              </span>
            ))}
            {message.snoozedUntil && (
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-bg px-1.5 py-0.5 text-[0.65rem] font-semibold text-accent-fg">
                <Clock className="size-3" /> {t('mail.snooze.until', { date: fmtFull(message.snoozedUntil) })}
              </span>
            )}
            {message.case && (
              <Link to={`/admin/cases/${message.case.id}`} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-link hover:underline">
                <Briefcase className="size-3" /> {message.case.number} · {message.case.clientName}
              </Link>
            )}
            {conversation && thread && thread.length > 1 && <span className="text-[0.65rem] font-semibold text-muted">{thread.length} ✉</span>}
          </div>
        </div>
        {aiSlot}
        <div className={clsx('space-y-2 px-2 pb-6', list.length === 1 && 'px-0')}>
          {list.map((m) => (
            <MessageCard
              key={m.id}
              m={m}
              single={list.length === 1}
              expanded={list.length === 1 || expanded.has(m.id)}
              onToggle={() =>
                setExpanded((s) => {
                  const n = new Set(s);
                  if (n.has(m.id)) n.delete(m.id);
                  else n.add(m.id);
                  return n;
                })
              }
            />
          ))}
        </div>
      </div>
      <CasePickerDialog
        open={casePicker}
        onClose={() => setCasePicker(false)}
        onPick={(c) => {
          setCasePicker(false);
          onAction({ type: 'linkCase', caseRef: c });
        }}
      />
    </div>
  );
};
