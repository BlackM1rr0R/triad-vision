import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ArrowUpDown, Briefcase, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import type { ListSort, TaskCard, TaskListResponse } from './types';
import { AvatarStack, DueChip, PriorityChip, Skeleton, StatusChip } from './bits';
import { fmtDay } from './utils';

const COLS: { key: ListSort | null; label: string; className?: string }[] = [
  { key: 'number', label: 'tasks.fields.number', className: 'w-20' },
  { key: 'title', label: 'tasks.fields.title' },
  { key: null, label: 'tasks.fields.assignees', className: 'w-28' },
  { key: 'priority', label: 'tasks.fields.priority', className: 'w-28' },
  { key: 'dueAt', label: 'tasks.fields.dueAt', className: 'w-36' },
  { key: 'status', label: 'tasks.fields.status', className: 'w-32' },
  { key: null, label: 'tasks.fields.case', className: 'w-44' },
  { key: 'updatedAt', label: 'tasks.fields.updatedAt', className: 'w-28' },
];

/** Sortable table of tasks (server-side sorting and paging). */
export const ListView = ({
  data,
  loading,
  sort,
  dir,
  onSort,
  page,
  onPage,
  onOpen,
  activeId,
}: {
  data: TaskListResponse | undefined;
  loading: boolean;
  sort: ListSort;
  dir: 'asc' | 'desc';
  onSort: (key: ListSort) => void;
  page: number;
  onPage: (page: number) => void;
  onOpen: (task: TaskCard) => void;
  activeId?: string | null;
}) => {
  const { t } = useTranslation();
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-4 lg:px-6">
        {/* Phones: stacked rows */}
        <ul className="space-y-2 md:hidden">
          {loading && !items.length
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)
            : items.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(task)}
                    className={clsx('w-full rounded-xl border bg-card p-3.5 text-left', activeId === task.id ? 'border-primary' : 'border-line')}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[0.7rem] font-semibold text-muted">{task.key}</span>
                      <StatusChip status={task.status} />
                      <span className="ml-auto">
                        <AvatarStack people={task.assignees} size="xs" />
                      </span>
                    </span>
                    <span className="mt-1.5 block text-sm font-semibold text-ink">{task.title}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5">
                      <PriorityChip priority={task.priority} compact />
                      <DueChip dueAt={task.dueAt} status={task.status} />
                    </span>
                  </button>
                </li>
              ))}
        </ul>
        <div className="hidden min-w-[60rem] overflow-hidden rounded-xl border border-line bg-card md:block">
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 z-10 bg-sunken text-left text-xs font-medium text-muted">
              <tr>
                {COLS.map((c) => (
                  <th key={c.label} scope="col" className={clsx('border-b border-line px-4 py-3', c.className)} aria-sort={c.key && sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.key ? (
                      <button type="button" onClick={() => onSort(c.key!)} className={clsx('inline-flex items-center gap-1 uppercase hover:text-ink', sort === c.key && 'text-ink')}>
                        {t(c.label)}
                        {sort === c.key ? dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      t(c.label)
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !items.length
                ? Array.from({ length: 8 }, (_, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      {COLS.map((c) => (
                        <td key={c.label} className="px-4 py-3.5">
                          <Skeleton className="h-4" />
                        </td>
                      ))}
                    </tr>
                  ))
                : items.map((task) => (
                    <tr
                      key={task.id}
                      onClick={() => onOpen(task)}
                      onKeyDown={(e) => e.key === 'Enter' && onOpen(task)}
                      tabIndex={0}
                      className={clsx(
                        'cursor-pointer border-b border-line outline-none transition-colors last:border-0 hover:bg-sunken focus-visible:bg-primary/[0.06]',
                        activeId === task.id && 'bg-primary/[0.06]',
                      )}
                    >
                      <td className="px-4 py-3 code-id text-xs font-medium text-muted">{task.key}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('line-clamp-2 font-semibold text-ink', (task.status === 'DONE' || task.status === 'CANCELLED') && 'text-muted line-through decoration-1')}>{task.title}</span>
                        {(task.checklist.total > 0 || task.commentCount > 0) && (
                          <span className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                            {task.checklist.total > 0 && (
                              <span className="tabular-nums">
                                ✓ {task.checklist.done}/{task.checklist.total}
                              </span>
                            )}
                            {task.commentCount > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                <MessageSquare className="size-3" aria-hidden /> {task.commentCount}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{task.assignees.length ? <AvatarStack people={task.assignees} max={4} /> : <span className="text-xs text-muted">—</span>}</td>
                      <td className="px-4 py-3">
                        <PriorityChip priority={task.priority} />
                      </td>
                      <td className="px-4 py-3">{task.dueAt ? <DueChip dueAt={task.dueAt} status={task.status} /> : <span className="text-xs text-muted">—</span>}</td>
                      <td className="px-4 py-3">
                        <StatusChip status={task.status} />
                      </td>
                      <td className="px-4 py-3">
                        {task.case ? (
                          <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
                            <Briefcase className="size-3 shrink-0" aria-hidden />
                            <span className="truncate">
                              {task.case.number} · {task.case.clientName}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted tabular-nums">{fmtDay(task.updatedAt)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
      {total > pageSize && (
        <div className="flex items-center justify-end gap-3 border-t border-line bg-card px-4 py-2.5 text-sm lg:px-6">
          <span className="text-muted tabular-nums">{t('tasks.list.shown', { from: (page - 1) * pageSize + 1, to: Math.min(total, page * pageSize), total })}</span>
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className="grid size-9 place-items-center rounded-lg border border-line text-ink disabled:opacity-40" aria-label={t('tasks.actions.prev')}>
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-muted tabular-nums">{t('tasks.list.page', { page, pages })}</span>
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} className="grid size-9 place-items-center rounded-lg border border-line text-ink disabled:opacity-40" aria-label={t('tasks.actions.next')}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
};
