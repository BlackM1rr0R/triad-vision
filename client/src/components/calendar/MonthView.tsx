import { useMemo } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Repeat } from 'lucide-react';
import type { CalItem } from './types';
import { dayKey, fmtTime, isToday, itemsOnDay, monthGrid, weekdayShort } from './utils';

const MAX_IN_CELL = 3;
/** Drag data type of a month chip (the item key). */
const DRAG_MIME = 'application/x-tv-calitem';

export const ItemChip = ({ item, compact = false, onOpen, draggable = false }: { item: CalItem; compact?: boolean; onOpen: (item: CalItem, rect: DOMRect) => void; draggable?: boolean }) => {
  const timed = !item.allDay;
  const recurring = item.source === 'event' && 'rrule' in item.raw && !!item.raw.rrule;
  return (
    <button
      type="button"
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => (e.dataTransfer.setData(DRAG_MIME, item.key), (e.dataTransfer.effectAllowed = 'move')) : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item, e.currentTarget.getBoundingClientRect());
      }}
      title={item.title}
      className={clsx('flex w-full items-center gap-1 truncate rounded-md border-l-2 px-1.5 text-left text-[0.7rem] leading-5 transition-colors hover:brightness-95', item.tone.bg, item.tone.text, item.tone.border, item.busy && 'italic', compact && 'leading-4')}
    >
      {timed && <span className="shrink-0 font-semibold opacity-80">{fmtTime(item.start)}</span>}
      <span className="truncate font-medium">{item.title}</span>
      {recurring && <Repeat className="ml-auto size-2.5 shrink-0 opacity-70" aria-hidden />}
    </button>
  );
};

/** Month grid; click a day to create an event there, click a chip to open it, "+N more" switches to the day. */
export const MonthView = ({
  month,
  items,
  selected,
  onOpenItem,
  onCreate,
  onSelectDay,
  canDrag,
  onDropDay,
}: {
  month: Date;
  items: CalItem[];
  selected: Date;
  onOpenItem: (item: CalItem, rect: DOMRect) => void;
  onCreate: (start: Date) => void;
  onSelectDay: (d: Date) => void;
  /** Optional drag and drop of chips onto another day (the time of day is kept). */
  canDrag?: (item: CalItem) => boolean;
  onDropDay?: (item: CalItem, day: Date) => void;
}) => {
  const { t } = useTranslation();
  const days = useMemo(() => monthGrid(month), [month]);
  const sel = dayKey(selected);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-7 border-b border-line bg-card text-center text-[0.68rem] font-bold tracking-wider text-muted uppercase">
        {weekdayShort().map((d, i) => (
          <span key={i} className={clsx('py-1.5', i >= 5 && 'text-muted')}>
            {d}
          </span>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const k = dayKey(d);
          const other = d.getMonth() !== month.getMonth();
          const list = itemsOnDay(items, d);
          const shown = list.slice(0, MAX_IN_CELL);
          const rest = list.length - shown.length;
          return (
            <div
              key={k}
              role="button"
              tabIndex={0}
              onClick={() => onCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0))}
              onKeyDown={(e) => e.key === 'Enter' && onCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0))}
              onDragOver={onDropDay ? (e) => e.dataTransfer.types.includes(DRAG_MIME) && (e.preventDefault(), (e.dataTransfer.dropEffect = 'move')) : undefined}
              onDrop={
                onDropDay
                  ? (e) => {
                      const key = e.dataTransfer.getData(DRAG_MIME);
                      const it = items.find((x) => x.key === key);
                      if (!it) return;
                      e.preventDefault();
                      if (dayKey(it.start) !== k) onDropDay(it, d);
                    }
                  : undefined
              }
              className={clsx('group flex min-h-0 cursor-pointer flex-col gap-0.5 overflow-hidden border-r border-b border-line p-1 transition-colors hover:bg-surface/70', other ? 'bg-surface/40' : 'bg-card', k === sel && 'ring-1 ring-focus ring-inset')}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectDay(d);
                }}
                className={clsx('mb-0.5 grid size-6 place-items-center self-end rounded-full text-xs font-semibold', isToday(d) ? 'bg-primary text-primary-contrast' : other ? 'text-muted' : 'text-ink hover:bg-primary/[0.06]')}
              >
                {d.getDate()}
              </button>
              {shown.map((it) => (
                <ItemChip key={it.key} item={it} compact onOpen={onOpenItem} draggable={!!onDropDay && !!canDrag?.(it)} />
              ))}
              {rest > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDay(d);
                  }}
                  className="px-1 text-left text-[0.68rem] font-semibold text-link hover:underline"
                >
                  {t('calendar.actions.more', { count: rest })}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
