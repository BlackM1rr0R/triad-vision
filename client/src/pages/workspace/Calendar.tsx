import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, PanelLeft, Plus } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesCalendar } from '@/i18n/pagesCalendar';
import { pagesTasks } from '@/i18n/pagesTasks';
import { useAuth } from '@/lib/auth';
import { useRealtime } from '@/lib/realtime';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { AgendaView } from '@/components/calendar/AgendaView';
import { calendarApi, refreshCalendar, useEvent, usePeople, useRange } from '@/components/calendar/api';
import { CalendarSidebar, TOGGLE_KEYS, type ToggleKey } from '@/components/calendar/CalendarSidebar';
import { EventDialog, type DialogInitial } from '@/components/calendar/EventDialog';
import { EventPopover } from '@/components/calendar/EventPopover';
import { MonthView } from '@/components/calendar/MonthView';
import { QuickAdd } from '@/components/calendar/QuickAdd';
import { TimeGrid } from '@/components/calendar/TimeGrid';
import type { AttendeeStatus, CalItem, EventDto, View } from '@/components/calendar/types';
import { VIEWS } from '@/components/calendar/types';
import { addDays, addMonths, dayKey, errorText, fmtDate, fmtMonthTitle, monthGrid, parseDayKey, startOfDay, startOfWeek, toItems, weekNumber } from '@/components/calendar/utils';

registerCopy(pagesTasks);
registerCopy(pagesCalendar);

const TOGGLES_KEY = 'tv-calendar-toggles';
const USERS_KEY = 'tv-calendar-users';
const VIEW_KEY = 'tv-calendar-view';
const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};
const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 640;

/**
 * Team calendar: month / week / day / agenda views over my events, team events, colleagues'
 * calendars and read-only system items. URL state: ?view=week&date=2026-10-16&event=<id>.
 */
