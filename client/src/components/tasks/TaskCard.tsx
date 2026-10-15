import { memo } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Briefcase, CheckSquare, MessageSquare, Paperclip } from 'lucide-react';
import type { TaskCard as Card } from './types';
import { AvatarStack, DueChip, PriorityChip } from './bits';

const PRIORITY_EDGE = { LOW: 'before:bg-slate-300', NORMAL: 'before:bg-transparent', HIGH: 'before:bg-warning', URGENT: 'before:bg-danger' } as const;

/** Board card: number, title, priority, due, progress, counters, assignees. */
export const TaskCard = memo(function TaskCard({
  task,
  onOpen,
  draggable = false,
  dragging = false,
  onDragStart,
  onDragEnd,
  active = false,
}: {
  task: Card;
  onOpen: (task: Card) => void;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: (e: React.DragEvent, task: Card) => void;
  onDragEnd?: () => void;
  active?: boolean;
}) {
  const { t } = useTranslation();
  const { done, total } = task.checklist;
  const finished = task.status === 'DONE' || task.status === 'CANCELLED';
  return (
    <article
      data-task-id={task.id}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, task)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(task);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${task.key} ${task.title}`}
      className={clsx(
        'group relative cursor-pointer overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500 border bg-card p-3.5 pl-4 shadow-[0_1px_2px_rgba(11,31,68,0.06)] transition-[box-shadow,border-color,opacity] duration-150',
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
        PRIORITY_EDGE[task.priority],
        active ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-line hover:border-brand-400/60 hover:shadow-[0_6px_20px_-10px_rgba(11,31,68,0.35)]',
        dragging && 'opacity-40',
        draggable && 'active:cursor-grabbing',
      )}
    >
      <div className="relative">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="font-mono text-[0.7rem] font-semibold tracking-wide text-muted">{task.key}</span>
          <PriorityChip priority={task.priority} compact />
        </div>
        <h3 className={clsx('text-sm leading-snug font-semibold break-words text-ink', finished && 'text-muted line-through decoration-1')}>{task.title}</h3>
        {task.case && (
          <p className="mt-1.5 flex min-w-0 items-center gap-1 text-xs text-muted">
            <Briefcase className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {task.case.number} · {task.case.clientName}
            </span>
          </p>
        )}
        {total > 0 && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span className={clsx('block h-full rounded-full', done === total ? 'bg-success' : 'bg-brand-500')} style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </span>
            <span className="text-[0.7rem] font-semibold text-muted tabular-nums">
              {done}/{total}
            </span>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <DueChip dueAt={task.dueAt} status={task.status} />
          <span className="ml-auto flex items-center gap-2.5 text-[0.7rem] font-semibold text-muted">
            {task.commentCount > 0 && (
              <span className="inline-flex items-center gap-0.5" title={t('tasks.card.comments', { count: task.commentCount })}>
                <MessageSquare className="size-3.5" aria-hidden /> {task.commentCount}
              </span>
            )}
            {task.attachmentCount > 0 && (
              <span className="inline-flex items-center gap-0.5" title={t('tasks.card.attachments', { count: task.attachmentCount })}>
                <Paperclip className="size-3.5" aria-hidden /> {task.attachmentCount}
              </span>
            )}
            {total > 0 && done === total && <CheckSquare className="size-3.5 text-success" aria-label={t('tasks.card.checklist', { done, total })} />}
            <AvatarStack people={task.assignees} size="xs" />
          </span>
        </div>
      </div>
    </article>
  );
});
