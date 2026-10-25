import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertCircle, ArrowUpRight, CheckSquare, Hand, Link as LinkIcon, MessageSquare, Paperclip, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/auth';
import { errorCode } from '@/lib/api';
import type { Person, TaskDetail, TaskStatus } from './types';
import { TASK_STATUSES } from './types';
import { useTask, useTaskActions } from './api';
import { DueChip, RichText, Skeleton } from './bits';
import { AssigneeField, CaseField, DateTimeField, PriorityPicker, StatusSelect } from './pickers';
import { Checklist } from './Checklist';
import { TimerButton } from '@/components/timeCare/TimerButton'; // time tracking: task ↔ time entry
import { Attachments } from './Attachments';
import { CommentEditor, Timeline } from './Comments';
import { DEFAULT_DUE_TIME, errorText, fmtDayTime, fromInputs, fullName, toDateInput, toTimeInput } from './utils';

const Section = ({ icon: Icon, title, aside, children }: { icon: typeof X; title: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="border-t border-line px-5 py-5 sm:px-7">
    <h3 className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-muted uppercase">
      <Icon className="size-3.5" aria-hidden /> {title}
      {aside && <span className="ml-auto font-semibold tracking-normal normal-case">{aside}</span>}
    </h3>
    {children}
  </section>
);

const Field = ({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) => (
  <div className="min-w-0">
    {htmlFor ? (
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
    ) : (
      <span className="label">{label}</span>
    )}
    {children}
  </div>
);

/** Task delete confirmation (the design-system ConfirmDialog with the task copy). */
export const ConfirmBox = ({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={open}
      busy={busy}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={t('tasks.actions.cancel')}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
};

/**
 * Right-hand task panel (full screen on phones): every field edits in place and saves immediately;
 * fields the user may not change are shown read-only.
 */
export const TaskPanel = ({ taskRef, onClose, onDeleted }: { taskRef: string; onClose: () => void; onDeleted: () => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const query = useTask(taskRef);
  const actions = useTaskActions();
  const task = query.data;

  // TODO(ui): docked panel (absolute inside the Tasks board on md+, full screen on phones), not a modal
  // overlay, so it is not the design-system Drawer. Revisit with the workspace layout rework.
  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 flex flex-col bg-card md:absolute md:inset-y-0 md:right-0 md:left-auto md:w-[min(46rem,100%)] md:border-l md:border-line md:shadow-[var(--tv-shadow-overlay)] xl:w-[48rem]"
      aria-label={task ? `${task.key} ${task.title}` : taskRef}
    >
      {query.isLoading ? (
        <div className="space-y-4 p-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-3/4" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
          <Skeleton className="h-32" />
        </div>
      ) : !task ? (
        <div className="flex h-full flex-col">
          <div className="flex justify-end p-3">
            <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-lg text-muted hover:bg-sunken" aria-label={t('tasks.actions.close')}>
              <X className="size-5" />
            </button>
          </div>
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div>
              <AlertCircle className="mx-auto mb-3 size-8 text-muted" aria-hidden />
              <p className="font-semibold text-ink">{errorCode(query.error) === 'TASK_NOT_FOUND' ? t('tasks.toast.notFound') : t('tasks.toast.loadFailed')}</p>
              {errorCode(query.error) !== 'TASK_NOT_FOUND' && (
                <button type="button" onClick={() => void query.refetch()} className="btn-secondary btn-sm mt-4 border border-line">
                  <RefreshCw className="size-3.5" /> {t('tasks.actions.retry')}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <PanelBody key={task.id} task={task} taskRef={taskRef} meId={user?.id} onClose={onClose} onDeleted={onDeleted} actions={actions} />
      )}
    </motion.aside>
  );
};

const PanelBody = ({
  task,
  taskRef,
  meId,
  onClose,
  onDeleted,
  actions,
}: {
  task: TaskDetail;
  taskRef: string;
  meId: string | undefined;
  onClose: () => void;
  onDeleted: () => void;
  actions: ReturnType<typeof useTaskActions>;
}) => {
  const { t } = useTranslation();
  const p = task.permissions;
  const [title, setTitle] = useState(task.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(task.description ?? '');
  const [confirm, setConfirm] = useState<{ kind: 'task' } | { kind: 'comment'; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => {
    if (!editingDesc) setDesc(task.description ?? '');
  }, [task.description, editingDesc]);
  // Grow the title box with its text.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  const save = async (body: Record<string, unknown>) => {
    try {
      await actions.update(taskRef, body);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const saveTitle = () => {
    const v = title.trim();
    if (!v) return setTitle(task.title);
    if (v !== task.title) void save({ title: v });
  };

  const setAssignees = (next: Person[]) => void save({ assigneeIds: next.map((x) => x.id) });

  const take = async () => {
    try {
      await actions.addAssignee(taskRef, meId!);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/workspace/tasks/${task.key}`);
      toast.success(t('tasks.actions.linkCopied'));
    } catch {
      /* clipboard blocked */
    }
  };

  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'task') {
        await actions.remove(taskRef);
        toast.success(t('tasks.toast.deleted'));
        setConfirm(null);
        onDeleted();
        return;
      }
      await actions.deleteComment(taskRef, confirm.id);
      setConfirm(null);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const statusOptions: TaskStatus[] = TASK_STATUSES;
  const comments = task.timeline.filter((e) => e.kind === 'comment').length;
  const doneItems = task.checklist.filter((i) => i.done).length;

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5 sm:px-5">
        <span className="rounded-md bg-sunken px-2 py-1 code-id text-xs font-medium text-muted ring-1 ring-line">{task.key}</span>
        <DueChip dueAt={task.dueAt} status={task.status} />
        <div className="ml-auto flex items-center gap-1">
          <TimerButton taskId={task.id} caseId={task.case?.id ?? null} compact />
          <button type="button" onClick={() => void copyLink()} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" title={t('tasks.actions.copyLink')} aria-label={t('tasks.actions.copyLink')}>
            <LinkIcon className="size-4" />
          </button>
          {p.delete && (
            <button type="button" onClick={() => setConfirm({ kind: 'task' })} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg" title={t('tasks.actions.delete')} aria-label={t('tasks.actions.delete')}>
              <Trash2 className="size-4" />
            </button>
          )}
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" title={t('tasks.actions.close')} aria-label={t('tasks.actions.close')}>
            <X className="size-5" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="px-5 pt-5 pb-4 sm:px-7">
          <textarea
            ref={titleRef}
            value={title}
            rows={1}
            maxLength={200}
            readOnly={!p.edit}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                setTitle(task.title);
                e.currentTarget.blur();
              }
            }}
            aria-label={t('tasks.fields.title')}
            className={clsx(
              'w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-1 py-0.5 font-display text-xl leading-snug font-bold text-ink outline-none sm:text-2xl',
              p.edit && 'hover:border-line focus:border-focus focus:bg-field',
            )}
          />
          <p className="mt-1 px-1 text-xs text-muted">
            {t('tasks.panel.created', { name: task.createdBy ? fullName(task.createdBy) : '—', date: fmtDayTime(task.createdAt) })}
          </p>
          {p.take && (
            <button type="button" onClick={() => void take()} className="btn-secondary btn-sm mt-3">
              <Hand className="size-3.5" /> {t('tasks.actions.take')}
            </button>
          )}

          <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label={t('tasks.fields.status')} htmlFor="task-status">
              <StatusSelect id="task-status" value={task.status} options={statusOptions} disabled={!p.status} onChange={(s) => void save({ status: s })} />
            </Field>
            <Field label={t('tasks.fields.priority')}>
              <PriorityPicker value={task.priority} disabled={!p.edit} onChange={(v) => v !== task.priority && void save({ priority: v })} />
            </Field>
            <Field label={t('tasks.fields.dueAt')} htmlFor="task-due-date">
              <DateTimeField
                idPrefix="task-due"
                label={t('tasks.fields.dueAt')}
                date={toDateInput(task.dueAt)}
                time={toTimeInput(task.dueAt)}
                disabled={!p.edit}
                onChange={(date, time) => {
                  const next = fromInputs(date, time || DEFAULT_DUE_TIME);
                  if (next !== task.dueAt) void save({ dueAt: next });
                }}
              />
            </Field>
            <Field label={t('tasks.fields.startAt')} htmlFor="task-start-date">
              <DateTimeField
                idPrefix="task-start"
                label={t('tasks.fields.startAt')}
                date={toDateInput(task.startAt)}
                time={toTimeInput(task.startAt)}
                disabled={!p.edit}
                onChange={(date, time) => {
                  const next = fromInputs(date, time || '09:00');
                  if (next !== task.startAt) void save({ startAt: next });
                }}
              />
            </Field>
            <Field label={t('tasks.fields.assignees')}>
              <AssigneeField value={task.assignees} disabled={!p.assign} onChange={setAssignees} />
            </Field>
            <Field label={t('tasks.fields.case')}>
              <div className="flex flex-wrap items-center gap-2">
                <CaseField value={task.case} disabled={!p.edit} onChange={(c) => void save({ caseId: c?.id ?? null })} align="right" />
                {task.case && (
                  <Link to={`/admin/cases/${task.case.id}`} className="inline-flex items-center gap-0.5 text-xs font-semibold text-link hover:underline">
                    {t('tasks.actions.openCase')} <ArrowUpRight className="size-3" />
                  </Link>
                )}
              </div>
            </Field>
          </div>
          {!p.edit && <p className="mt-3 text-xs text-muted">{t('tasks.panel.onlyManagers')}</p>}
        </div>

        <Section
          icon={Pencil}
          title={t('tasks.fields.description')}
          aside={
            p.edit && !editingDesc ? (
              <button type="button" onClick={() => setEditingDesc(true)} className="text-xs font-semibold text-link hover:underline">
                {t('tasks.actions.edit')}
              </button>
            ) : undefined
          }
        >
          {editingDesc ? (
            <div>
              <textarea
                autoFocus
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={Math.min(16, Math.max(5, desc.split('\n').length + 1))}
                maxLength={20000}
                placeholder={t('tasks.ph.description')}
                className="input resize-y leading-relaxed"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setEditingDesc(false);
                  }
                }}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingDesc(false)}>
                  {t('tasks.actions.cancel')}
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={async () => {
                    await save({ description: desc.trim() ? desc : null });
                    setEditingDesc(false);
                  }}
                >
                  {t('tasks.actions.save')}
                </button>
              </div>
            </div>
          ) : task.description ? (
            <RichText text={task.description} className="text-sm leading-relaxed text-ink/90" />
          ) : p.edit ? (
            <button type="button" onClick={() => setEditingDesc(true)} className="w-full rounded-xl border border-dashed border-line px-4 py-4 text-left text-sm text-muted hover:border-line-strong">
              {t('tasks.ph.noDescription')}
            </button>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </Section>

        <Section icon={CheckSquare} title={t('tasks.fields.checklist')} aside={task.checklist.length ? <span className="text-muted tabular-nums">{doneItems}/{task.checklist.length}</span> : undefined}>
          <Checklist taskRef={taskRef} items={task.checklist} canEdit={p.checklist} />
        </Section>

        <Section icon={Paperclip} title={t('tasks.fields.attachments')} aside={task.attachments.length ? <span className="text-muted">{task.attachments.length}</span> : undefined}>
          <Attachments taskRef={taskRef} items={task.attachments} canEdit={p.attach} />
        </Section>

        <Section icon={MessageSquare} title={t('tasks.fields.activity')} aside={comments ? <span className="text-muted">{comments}</span> : undefined}>
          <Timeline
            entries={task.timeline}
            meId={meId}
            onEdit={async (id, body) => {
              try {
                await actions.editComment(taskRef, id, body);
              } catch (err) {
                toast.error(errorText(err));
                throw err;
              }
            }}
            onDelete={(id) => setConfirm({ kind: 'comment', id })}
          />
          {!comments && <p className="mt-3 text-sm text-muted">{t('tasks.empty.comments')}</p>}
          {p.comment && (
            <div className="mt-5">
              <CommentEditor
                submitLabel={t('tasks.actions.send')}
                onSubmit={async (body) => {
                  try {
                    await actions.comment(taskRef, body);
                  } catch (err) {
                    toast.error(errorText(err));
                    throw err;
                  }
                }}
              />
            </div>
          )}
        </Section>
        <p className="px-5 pb-6 text-xs text-muted sm:px-7">
          {t('tasks.fields.updatedAt')}: {fmtDayTime(task.updatedAt)}
          {task.completedAt && <> · {t('tasks.due.doneAt', { date: fmtDayTime(task.completedAt) })}</>}
        </p>
      </div>

      <ConfirmBox
        open={!!confirm}
        busy={busy}
        title={confirm?.kind === 'comment' ? t('tasks.confirmDelete.comment') : t('tasks.confirmDelete.title')}
        message={confirm?.kind === 'task' ? t('tasks.confirmDelete.message', { title: task.title }) : undefined}
        confirmLabel={t('tasks.actions.delete')}
        onClose={() => setConfirm(null)}
        onConfirm={() => void doDelete()}
      />
    </>
  );
};