export default function WorkspaceCalendar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const meId = user!.id;
  const [sp, setSp] = useSearchParams();
  usePageTitle(t('calendar.title'));

  // ─── URL state ───
  const view: View = VIEWS.find((v) => v === sp.get('view')) ?? read<View>(VIEW_KEY, isPhone() ? 'agenda' : 'week');
  const date = useMemo(() => parseDayKey(sp.get('date')) ?? startOfDay(new Date()), [sp]);
  const eventParam = sp.get('event');
  const patch = useCallback(
    (p: Record<string, string | null>) =>
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(p)) v === null || v === '' ? next.delete(k) : next.set(k, v);
          return next;
        },
        { replace: true },
      ),
    [setSp],
  );
  const setView = (v: View) => {
    write(VIEW_KEY, v);
    patch({ view: v });
  };
  const setDate = (d: Date) => patch({ date: dayKey(d) });

  // ─── Calendars ───
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>(() => ({ ...Object.fromEntries(TOGGLE_KEYS.map((k) => [k, true])), ...read(TOGGLES_KEY, {}) }) as Record<ToggleKey, boolean>);
  const [users, setUsers] = useState<string[]>(() => read<string[]>(USERS_KEY, []));
  const [sidebar, setSidebar] = useState(!isPhone());
  useEffect(() => write(TOGGLES_KEY, toggles), [toggles]);
  useEffect(() => write(USERS_KEY, users), [users]);
  const people = usePeople();

  // ─── Range for the view ───
  const range = useMemo(() => {
    if (view === 'month') {
      const grid = monthGrid(date);
      return { from: grid[0], to: addDays(grid[41], 1) };
    }
    if (view === 'week') {
      const s = startOfWeek(date);
      return { from: s, to: addDays(s, 7) };
    }
    if (view === 'day') return { from: startOfDay(date), to: addDays(startOfDay(date), 1) };
    return { from: startOfDay(date), to: addDays(startOfDay(date), 30) };
  }, [view, date]);
  const data = useRange(range.from, range.to, users, !toggles.team);
  const items = useMemo(() => {
    const all = toItems(data.data?.events ?? [], data.data?.system ?? [], meId);
    return all.filter((i) => (i.calendar === 'user' ? users.includes(i.ownerId ?? '') : toggles[i.calendar as ToggleKey]));
  }, [data.data, meId, users, toggles]);
  const marks = useMemo(() => new Set(items.map((i) => dayKey(i.start))), [items]);

  useRealtime('calendar.updated', () => refreshCalendar(qc));

  // ─── Popover / dialog ───
  const [popover, setPopover] = useState<{ item: CalItem; rect: DOMRect } | null>(null);
  const [dialog, setDialog] = useState<DialogInitial | null>(null);
  const deepLinked = useEvent(eventParam && !popover ? eventParam : null);
  useEffect(() => {
    if (!deepLinked.data || !eventParam) return;
    const [item] = toItems([deepLinked.data], [], meId);
    const rect = new DOMRect(window.innerWidth / 2 - 170, Math.max(80, window.innerHeight / 2 - 200), 0, 0);
    setPopover({ item, rect });
    setDate(new Date(deepLinked.data.startsAt));
  }, [deepLinked.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const closePopover = useCallback(() => {
    setPopover(null);
    if (eventParam) patch({ event: null });
  }, [eventParam, patch]);

  const openItem = (item: CalItem, rect: DOMRect) => setPopover({ item, rect });
  const createAt = (start: Date, end?: Date, allDay = false) => setDialog({ start, end: end ?? new Date(start.getTime() + 60 * 60_000), allDay });
  const onSaved = () => refreshCalendar(qc);
  const move = async (item: CalItem, start: Date, end: Date) => {
    try {
      await calendarApi.update(item.id, { startsAt: start.toISOString(), endsAt: end.toISOString() });
      toast.success(t('calendar.toasts.moved'));
      refreshCalendar(qc);
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const remove = async (e: EventDto) => {
    // TODO(ui): ConfirmDialog
    if (!window.confirm(t('calendar.actions.confirmDelete', { title: e.title }))) return;
    try {
      await calendarApi.remove(e.id);
      toast.success(t('calendar.toasts.deleted'));
      closePopover();
      refreshCalendar(qc);
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const respond = async (e: EventDto, status: AttendeeStatus) => {
    try {
      const saved = await calendarApi.respond(e.id, status);
      toast.success(t('calendar.toasts.responded'));
      setPopover((p) => (p ? { ...p, item: toItems([saved], [], meId)[0] } : p));
      refreshCalendar(qc);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  // ─── Navigation ───
  const step = (dir: 1 | -1) => setDate(view === 'month' ? addMonths(date, dir) : view === 'week' ? addDays(date, 7 * dir) : view === 'day' ? addDays(date, dir) : addDays(date, 7 * dir));
  const title = view === 'month' ? fmtMonthTitle(date) : view === 'week' ? `${fmtDate(startOfWeek(date), { day: 'numeric', month: 'short' })} – ${fmtDate(addDays(startOfWeek(date), 6), { day: 'numeric', month: 'short', year: 'numeric' })}` : view === 'day' ? fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' });
  const weekDays = useMemo(() => (view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)) : [startOfDay(date)]), [view, date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 't') setDate(new Date());
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'n') createAt(new Date(Math.ceil(Date.now() / 1_800_000) * 1_800_000));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full min-h-0 bg-canvas text-ink">
      {sidebar && (
        <aside className={clsx('shrink-0 border-r border-line bg-card', 'absolute inset-y-0 left-0 z-30 w-72 shadow-[var(--tv-shadow-raised)] sm:static sm:w-64 sm:shadow-none')}>
          <CalendarSidebar
            month={date}
            selected={date}
            marks={marks}
            onSelectDay={(d) => {
              setDate(d);
              if (isPhone()) setSidebar(false);
            }}
            onMonthChange={setDate}
            toggles={toggles}
            onToggle={(k) => setToggles((x) => ({ ...x, [k]: !x[k] }))}
            people={people.data ?? []}
            meId={meId}
            users={users}
            onToggleUser={(id) => setUsers((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]))}
          />
        </aside>
      )}
      {sidebar && isPhone() && <button type="button" className="absolute inset-0 z-20 bg-scrim sm:hidden" onClick={() => setSidebar(false)} aria-label={t('calendar.actions.close')} />}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-line bg-card px-3 py-2">
          <button type="button" onClick={() => setSidebar((s) => !s)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('calendar.calendars.title')} title={t('calendar.calendars.title')}>
            <PanelLeft className="size-4" />
          </button>
          <button type="button" onClick={() => setDate(new Date())} className="btn-secondary btn-sm">
            {t('calendar.today')}
          </button>
          <div className="flex items-center">
            <button type="button" onClick={() => step(-1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('calendar.prev')}>
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => step(1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('calendar.next')}>
              <ChevronRight className="size-4" />
            </button>
          </div>
          <h1 className="min-w-0 truncate font-display text-base font-semibold text-ink">
            {title}
            {view === 'week' && <span className="ml-2 text-xs font-semibold text-muted">{t('calendar.labels.week', { n: weekNumber(date) })}</span>}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:block md:w-72 lg:w-96">
              <QuickAdd onCreated={(e) => (refreshCalendar(qc), setDate(new Date(e.startsAt)))} />
            </div>
            {/* TODO(ui): <Tabs variant="pills"> once TabItem supports a per-item className (month/week are hidden below sm) */}
            <div className="flex rounded-lg border border-line p-0.5" role="tablist">
              {VIEWS.map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={clsx('rounded-md px-2.5 py-1 text-xs font-semibold', view === v ? 'bg-card text-ink shadow-[var(--tv-shadow-card)] ring-1 ring-line' : 'text-muted hover:text-ink', (v === 'month' || v === 'week') && 'hidden sm:block')}>
                  {t(`calendar.views.${v}`)}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => createAt(new Date(Math.ceil(Date.now() / 1_800_000) * 1_800_000))} className="btn-primary btn-sm inline-flex items-center gap-1.5">
              <Plus className="size-4" /> <span className="hidden sm:inline">{t('calendar.newEvent')}</span>
            </button>
          </div>
        </header>
        <div className="border-b border-line bg-card px-3 py-2 md:hidden">
          <QuickAdd onCreated={(e) => (refreshCalendar(qc), setDate(new Date(e.startsAt)))} />
        </div>

        <div className="relative min-h-0 flex-1">
          {data.isLoading && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-card/60">
              <Spinner />
            </div>
          )}
          {view === 'month' && (
            <MonthView
              month={date}
              items={items}
              selected={date}
              onOpenItem={openItem}
              onCreate={(s) => createAt(s)}
              onSelectDay={(d) => {
                setDate(d);
                setView('day');
              }}
            />
          )}
          {(view === 'week' || view === 'day') && <TimeGrid days={weekDays} items={items} onOpenItem={openItem} onCreate={(s, e, allDay) => createAt(s, e, allDay)} onMove={move} />}
          {view === 'agenda' && <AgendaView from={date} items={items} onOpenItem={openItem} />}
          {!data.isLoading && !items.length && view !== 'agenda' && (
            <p className="pointer-events-none absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs text-muted">
              <CalendarDays className="size-3.5" /> {t('calendar.labels.noEvents')}
            </p>
          )}
        </div>
      </section>

      <EventPopover
        item={popover?.item ?? null}
        anchor={popover?.rect ?? null}
        meId={meId}
        onClose={closePopover}
        onEdit={(e) => {
          setPopover(null);
          setDialog({ event: e });
        }}
        onDelete={(e) => void remove(e)}
        onRespond={(e, s) => void respond(e, s)}
      />
      <EventDialog open={!!dialog} onClose={() => setDialog(null)} initial={dialog ?? {}} people={people.data ?? []} meId={meId} onSaved={onSaved} />
    </div>
  );
}
