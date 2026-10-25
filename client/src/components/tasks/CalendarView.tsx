import { useMemo, useRef, useState } from 'react';
import { TONE_CLASS } from '@/components/ui/status';
import clsx from 'clsx';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { TaskCard } from './types';
import { STATUS_DOT, dayKey, dueState, fmtTime, monthNames, weekdayNames } from './utils';

const DAY = 86_400_000;
const MAX_IN_CELL = 3;

/** The 6×7 grid shown for a month (Monday first), as local dates. */
export const calendarRange = (month: Date) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 42);
  return { start, end };
};

const chipTone = (task: TaskCard) => {
  const s = dueState(task.dueAt, task.status);
  if (s === 'done') return `${TONE_CLASS.neutral} line-through decoration-1`;
  if (s === 'overdue') return TONE_CLASS.danger;
  if (task.priority === 'URGENT' || task.priority === 'HIGH') return TONE_CLASS.warning;
  return 'bg-primary/[0.06] text-ink';
};

/** Month grid by deadline. Click a day to create a task due that day; drag a task to another day to move its deadline. */
export const CalendarView = ({
  month,
  onMonth,
  tasks,
  loading,
  onOpen,
  onCreateOn,
  onReschedule,
  canEdit,
}: {
  month: Date;
  onMonth: (d: Date) => void;
  tasks: TaskCard[];
  loading: boolean;
  onOpen: (task: TaskCard) => void;
  onCreateOn: (day: string) => void;
  onReschedule: (task: TaskCard, day: string) => void;
  canEdit: (task: TaskCard) => boolean;
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const dragRef = useRef<TaskCard | null>(null);

  const { start } = calendarRange(month);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY + 2 * 3600_000)), [start.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(() => {
    const map = new Map<string, TaskCard[]>();
    for (const task of tasks) {
      if (!task.dueAt) continue;
      const k = dayKey(new Date(task.dueAt));
      map.set(k, [...(map.get(k) ?? []), task]);
    }
    for (const list of map.values()) list.sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
    return map;
  }, [tasks]);

  const today = dayKey(new Date());
  const shift = (n: number) => onMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  const chip = (task: TaskCard) => (
    <button
      key={task.id}
      type="button"
      draggable={canEdit(task)}
      onDragStart={(e) => {
        dragRef.current = task;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.key);
      }}
      onDragEnd={() => {
        dragRef.current = null;
        setOverDay(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(task);
      }}
      title={`${task.key} · ${task.title}`}
      className={clsx('flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[0.72rem] leading-tight font-medium transition hover:ring-1 hover:ring-focus', chipTone(task))}
    >
      <span className={clsx('size-1.5 shrink-0 rounded-full', STATUS_DOT[task.status])} aria-hidden />
      <span className="shrink-0 tabular-nums opacity-70">{fmtTime(task.dueAt!)}</span>
      <span className="truncate">{task.title}</span>
    </button>
  );

  const monthLabel = `${monthNames()[month.getMonth()]} ${month.getFullYear()}`;
  const inMonth = days.filter((d) => d.getMonth() === month.getMonth());

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 lg:px-6">
        <h2 className="mr-2 font-display text-lg font-bold text-ink">{monthLabel}</h2>
        <button type="button" onClick={() => shift(-1)} className="grid size-9 place-items-center rounded-lg border border-line bg-card text-ink hover:bg-sunken" aria-label={t('tasks.actions.prev')}>
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" onClick={() => shift(1)} className="grid size-9 place-items-center rounded-lg border border-line bg-card text-ink hover:bg-sunken" aria-label={t('tasks.actions.next')}>
          <ChevronRight className="size-4" />
        </button>
        <button type="button" onClick={() => onMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="h-9 rounded-lg border border-line bg-card px-3 text-sm font-semibold text-ink hover:bg-sunken">
          {t('tasks.actions.today')}
        </button>
        {loading && <Spinner className="ml-2 size-4 text-link" />}
        <p className="ml-auto hidden text-xs text-muted xl:block">{t('tasks.calendar.noDue')}</p>
      </div>

      {/* Phones: agenda of the month */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:hidden">
        <ul className="space-y-3">
          {inMonth.map((d) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            if (!list.length && k !== today) return null;
            return (
              <li key={k} className="rounded-xl border border-line bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className={clsx('text-sm font-bold', k === today ? 'text-link' : 'text-ink')}>
                    {weekdayNames()[(d.getDay() + 6) % 7]}, {d.getDate()}
                  </span>
                  <button type="button" onClick={() => onCreateOn(k)} className="grid size-8 place-items-center rounded-lg text-muted hover:text-link" aria-label={t('tasks.actions.newOnDay')}>
                    <Plus className="size-4" />
                  </button>
                </div>
                <div className="space-y-1">{list.map(chip)}</div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Tablet / desktop: month grid */}
      <div className="hidden min-h-0 flex-1 flex-col px-4 py-4 sm:flex lg:px-6">
        <div className="grid grid-cols-7 gap-px rounded-t-xl border border-b-0 border-line bg-line">
          {weekdayNames().map((w, i) => (
            <div key={w} className={clsx('bg-sunken px-2 py-2 text-center text-xs font-semibold tracking-wide text-muted uppercase', i === 0 && 'rounded-tl-xl', i === 6 && 'rounded-tr-xl')}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-b-xl border border-line bg-line">
          {days.map((d) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const other = d.getMonth() !== month.getMonth();
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div
                key={k}
                role="gridcell"
                onClick={() => onCreateOn(k)}
                onDragOver={(e) => {
                  if (!dragRef.current) return;
                  e.preventDefault();
                  if (overDay !== k) setOverDay(k);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const task = dragRef.current;
                  dragRef.current = null;
                  setOverDay(null);
                  if (task && task.dueAt && dayKey(new Date(task.dueAt)) !== k) onReschedule(task, k);
                }}
                title={t('tasks.actions.newOnDay')}
                className={clsx(
                  'group relative flex min-h-0 cursor-pointer flex-col gap-1 p-1.5 transition-colors',
                  other ? 'bg-sunken' : weekend ? 'bg-card/80' : 'bg-card',
                  overDay === k && 'bg-primary/[0.06] ring-2 ring-focus ring-inset',
                  'hover:bg-primary/[0.04]',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={clsx(
                      'grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums',
                      k === today ? 'bg-primary text-primary-contrast' : other ? 'text-muted' : 'text-ink',
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <Plus className="size-3.5 text-muted opacity-0 transition group-hover:opacity-100" aria-hidden />
                </div>
                <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">{list.slice(0, MAX_IN_CELL).map(chip)}</div>
                {list.length > MAX_IN_CELL && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(k);
                    }}
                    className="self-start rounded px-1.5 text-[0.7rem] font-semibold text-link hover:underline"
                  >
                    {t('tasks.calendar.more', { count: list.length - MAX_IN_CELL })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        open={!!expanded}
        onClose={() => setExpanded(null)}
        size="sm"
        zIndex={60}
        closeLabel={t('tasks.actions.close')}
        title={expanded ? `${weekdayNames()[(new Date(`${expanded}T12:00:00`).getDay() + 6) % 7]}, ${Number(expanded.slice(8))} ${monthNames()[Number(expanded.slice(5, 7)) - 1]}` : ''}
        bodyClassName="space-y-1"
      >
        {expanded && (byDay.get(expanded) ?? []).map(chip)}
      </Modal>
    </div>
  );
};
