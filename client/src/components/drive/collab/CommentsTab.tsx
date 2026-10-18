import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, ChevronDown, CornerDownRight, ListChecks, MoreHorizontal, Pencil, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { driveCollabCopy } from '@/i18n/pagesDriveCollab';
import { api } from '@/lib/api';
import { fmtDateTime, fmtRelative } from '@/components/admin/labels';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { toastDriveError } from '../api';
import type { DriveItem, StaffPerson } from '../types';
import { collabKeys, deleteComment, fetchComments, patchComment, postComment, taskFromComment, MENTION_RE, type DriveComment, type TaskStatus } from './api';
import { CommentBody, MentionInput, type MentionInputHandle } from './MentionInput';

registerCopy(driveCollabCopy);

const STATUS_TONE: Record<TaskStatus, string> = {
  TODO: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
  IN_PROGRESS: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  REVIEW: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  DONE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200',
};

const initials = (p: { firstName: string; lastName: string } | null) => (p ? (p.firstName[0] ?? '') + (p.lastName[0] ?? '') : '?');
const plain = (body: string) => body.replace(MENTION_RE, (_m, name: string) => `@${name}`).replace(/\s+/g, ' ').trim();

/** "Tapşırıq yarat" from a comment: title, assignees, due date; the file is attached automatically. */
const TaskDialog = ({ comment, item, onClose, onCreated }: { comment: DriveComment | null; item: DriveItem; onClose: () => void; onCreated: () => void }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [search, setSearch] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  useEffect(() => {
    if (!comment) return;
    const text = plain(comment.body);
    setTitle(text.length > 120 ? `${text.slice(0, 119)}…` : text);
    setDue('');
    setSearch('');
    setAssignees(comment.mentions.map((m) => m.id).slice(0, 1));
  }, [comment]);
  const people = useQuery({
    queryKey: ['drive', 'people', search],
    queryFn: async () => (await api.get<{ people: StaffPerson[] }>('/drive/people', { params: { q: search || undefined } })).data.people,
    enabled: !!comment,
    staleTime: 30_000,
  });
  const create = useMutation({
    mutationFn: () => taskFromComment(comment!.id, { title: title.trim(), assigneeIds: assignees, dueAt: due || null }),
    onSuccess: (task) => {
      toast.success(t('driveCollab.task.created', { key: task.key }));
      onCreated();
      onClose();
    },
    onError: toastDriveError,
  });
  const toggle = (id: string) => setAssignees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  return (
    <Modal
      open={!!comment}
      onClose={onClose}
      title={t('driveCollab.task.title')}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
            {t('driveCollab.comments.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Spinner className="size-3.5" />} {t('driveCollab.task.create')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block text-xs font-semibold text-muted">
          {t('driveCollab.task.name')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="input mt-1" data-autofocus />
        </label>
        <div>
          <span className="text-xs font-semibold text-muted">{t('driveCollab.task.assignees')}</span>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('driveCollab.task.searchPh')} className="input !pl-9 !text-sm" />
          </div>
          <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-line">
            {people.data?.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={assignees.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span className="truncate text-ink">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="ml-auto truncate text-[11px] text-muted">{p.email}</span>
                </label>
              </li>
            ))}
          </ul>
          {assignees.length === 0 && <p className="mt-1 text-xs text-muted">{t('driveCollab.task.noAssignee')}</p>}
        </div>
        <label className="block text-xs font-semibold text-muted">
          {t('driveCollab.task.due')}
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input mt-1 !w-auto" />
        </label>
        <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">
          {t('driveCollab.task.file')}: <span className="font-semibold text-ink">{item.name}</span>
        </p>
      </div>
    </Modal>
  );
};

interface ItemProps {
  c: DriveComment;
  reply?: boolean;
  focused: boolean;
  onReply?: () => void;
  onTask?: () => void;
  refresh: () => void;
}

const CommentItem = ({ c, reply, focused, onReply, onTask, refresh }: ItemProps) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const editor = useRef<MentionInputHandle>(null);
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) el.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focused]);
  const save = useMutation({
    mutationFn: () => patchComment(c.id, { body: editor.current?.serialize() ?? c.body }),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
    onError: toastDriveError,
  });
  const resolve = useMutation({ mutationFn: (resolved: boolean) => patchComment(c.id, { resolved }), onSuccess: refresh, onError: toastDriveError });
  const remove = useMutation({
    mutationFn: () => deleteComment(c.id),
    onSuccess: () => {
      toast.success(t('driveCollab.comments.deleted'));
      refresh();
    },
    onError: toastDriveError,
  });
  return (
    <div ref={el} id={`comment-${c.id}`} className={clsx('group flex gap-2.5 rounded-xl p-2 transition', focused && 'bg-brand-50 ring-2 ring-brand-400/50 dark:bg-brand-500/10')}>
      <span className={clsx('grid shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-700', reply ? 'size-6 text-[9px]' : 'size-8 text-[11px]')}>{initials(c.author)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-xs font-semibold text-ink">{c.author ? `${c.author.firstName} ${c.author.lastName}` : t('driveCollab.comments.someone')}</span>
          <span className="shrink-0 text-[11px] text-muted" title={fmtDateTime(c.createdAt)}>
            {fmtRelative(c.createdAt)}
            {c.edited && ` · ${t('driveCollab.comments.edited')}`}
          </span>
          {(c.canEdit || c.canDelete) && !editing && (
            <span className="relative ml-auto">
              <button type="button" onClick={() => setMenu((m) => !m)} onBlur={() => window.setTimeout(() => setMenu(false), 150)} className="grid size-6 place-items-center rounded text-muted opacity-60 hover:bg-surface hover:text-ink group-hover:opacity-100" aria-label={t('driveCollab.comments.edit')}>
                <MoreHorizontal className="size-4" />
              </button>
              {menu && (
                <span className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-line bg-card py-1 shadow-lg">
                  {c.canEdit && (
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setMenu(false); setEditing(true); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink hover:bg-surface">
                      <Pencil className="size-3.5" /> {t('driveCollab.comments.edit')}
                    </button>
                  )}
                  {c.canDelete && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setMenu(false);
                        if (window.confirm(t('driveCollab.comments.deleteConfirm'))) remove.mutate();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      <Trash2 className="size-3.5" /> {t('driveCollab.comments.delete')}
                    </button>
                  )}
                </span>
              )}
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-1 space-y-1.5">
            <MentionInput ref={editor} initial={c.body} placeholder="" onSubmit={() => save.mutate()} autoFocus />
            <div className="flex justify-end gap-1.5">
              <button type="button" className="btn-sm px-2 text-xs text-muted" onClick={() => setEditing(false)}>
                {t('driveCollab.comments.cancel')}
              </button>
              <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
                {t('driveCollab.comments.save')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-0.5">
            <CommentBody body={c.body} />
          </div>
        )}
        {c.task && (
          <Link to={`/workspace/tasks/${c.task.key}`} className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1 text-[11px] hover:border-brand-400" title={t('driveCollab.comments.openTask')}>
            <ListChecks className="size-3.5 shrink-0 text-brand-600" />
            <span className="font-semibold text-ink">{c.task.key}</span>
            <span className="truncate text-muted">{c.task.title}</span>
            <span className={clsx('shrink-0 rounded-full px-1.5 py-px font-semibold', STATUS_TONE[c.task.status])}>{t(`driveCollab.taskStatus.${c.task.status}`)}</span>
          </Link>
        )}
        {!reply && !editing && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
            {onReply && !c.resolvedAt && (
              <button type="button" onClick={onReply} className="text-muted hover:text-brand-600">
                {t('driveCollab.comments.reply')}
              </button>
            )}
            {c.resolvedAt ? (
              <button type="button" onClick={() => resolve.mutate(false)} className="inline-flex items-center gap-1 text-muted hover:text-brand-600">
                <RotateCcw className="size-3" /> {t('driveCollab.comments.reopen')}
              </button>
            ) : (
              <button type="button" onClick={() => resolve.mutate(true)} className="inline-flex items-center gap-1 text-muted hover:text-emerald-600">
                <Check className="size-3" /> {t('driveCollab.comments.resolve')}
              </button>
            )}
            {onTask && !c.task && (
              <button type="button" onClick={onTask} className="inline-flex items-center gap-1 text-muted hover:text-brand-600">
                <ListChecks className="size-3" /> {t('driveCollab.comments.createTask')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Thread = ({ c, item, focusId, onTask, refresh }: { c: DriveComment; item: DriveItem; focusId: string | null; onTask: (c: DriveComment) => void; refresh: () => void }) => {
  const { t } = useTranslation();
  const [replying, setReplying] = useState(false);
  const input = useRef<MentionInputHandle>(null);
  const send = useMutation({
    mutationFn: () => postComment(item.id, input.current?.serialize() ?? '', c.id),
    onSuccess: () => {
      input.current?.reset();
      setReplying(false);
      refresh();
    },
    onError: toastDriveError,
  });
  return (
    <li className={clsx('rounded-xl border border-line bg-card', c.resolvedAt && 'opacity-75')}>
      {c.resolvedAt && (
        <p className="flex items-center gap-1 border-b border-line px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          <Check className="size-3" /> {t('driveCollab.comments.resolvedBadge')}
        </p>
      )}
      <CommentItem c={c} focused={focusId === c.id} onReply={() => setReplying(true)} onTask={() => onTask(c)} refresh={refresh} />
      {(c.replies.length > 0 || replying) && (
        <div className="ml-6 space-y-0.5 border-l border-line pb-1 pl-2">
          {c.replies.map((r) => (
            <CommentItem key={r.id} c={r} reply focused={focusId === r.id} refresh={refresh} />
          ))}
          {replying && (
            <div className="flex items-start gap-1.5 p-2">
              <CornerDownRight className="mt-2.5 size-3.5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <MentionInput ref={input} placeholder={t('driveCollab.comments.replyPlaceholder')} onSubmit={() => send.mutate()} autoFocus rows={1} />
                <div className="flex justify-end gap-1.5">
                  <button type="button" className="btn-sm px-2 text-xs text-muted" onClick={() => setReplying(false)}>
                    {t('driveCollab.comments.cancel')}
                  </button>
                  <button type="button" className="btn-primary btn-sm" disabled={send.isPending} onClick={() => send.mutate()}>
                    <Send className="size-3.5" /> {t('driveCollab.comments.send')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
};

/** "Şərhlər" tab of the details panel: threads with one level of replies, @mentions, resolve, task from a comment. */
export const CommentsTab = ({ item, focusCommentId }: { item: DriveItem; focusCommentId?: string | null }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: collabKeys.comments(item.id), queryFn: () => fetchComments(item.id) });
  const input = useRef<MentionInputHandle>(null);
  const [taskFor, setTaskFor] = useState<DriveComment | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: collabKeys.comments(item.id) });
    void qc.invalidateQueries({ queryKey: ['drive', 'children'] });
  };
  const send = useMutation({
    mutationFn: () => postComment(item.id, input.current?.serialize() ?? ''),
    onSuccess: () => {
      input.current?.reset();
      refresh();
    },
    onError: toastDriveError,
  });
  const comments = q.data?.comments ?? [];
  const open = useMemo(() => comments.filter((c) => !c.resolvedAt), [comments]);
  const resolved = useMemo(() => comments.filter((c) => c.resolvedAt), [comments]);
  // A link to a resolved comment opens the resolved list.
  useEffect(() => {
    if (focusCommentId && resolved.some((c) => c.id === focusCommentId || c.replies.some((r) => r.id === focusCommentId))) setShowResolved(true);
  }, [focusCommentId, resolved]);
  const canWrite = !item.deletedAt;

  return (
    <div className="flex flex-col gap-3 p-3">
      {canWrite && (
        <div className="space-y-1.5">
          <MentionInput ref={input} placeholder={t('driveCollab.comments.placeholder')} onSubmit={() => send.mutate()} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">{t('driveCollab.comments.mentionHint')}</span>
            <button type="button" className="btn-primary btn-sm shrink-0" disabled={send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />} {t('driveCollab.comments.send')}
            </button>
          </div>
        </div>
      )}
      {q.isLoading ? (
        <div className="grid place-items-center py-6">
          <Spinner />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">{t('driveCollab.comments.empty')}</p>
      ) : (
        <>
          <ul className="space-y-2">
            {open.map((c) => (
              <Thread key={c.id} c={c} item={item} focusId={focusCommentId ?? null} onTask={setTaskFor} refresh={refresh} />
            ))}
          </ul>
          {resolved.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowResolved((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink" aria-expanded={showResolved}>
                <ChevronDown className={clsx('size-3.5 transition', showResolved && 'rotate-180')} />
                {showResolved ? t('driveCollab.comments.hideResolved') : t('driveCollab.comments.showResolved', { count: resolved.length })}
              </button>
              {showResolved && (
                <ul className="mt-2 space-y-2">
                  {resolved.map((c) => (
                    <Thread key={c.id} c={c} item={item} focusId={focusCommentId ?? null} onTask={setTaskFor} refresh={refresh} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      <TaskDialog comment={taskFor} item={item} onClose={() => setTaskFor(null)} onCreated={refresh} />
    </div>
  );
};
