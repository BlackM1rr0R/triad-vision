import { useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { TaskCard as Card, TaskStatus } from './types';
import { TaskCard } from './TaskCard';
import { Skeleton } from './bits';
import { STATUS_DOT, statusLabel } from './utils';

interface DropTarget {
  status: TaskStatus;
  beforeId: string | null;
}

/**
 * Kanban board with native HTML5 drag & drop (no library): cards move between columns and reorder
 * inside a column; a thin bar shows where the card will land. Columns scroll on their own; on phones
 * the board scrolls sideways with one column per snap.
 */
export const BoardView = ({
  columns,
  tasks,
  loading,
  activeId,
  canMove,
  onOpen,
  onMove,
  onCreateIn,
}: {
  columns: TaskStatus[];
  tasks: Card[];
  loading: boolean;
  activeId?: string | null;
  canMove: (task: Card) => boolean;
  onOpen: (task: Card) => void;
  onMove: (task: Card, status: TaskStatus, beforeId: string | null) => void;
  onCreateIn: (status: TaskStatus) => void;
}) => {
  const { t } = useTranslation();
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const dragRef = useRef<Card | null>(null);

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, Card[]>(columns.map((s) => [s, []]));
    for (const task of tasks) map.get(task.status)?.push(task);
    return map;
  }, [tasks, columns]);

  const onDragStart = (e: React.DragEvent, task: Card) => {
    dragRef.current = task;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.key);
    // Let the browser take its drag snapshot before the card fades.
    requestAnimationFrame(() => setDragId(task.id));
  };
  const reset = () => {
    dragRef.current = null;
    setDragId(null);
    setDrop(null);
  };

  const targetFrom = (e: React.DragEvent<HTMLElement>, status: TaskStatus): DropTarget => {
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-task-id]')].filter((el) => el.dataset.taskId !== dragRef.current?.id);
    const before = cards.find((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    return { status, beforeId: before?.dataset.taskId ?? null };
  };

  const onDragOver = (e: React.DragEvent<HTMLElement>, status: TaskStatus) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const next = targetFrom(e, status);
    if (next.status !== drop?.status || next.beforeId !== drop?.beforeId) setDrop(next);
  };

  const onDrop = (e: React.DragEvent<HTMLElement>, status: TaskStatus) => {
    e.preventDefault();
    const task = dragRef.current;
    const target = targetFrom(e, status);
    reset();
    if (!task) return;
    const column = byStatus.get(status) ?? [];
    const idx = column.findIndex((c) => c.id === task.id);
    // Dropped where it already is: nothing to do.
    if (task.status === status && idx >= 0 && (column[idx + 1]?.id ?? null) === target.beforeId) return;
    onMove(task, status, target.beforeId);
  };

  return (
    <div className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 py-4 sm:gap-4 lg:px-6 [scrollbar-width:thin]">
      {columns.map((status) => {
        const items = byStatus.get(status) ?? [];
        const isTarget = drop?.status === status;
        const bar = <div className="h-1 rounded-full bg-brand-500 shadow-[0_0_0_3px_rgba(47,123,255,0.15)]" aria-hidden />;
        return (
          <section
            key={status}
            aria-label={statusLabel(status)}
            className={clsx(
              'flex h-full w-[85vw] max-w-[22rem] shrink-0 snap-start flex-col rounded-2xl border bg-surface/70 transition-colors sm:w-80 xl:w-auto xl:max-w-none xl:min-w-[16rem] xl:flex-1',
              isTarget ? 'border-brand-400 bg-brand-50/60' : 'border-line',
            )}
          >
            <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
              <span className={clsx('size-2.5 rounded-full', STATUS_DOT[status])} aria-hidden />
              <h2 className="text-sm font-bold text-ink">{statusLabel(status)}</h2>
              <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted tabular-nums ring-1 ring-line">{loading ? '…' : items.length}</span>
              <button
                type="button"
                onClick={() => onCreateIn(status)}
                className="ml-auto grid size-8 place-items-center rounded-lg text-muted transition hover:bg-card hover:text-brand-600"
                title={t('tasks.actions.newInColumn')}
                aria-label={t('tasks.actions.newInColumn')}
              >
                <Plus className="size-4" />
              </button>
            </header>
            <div
              className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-2.5 pt-1 pb-3"
              onDragOver={(e) => onDragOver(e, status)}
              onDrop={(e) => onDrop(e, status)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null) && drop?.status === status) setDrop(null);
              }}
            >
              {loading && !items.length
                ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)
                : items.map((task) => (
                    <div key={task.id} className="flex flex-col gap-2.5">
                      {isTarget && drop?.beforeId === task.id && bar}
                      <TaskCard
                        task={task}
                        onOpen={onOpen}
                        active={activeId === task.id}
                        draggable={canMove(task)}
                        dragging={dragId === task.id}
                        onDragStart={onDragStart}
                        onDragEnd={reset}
                      />
                    </div>
                  ))}
              {isTarget && drop?.beforeId === null && bar}
              {!loading && !items.length && (
                <div className={clsx('grid flex-1 place-items-center rounded-xl border-2 border-dashed px-4 py-8 text-center text-xs font-medium text-muted', isTarget ? 'border-brand-400' : 'border-line')}>
                  {t('tasks.empty.column')}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};
