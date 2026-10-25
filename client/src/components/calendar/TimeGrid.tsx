import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Repeat } from 'lucide-react';
import type { CalItem } from './types';
import { DAY, MIN, dayKey, fmtTime, isToday, startOfDay, weekdayShort } from './utils';

const HOUR_PX = 48;
const SNAP_MIN = 15;
const GUTTER = 48;

interface Placed {
  item: CalItem;
  top: number;
  height: number;
  col: number;
  cols: number;
}

/** Assigns overlapping items of one day to side-by-side columns. */
const layoutDay = (items: CalItem[], day: Date): Placed[] => {
  const dayStart = startOfDay(day).getTime();
  const rows = items
    .filter((i) => !i.allDay)
    .map((i) => {
      const s = Math.max(i.start.getTime(), dayStart);
      const e = Math.min(i.end.getTime(), dayStart + DAY);
      return { item: i, s, e: Math.max(e, s + 15 * MIN) };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);
  const placed: Placed[] = [];
  let cluster: { s: number; e: number; rows: typeof rows }[] = [];
  const flush = () => {
    for (const c of cluster) {
      const cols: number[] = [];
      const assigned = c.rows.map((r) => {
        let col = cols.findIndex((end) => end <= r.s);
        if (col < 0) {
          col = cols.length;
          cols.push(0);
        }
        cols[col] = r.e;
        return { r, col };
      });
      for (const a of assigned) placed.push({ item: a.r.item, top: ((a.r.s - dayStart) / MIN / 60) * HOUR_PX, height: ((a.r.e - a.r.s) / MIN / 60) * HOUR_PX, col: a.col, cols: cols.length });
    }
    cluster = [];
  };
  for (const r of rows) {
    const cur = cluster[cluster.length - 1];
    if (cur && r.s < cur.e) {
      cur.rows.push(r);
      cur.e = Math.max(cur.e, r.e);
    } else {
      cluster.push({ s: r.s, e: r.e, rows: [r] });
    }
  }
  flush();
  return placed;
};

type Drag = { kind: 'move' | 'resize'; item: CalItem; startX: number; startY: number; dayIdx: number; dMin: number; dDay: number; moved: boolean };

/**
 * Week (7 columns) or day (1 column) grid with an all-day row, a "now" line, click-to-create on empty
 * slots and pointer drag to move / resize editable, non-recurring events (15-minute snapping).
 */
export const TimeGrid = ({
  days,
  items,
  onOpenItem,
  onCreate,
  onMove,
}: {
  days: Date[];
  items: CalItem[];
  onOpenItem: (item: CalItem, rect: DOMRect) => void;
  onCreate: (start: Date, end: Date, allDay?: boolean) => void;
  onMove: (item: CalItem, start: Date, end: Date) => void;
}) => {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [now, setNow] = useState(() => new Date());
  const colWidth = useRef(100);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = 7 * HOUR_PX;
  }, [days[0]?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const perDay = useMemo(
    () =>
      days.map((d) => {
        const s = startOfDay(d).getTime();
        const list = items.filter((i) => i.start.getTime() < s + DAY && i.end.getTime() > s);
        return { allDay: list.filter((i) => i.allDay || i.end.getTime() - i.start.getTime() >= DAY), placed: layoutDay(list.filter((i) => !i.allDay && i.end.getTime() - i.start.getTime() < DAY), d) };
      }),
    [days, items],
  );
  const hasAllDay = perDay.some((d) => d.allDay.length > 0);

  const canDrag = (i: CalItem) => i.source === 'event' && !i.busy && 'canEdit' in i.raw && i.raw.canEdit && !('rrule' in i.raw && i.raw.rrule);

  const beginDrag = (e: ReactPointerEvent, item: CalItem, dayIdx: number, kind: Drag['kind']) => {
    if (!canDrag(item) || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind, item, startX: e.clientX, startY: e.clientY, dayIdx, dMin: 0, dDay: 0, moved: false });
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const dx = e.clientX - drag.startX;
    const dMin = Math.round((dy / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN;
    const dDay = drag.kind === 'move' && days.length > 1 ? Math.round(dx / colWidth.current) : 0;
    if (dMin !== drag.dMin || dDay !== drag.dDay || (!drag.moved && Math.hypot(dx, dy) > 4)) setDrag({ ...drag, dMin, dDay, moved: drag.moved || Math.hypot(dx, dy) > 4 });
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      onOpenItem(d.item, (e.currentTarget as HTMLElement).getBoundingClientRect());
      return;
    }
    const start = d.kind === 'move' ? new Date(d.item.start.getTime() + d.dMin * MIN + d.dDay * DAY) : d.item.start;
    let end = d.kind === 'move' ? new Date(d.item.end.getTime() + d.dMin * MIN + d.dDay * DAY) : new Date(d.item.end.getTime() + d.dMin * MIN);
    if (end.getTime() - start.getTime() < SNAP_MIN * MIN) end = new Date(start.getTime() + SNAP_MIN * MIN);
    if (start.getTime() !== d.item.start.getTime() || end.getTime() !== d.item.end.getTime()) onMove(d.item, start, end);
  };

  const slotClick = (e: React.MouseEvent<HTMLDivElement>, day: Date) => {
    if (drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 60 / 30) * 30;
    const start = new Date(startOfDay(day).getTime() + minutes * MIN);
    onCreate(start, new Date(start.getTime() + 60 * MIN));
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX;
  const cols = days.length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Header */}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: `${GUTTER}px repeat(${cols}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d, i) => (
          <div key={dayKey(d)} className={clsx('border-l border-line py-1.5 text-center', i >= 5 && cols > 1 && 'bg-surface/40')}>
            <span className="block text-[0.65rem] font-bold tracking-wider text-muted uppercase">{weekdayShort()[(d.getDay() + 6) % 7]}</span>
            <span className={clsx('mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-sm font-bold', isToday(d) ? 'bg-primary text-primary-contrast' : 'text-ink')}>{d.getDate()}</span>
          </div>
        ))}
        {hasAllDay && (
          <>
            <div className="border-t border-line py-1 pr-1 text-right text-[0.6rem] text-muted">{t('calendar.labels.allDay')}</div>
            {days.map((d, i) => (
              <div key={`ad-${dayKey(d)}`} role="button" tabIndex={-1} onClick={() => onCreate(startOfDay(d), new Date(startOfDay(d).getTime() + DAY), true)} className="min-h-6 space-y-0.5 border-t border-l border-line p-0.5">
                {perDay[i].allDay.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenItem(it, e.currentTarget.getBoundingClientRect());
                    }}
                    className={clsx('block w-full truncate rounded-md border-l-2 px-1.5 text-left text-[0.68rem] leading-5 font-medium', it.tone.bg, it.tone.text, it.tone.border)}
                  >
                    {it.title}
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Body */}
      <div ref={scroller} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-inset" onPointerMove={onPointerMove}>
        <div className="relative grid" style={{ gridTemplateColumns: `${GUTTER}px repeat(${cols}, minmax(0, 1fr))`, height: 24 * HOUR_PX }}>
          {/* hour labels */}
          <div className="relative">
            {hours.map((h) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[0.62rem] text-muted" style={{ top: h * HOUR_PX }}>
                {h ? `${String(h).padStart(2, '0')}:00` : ''}
              </span>
            ))}
          </div>
          {days.map((d, di) => (
            <div
              key={dayKey(d)}
              className={clsx('relative border-l border-line', di >= 5 && cols > 1 && 'bg-surface/30')}
              onClick={(e) => slotClick(e, d)}
              ref={(el) => {
                if (el && di === 0) colWidth.current = el.getBoundingClientRect().width;
              }}
            >
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: h * HOUR_PX, height: HOUR_PX }}>
                  <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line/40" />
                </div>
              ))}
              {isToday(d) && (
                <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }}>
                  <span className="-ml-1 size-2 rounded-full bg-danger" />
                  <span className="h-px flex-1 bg-danger" />
                </div>
              )}
              {perDay[di].placed.map((p) => {
                const dragging = drag && drag.item.key === p.item.key && drag.moved;
                const dMin = dragging ? drag!.dMin : 0;
                const top = p.top + (dragging && drag!.kind === 'move' ? (dMin / 60) * HOUR_PX : 0);
                const height = Math.max(18, p.height + (dragging && drag!.kind === 'resize' ? (dMin / 60) * HOUR_PX : 0));
                const left = `calc(${(p.col / p.cols) * 100}% + 2px)`;
                const width = `calc(${(1 / p.cols) * 100}% - 4px)`;
                const shiftX = dragging && drag!.kind === 'move' ? drag!.dDay * colWidth.current : 0;
                const editable = canDrag(p.item);
                const previewStart = new Date(p.item.start.getTime() + (dragging && drag!.kind === 'move' ? dMin * MIN : 0));
                const previewEnd = new Date(p.item.end.getTime() + (dragging ? dMin * MIN : 0));
                return (
                  <div
                    key={p.item.key}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => beginDrag(e, p.item, di, 'move')}
                    onPointerUp={endDrag}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!editable) onOpenItem(p.item, e.currentTarget.getBoundingClientRect());
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && onOpenItem(p.item, e.currentTarget.getBoundingClientRect())}
                    className={clsx(
                      'absolute z-[5] overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[0.7rem] leading-tight shadow-[var(--tv-shadow-card)] transition-[filter] select-none hover:brightness-95',
                      p.item.tone.bg,
                      p.item.tone.text,
                      p.item.tone.border,
                      editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                      dragging && 'z-20 opacity-90 shadow-[var(--tv-shadow-raised)] ring-2 ring-focus',
                      p.item.busy && 'italic',
                    )}
                    style={{ top, height, left, width, transform: shiftX ? `translateX(${shiftX}px)` : undefined }}
                    title={p.item.title}
                  >
                    <span className="block truncate font-semibold">{p.item.title}</span>
                    {height > 30 && (
                      <span className="block truncate opacity-80">
                        {fmtTime(previewStart)}–{fmtTime(previewEnd)}
                      </span>
                    )}
                    {p.item.source === 'event' && 'rrule' in p.item.raw && p.item.raw.rrule && <Repeat className="absolute top-1 right-1 size-3 opacity-60" aria-hidden />}
                    {editable && <span onPointerDown={(e) => beginDrag(e, p.item, di, 'resize')} className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" aria-hidden />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
