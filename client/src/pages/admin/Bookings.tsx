import { lazy, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '@/components/clientProcess/api'; // cp.* copy for the office-visits tab
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  List,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Repeat,
  Trash2,
  UserCheck,
  UserX,
  Video,
  X,
} from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import i18n, { registerCopy } from '@/i18n';
import { adminBookingsCopy, bookingCopy } from '@/i18n/pagesBooking';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, StatTile } from '@/components/admin/ui';
import { Tabs } from '@/components/ui/Tabs';
import { Modal } from '@/components/admin/Modal';
import { Drawer } from '@/components/admin/Drawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { errorMessage, fmtDateTime, waLink } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { BOOKING_STATUS_TONE, browserTimeZone, fmtTime, useDayLabels, zoned, type BookingStatus, type Topic } from '@/components/booking/time';

registerCopy(bookingCopy);
registerCopy(adminBookingsCopy);

// ─── Types ──────────────────────────────────────────────────────────

interface StaffRef {
  id: string;
  firstName: string;
  lastName: string;
}
interface SlotBooking {
  id: string;
  status: BookingStatus;
  name: string;
  email: string;
  phone: string | null;
  topic: Topic | null;
  message: string | null;
  meetingUrl: string;
  locale: string;
  createdAt: string;
}
interface Slot {
  id: string;
  staffId: string;
  startsAt: string;
  endsAt: string;
  staff: StaffRef;
  booking: SlotBooking | null;
}
interface ListBooking extends SlotBooking {
  slot: { id: string; startsAt: string; endsAt: string; staffId: string; staff: StaffRef };
}
/** What the detail drawer shows: a booking together with its slot. */
interface Selected {
  booking: SlotBooking;
  slot: { startsAt: string; endsAt: string; staff: StaffRef };
}

const DAY = 86400000;
const LENGTHS = [15, 30, 45, 60] as const;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const errText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`adminBookings.errors.${code}`) ? i18n.t(`adminBookings.errors.${code}`) : errorMessage(err, i18n.t('adminBookings.errors.default'));
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = (d: Date) => {
  const s = startOfDay(d);
  const wd = (s.getDay() + 6) % 7; // Monday = 0
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() - wd);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isFree = (s: Slot) => !s.booking || s.booking.status === 'CANCELLED';
const initials = (p: StaffRef) => `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();

// ─── Page ───────────────────────────────────────────────────────────

function ConsultationBookings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const tz = useMemo(browserTimeZone, []);
  const labels = useDayLabels();
  const [view, setView] = useState<'day' | 'week' | 'list'>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | ''>('');
  const [selected, setSelected] = useState<Selected | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const staffQ = useQuery({
    queryKey: ['admin-booking-staff'],
    queryFn: async () => (await api.get<{ staff: (StaffRef & { role: string })[]; canManageOthers: boolean }>('/admin/booking/staff')).data,
    staleTime: 5 * 60_000,
  });
  const canManageOthers = staffQ.data?.canManageOthers ?? false;
  // Staff always see their own calendar; admins default to everyone.
  const staffParam = canManageOthers ? staffFilter || 'all' : undefined;

  const range = useMemo(() => {
    const from = view === 'day' ? startOfDay(anchor) : startOfWeek(anchor);
    return { from, to: addDays(from, view === 'day' ? 1 : 7) };
  }, [anchor, view]);

  const slotsKey = ['admin-booking-slots', range.from.toISOString(), staffParam ?? 'me'] as const;
  const slotsQ = useQuery({
    queryKey: slotsKey,
    queryFn: async () =>
      (await api.get<{ slots: Slot[] }>('/admin/booking/slots', { params: { from: range.from.toISOString(), to: range.to.toISOString(), staffId: staffParam } })).data.slots,
    enabled: view !== 'list',
    refetchInterval: 60_000,
  });

  const listQ = useQuery({
    queryKey: ['admin-booking-list', staffParam ?? 'me', statusFilter],
    queryFn: async () =>
      (
        await api.get<{ bookings: ListBooking[]; summary: { upcoming: number; next24h: number } }>('/admin/booking/bookings', {
          params: { staffId: staffParam, status: statusFilter || undefined, from: new Date(Date.now() - 30 * DAY).toISOString() },
        })
      ).data,
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin-booking-slots'] });
    void qc.invalidateQueries({ queryKey: ['admin-booking-list'] });
  };

  const deleteSlot = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/booking/slots/${id}`),
    onSuccess: () => {
      toast.success(t('adminBookings.slotDeleted'));
      invalidate();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const slots = slotsQ.data ?? [];
  const freeInView = slots.filter((s) => isFree(s) && new Date(s.startsAt).getTime() > Date.now());
  const bookedInView = slots.filter((s) => s.booking && s.booking.status !== 'CANCELLED');

  const bulkDelete = useMutation({
    mutationFn: async () => (await api.post<{ deleted: number }>('/admin/booking/slots/bulk-delete', { ids: freeInView.map((s) => s.id).slice(0, 500) })).data,
    onSuccess: (r) => {
      toast.success(t('adminBookings.deleted', { count: r.deleted }));
      setBulkOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const shift = (dir: -1 | 1) => setAnchor((a) => addDays(a, dir * (view === 'day' ? 1 : 7)));
  const rangeLabel =
    view === 'day'
      ? labels.long(range.from, tz)
      : `${labels.date(range.from, tz)} – ${labels.date(addDays(range.to, -1), tz)}`;

  const days = view === 'day' ? [range.from] : Array.from({ length: 7 }, (_, i) => addDays(range.from, i));
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = zoned(s.startsAt, tz).key;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [slots, tz]);

  const openSlot = (s: Slot) => s.booking && setSelected({ booking: s.booking, slot: s });
  const showStaff = canManageOthers && !staffFilter;

  return (
    <div>
      <PageHead
        title={t('admin.nav.bookings')}
        subtitle={t('adminBookings.subtitle')}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setTplOpen(true)}>
              <Repeat className="size-4" aria-hidden /> {t('adminBookings.template')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" aria-hidden /> {t('adminBookings.addSlot')}
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label={t('adminBookings.tiles.upcoming')} value={listQ.data?.summary.upcoming ?? '—'} icon={CalendarClock} />
        <StatTile label={t('adminBookings.tiles.next24h')} value={listQ.data?.summary.next24h ?? '—'} icon={Clock} tone={(listQ.data?.summary.next24h ?? 0) > 0 ? 'good' : undefined} />
        <StatTile label={t('adminBookings.tiles.free')} value={view === 'list' ? '—' : freeInView.length} icon={CalendarPlus} />
        <StatTile label={t('adminBookings.tiles.booked')} value={view === 'list' ? '—' : bookedInView.length} icon={UserCheck} />
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            variant="pills"
            label={t('admin.nav.bookings')}
            items={(['day', 'week', 'list'] as const).map((v) => ({ key: v, label: t(`adminBookings.views.${v}`), icon: v === 'day' ? CalendarDays : v === 'week' ? CalendarClock : List }))}
            value={view}
            onChange={setView}
          />
          {view !== 'list' && (
            <div className="flex items-center gap-1">
              <button type="button" className="grid size-9 place-items-center rounded-lg border border-line bg-white text-navy-900 hover:border-brand-400" onClick={() => shift(-1)} aria-label={t('adminBookings.prev')}>
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" className="btn-white btn-sm min-h-9 border border-line" onClick={() => setAnchor(new Date())}>
                {t('adminBookings.today')}
              </button>
              <button type="button" className="grid size-9 place-items-center rounded-lg border border-line bg-white text-navy-900 hover:border-brand-400" onClick={() => shift(1)} aria-label={t('adminBookings.next')}>
                <ChevronRight className="size-4" />
              </button>
              <span className="ml-2 text-sm font-semibold text-navy-900">{rangeLabel}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageOthers && (
            <select className="input min-h-9 py-1.5 sm:w-56" aria-label={t('adminBookings.staff')} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
              <option value="">{t('adminBookings.allStaff')}</option>
              {staffQ.data?.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                  {s.id === user?.id ? ` (${t('admin.common.you')})` : ''}
                </option>
              ))}
            </select>
          )}
          {view !== 'list' && freeInView.length > 0 && (
            <button type="button" className="btn-white btn-sm min-h-9 border border-line text-danger" onClick={() => setBulkOpen(true)}>
              <Trash2 className="size-3.5" aria-hidden /> {t('adminBookings.deleteFree')}
            </button>
          )}
        </div>
      </div>

      {view === 'list' ? (
        <BookingList q={listQ} status={statusFilter} setStatus={setStatusFilter} onOpen={setSelected} showStaff={showStaff} tz={tz} />
      ) : slotsQ.isLoading ? (
        <LoadingBlock />
      ) : slotsQ.error ? (
        <ErrorBlock error={slotsQ.error} onRetry={() => slotsQ.refetch()} />
      ) : slots.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={CalendarPlus} title={t('adminBookings.noSlots')}>
            {t('adminBookings.noSlotsText')}
          </EmptyState>
        </div>
      ) : (
        <div className={clsx('grid gap-3', view === 'week' && 'lg:grid-cols-7')}>
          {days.map((d) => {
            const key = localKey(d);
            const list = byDay.get(key) ?? [];
            const isToday = key === localKey(new Date());
            const c = labels.chip(d, tz);
            return (
              <section key={key} className={clsx('min-w-0 overflow-hidden rounded-xl border bg-white', isToday ? 'border-brand-400' : 'border-line')} aria-label={labels.long(d, tz)}>
                <header className={clsx('flex items-baseline gap-2 border-b px-3 py-2', isToday ? 'border-brand-100 bg-brand-50' : 'border-line')}>
                  <span className="text-xs font-semibold text-muted uppercase">{c.weekday}</span>
                  <span className={clsx('font-display text-lg font-bold', isToday ? 'text-brand-700' : 'text-navy-900')}>{c.day}</span>
                  <span className="text-xs text-muted">{c.month}</span>
                  {list.length > 0 && <span className="ml-auto text-[11px] text-muted tabular-nums">{list.filter((s) => !isFree(s)).length}/{list.length}</span>}
                </header>
                <ul className={clsx('p-2', view === 'week' ? 'flex flex-wrap gap-1.5 lg:grid lg:grid-cols-1' : 'space-y-1.5')}>
                  {list.length === 0 && <li className="px-1 py-2 text-xs text-muted">—</li>}
                  {list.map((s) => (
                    <SlotPill key={s.id} slot={s} wide={view === 'day'} showStaff={showStaff} tz={tz} onOpen={() => openSlot(s)} onDelete={() => deleteSlot.mutate(s.id)} deleting={deleteSlot.isPending && deleteSlot.variables === s.id} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <BookingDrawer selected={selected} onClose={() => setSelected(null)} onChanged={invalidate} tz={tz} />
      <AddSlotModal open={addOpen} onClose={() => setAddOpen(false)} onDone={invalidate} staff={canManageOthers ? (staffQ.data?.staff ?? []) : []} defaultStaff={staffFilter || user?.id || ''} />
      <TemplateModal open={tplOpen} onClose={() => setTplOpen(false)} onDone={invalidate} staff={canManageOthers ? (staffQ.data?.staff ?? []) : []} defaultStaff={staffFilter || user?.id || ''} tz={tz} />
      <ConfirmDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onConfirm={() => bulkDelete.mutate()}
        loading={bulkDelete.isPending}
        title={t('adminBookings.deleteFreeTitle')}
        message={t('adminBookings.deleteFreeText', { count: freeInView.length })}
        confirmLabel={t('admin.common.delete')}
      />
    </div>
  );
}

// ─── Calendar pieces ────────────────────────────────────────────────

const SlotPill = ({
  slot,
  wide,
  showStaff,
  tz,
  onOpen,
  onDelete,
  deleting,
}: {
  slot: Slot;
  wide: boolean;
  showStaff: boolean;
  tz: string;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) => {
  const { t } = useTranslation();
  const time = `${fmtTime(slot.startsAt, tz)}${wide ? `–${fmtTime(slot.endsAt, tz)}` : ''}`;
  const past = new Date(slot.startsAt).getTime() < Date.now();
  if (isFree(slot)) {
    return (
      <li className={clsx('group flex min-h-9 min-w-0 items-center gap-1 rounded-lg border border-dashed border-slate-300 pl-2.5 text-xs text-muted', past && 'opacity-50', wide && 'justify-between')}>
        <span className="min-w-0 flex-1 font-semibold tabular-nums">{time}</span>
        {wide && <span className="flex-1 px-2">{t('adminBookings.free')}</span>}
        {showStaff && <span className="rounded bg-surface px-1 text-[10px] font-semibold">{initials(slot.staff)}</span>}
        {!past && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted transition hover:bg-red-50 hover:text-danger"
            aria-label={`${t('adminBookings.deleteSlot')} ${time}`}
            title={t('adminBookings.deleteSlot')}
          >
            {deleting ? <Spinner className="size-3" /> : <X className="size-3.5" />}
          </button>
        )}
      </li>
    );
  }
  const b = slot.booking!;
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className={clsx(
          'flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:brightness-95',
          b.status === 'BOOKED' ? 'bg-brand-600 text-white' : BOOKING_STATUS_TONE[b.status],
        )}
      >
        <span className="shrink-0 font-semibold tabular-nums">{time}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
        {wide && <span className="hidden shrink-0 opacity-80 sm:inline">{t(`bookingCommon.topic.${b.topic ?? 'other'}`)}</span>}
        {showStaff && <span className="shrink-0 rounded bg-black/10 px-1 text-[10px] font-semibold">{initials(slot.staff)}</span>}
        {b.status !== 'BOOKED' && wide && <span className="shrink-0 text-[10px] font-semibold uppercase">{t(`adminBookings.status.${b.status}`)}</span>}
      </button>
    </li>
  );
};

const BookingList = ({
  q,
  status,
  setStatus,
  onOpen,
  showStaff,
  tz,
}: {
  q: { data?: { bookings: ListBooking[] }; isLoading: boolean; error: unknown; refetch: () => unknown };
  status: BookingStatus | '';
  setStatus: (s: BookingStatus | '') => void;
  onOpen: (s: Selected) => void;
  showStaff: boolean;
  tz: string;
}) => {
  const { t } = useTranslation();
  const labels = useDayLabels();
  const items = q.data?.bookings ?? [];
  return (
    <>
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={!status} onClick={() => setStatus('')}>
          {t('adminBookings.allStatuses')}
        </Chip>
        {(['BOOKED', 'DONE', 'NO_SHOW', 'CANCELLED'] as const).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? '' : s)}>
            {t(`adminBookings.status.${s}`)}
          </Chip>
        ))}
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={CalendarClock} title={t('adminBookings.noBookings')} />
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {items.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => onOpen({ booking: b, slot: b.slot })} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface sm:px-5">
                <span className="w-24 shrink-0 sm:w-36">
                  <span className="block text-xs font-semibold text-navy-900">{labels.date(b.slot.startsAt, tz)}</span>
                  <span className="block text-xs text-muted tabular-nums">
                    {fmtTime(b.slot.startsAt, tz)}–{fmtTime(b.slot.endsAt, tz)}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-navy-900">{b.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {t(`bookingCommon.topic.${b.topic ?? 'other'}`)} · {b.email}
                    {showStaff && ` · ${b.slot.staff.firstName} ${b.slot.staff.lastName}`}
                  </span>
                </span>
                <span className={clsx('badge shrink-0', BOOKING_STATUS_TONE[b.status])}>{t(`adminBookings.status.${b.status}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

// ─── Booking detail ─────────────────────────────────────────────────

const BookingDrawer = ({ selected, onClose, onChanged, tz }: { selected: Selected | null; onClose: () => void; onChanged: () => void; tz: string }) => {
  const { t } = useTranslation();
  const labels = useDayLabels();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [message, setMessage] = useState('');
  const b = selected?.booking;
  const started = selected ? new Date(selected.slot.startsAt).getTime() <= Date.now() : false;

  const setStatus = useMutation({
    mutationFn: async (status: BookingStatus) => api.patch(`/admin/booking/bookings/${b!.id}`, { status }),
    onSuccess: () => {
      toast.success(t('adminBookings.detail.updated'));
      onChanged();
      onClose();
    },
    onError: (e) => toast.error(errText(e)),
  });
  const cancel = useMutation({
    mutationFn: async () => api.post(`/admin/booking/bookings/${b!.id}/cancel`, { message: message.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('adminBookings.detail.cancelled'));
      setCancelOpen(false);
      setMessage('');
      onChanged();
      onClose();
    },
    onError: (e) => toast.error(errText(e)),
  });

  return (
    <>
      <Drawer
        open={!!selected}
        onClose={onClose}
        title={t('adminBookings.detail.title')}
        footer={
          b && b.status !== 'CANCELLED' ? (
            <div className="flex w-full flex-wrap justify-end gap-2">
              {b.status === 'BOOKED' ? (
                <>
                  <button type="button" className="btn-secondary btn-sm" disabled={!started || setStatus.isPending} title={!started ? t('adminBookings.detail.notStarted') : undefined} onClick={() => setStatus.mutate('NO_SHOW')}>
                    <UserX className="size-4" aria-hidden /> {t('adminBookings.detail.markNoShow')}
                  </button>
                  <button type="button" className="btn-secondary btn-sm" disabled={!started || setStatus.isPending} title={!started ? t('adminBookings.detail.notStarted') : undefined} onClick={() => setStatus.mutate('DONE')}>
                    <UserCheck className="size-4" aria-hidden /> {t('adminBookings.detail.markDone')}
                  </button>
                  {!started && (
                    <button type="button" className="btn-danger btn-sm" onClick={() => setCancelOpen(true)}>
                      <X className="size-4" aria-hidden /> {t('adminBookings.detail.cancel')}
                    </button>
                  )}
                </>
              ) : (
                <button type="button" className="btn-secondary btn-sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate('BOOKED')}>
                  {t('adminBookings.detail.reopen')}
                </button>
              )}
            </div>
          ) : undefined
        }
      >
        {selected && b && (
          <div className="space-y-5">
            <div className="rounded-xl bg-navy-900 p-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold">{labels.long(selected.slot.startsAt, tz)}</p>
                  <p className="text-sm text-white/80 tabular-nums">
                    {fmtTime(selected.slot.startsAt, tz)}–{fmtTime(selected.slot.endsAt, tz)} · Bakı {fmtTime(selected.slot.startsAt, 'Asia/Baku')} · Berlin {fmtTime(selected.slot.startsAt, 'Europe/Berlin')}
                  </p>
                  <p className="mt-1 text-xs text-white/60">
                    {selected.slot.staff.firstName} {selected.slot.staff.lastName}
                  </p>
                </div>
                <span className={clsx('badge shrink-0', BOOKING_STATUS_TONE[b.status])}>{t(`adminBookings.status.${b.status}`)}</span>
              </div>
              {b.status === 'BOOKED' && (
                <a href={b.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm mt-4 w-full">
                  <Video className="size-4" aria-hidden /> {t('adminBookings.detail.open')} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </div>

            <section>
              <h3 className="mb-2 text-xs font-semibold text-muted uppercase">{t('adminBookings.detail.contact')}</h3>
              <p className="text-base font-semibold text-navy-900">{b.name}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`mailto:${b.email}`} className="btn-secondary btn-sm">
                  <Mail className="size-3.5" aria-hidden /> {b.email}
                </a>
                {b.phone && (
                  <>
                    <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="btn-secondary btn-sm">
                      <Phone className="size-3.5" aria-hidden /> {b.phone}
                    </a>
                    <a href={waLink(b.phone)} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                      <MessageCircle className="size-3.5" aria-hidden /> WhatsApp
                    </a>
                  </>
                )}
              </div>
            </section>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-surface p-3">
                <dt className="text-[11px] text-muted">{t('adminBookings.detail.topic')}</dt>
                <dd className="font-semibold text-navy-900">{t(`bookingCommon.topic.${b.topic ?? 'other'}`)}</dd>
              </div>
              <div className="rounded-lg bg-surface p-3">
                <dt className="text-[11px] text-muted">{t('adminBookings.detail.language')}</dt>
                <dd className="font-semibold text-navy-900 uppercase">{b.locale}</dd>
              </div>
              <div className="col-span-2 rounded-lg bg-surface p-3">
                <dt className="text-[11px] text-muted">{t('adminBookings.detail.booked')}</dt>
                <dd className="font-semibold text-navy-900">{fmtDateTime(b.createdAt)}</dd>
              </div>
            </dl>

            {b.message && (
              <section>
                <h3 className="mb-2 text-xs font-semibold text-muted uppercase">{t('adminBookings.detail.message')}</h3>
                <p className="rounded-lg border border-line p-3 text-sm whitespace-pre-line text-ink">{b.message}</p>
              </section>
            )}
            {b.status === 'BOOKED' && !started && <p className="text-xs text-muted">{t('adminBookings.detail.notStarted')}</p>}
          </div>
        )}
      </Drawer>

      <Modal
        open={cancelOpen}
        onClose={() => !cancel.isPending && setCancelOpen(false)}
        size="sm"
        title={t('adminBookings.detail.cancelTitle')}
        description={t('adminBookings.detail.cancelText')}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setCancelOpen(false)} disabled={cancel.isPending}>
              {t('admin.common.close')}
            </button>
            <button type="button" className="btn-danger btn-sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending && <Spinner className="size-3.5" />}
              {t('adminBookings.detail.cancel')}
            </button>
          </>
        }
      >
        <label className="label" htmlFor="ab-cancel-msg">{t('adminBookings.detail.cancelMessage')}</label>
        <textarea id="ab-cancel-msg" className="input resize-y" rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Modal>
    </>
  );
};

// ─── Creating slots ─────────────────────────────────────────────────

const StaffSelect = ({ staff, value, onChange }: { staff: StaffRef[]; value: string; onChange: (v: string) => void }) => {
  const { t } = useTranslation();
  if (!staff.length) return null;
  return (
    <div>
      <label className="label" htmlFor="slot-staff">{t('adminBookings.staff')}</label>
      <select id="slot-staff" className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.firstName} {s.lastName}
          </option>
        ))}
      </select>
    </div>
  );
};

const LengthSelect = ({ value, onChange, id }: { value: number; onChange: (v: number) => void; id: string }) => {
  const { t } = useTranslation();
  return (
    <div>
      <label className="label" htmlFor={id}>{t('adminBookings.form.length')}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {LENGTHS.map((l) => (
          <option key={l} value={l}>
            {t('adminBookings.form.minutes', { count: l })}
          </option>
        ))}
      </select>
    </div>
  );
};

const AddSlotModal = ({ open, onClose, onDone, staff, defaultStaff }: { open: boolean; onClose: () => void; onDone: () => void; staff: StaffRef[]; defaultStaff: string }) => {
  const { t } = useTranslation();
  const [date, setDate] = useState(() => localKey(addDays(new Date(), 1)));
  const [time, setTime] = useState('10:00');
  const [minutes, setMinutes] = useState(30);
  const [staffId, setStaffId] = useState('');
  const m = useMutation({
    mutationFn: async () =>
      api.post('/admin/booking/slots', {
        startsAt: new Date(`${date}T${time}:00`).toISOString(),
        minutes,
        staffId: staff.length ? staffId || defaultStaff : undefined,
      }),
    onSuccess: () => {
      toast.success(t('adminBookings.form.created'));
      onDone();
      // keep the modal open for quickly adding the next time
      const [h, mi] = time.split(':').map(Number);
      const next = h * 60 + mi + minutes;
      if (next < 24 * 60) setTime(`${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`);
    },
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('adminBookings.addSlot')}
      description={t('adminBookings.form.browserTz', { tz: browserTimeZone() })}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('adminBookings.form.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => m.mutate()} disabled={m.isPending || !date || !time}>
            {m.isPending && <Spinner className="size-3.5" />}
            {t('adminBookings.form.save')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <StaffSelect staff={staff} value={staffId || defaultStaff} onChange={setStaffId} />
        </div>
        <div>
          <label className="label" htmlFor="slot-date">{t('adminBookings.form.date')}</label>
          <input id="slot-date" type="date" className="input" value={date} min={localKey(new Date())} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="slot-time">{t('adminBookings.form.time')}</label>
          <input id="slot-time" type="time" step={300} className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <LengthSelect id="slot-len" value={minutes} onChange={setMinutes} />
        </div>
      </div>
    </Modal>
  );
};

type DayTpl = { on: boolean; ranges: { from: string; to: string }[] };
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

const TemplateModal = ({
  open,
  onClose,
  onDone,
  staff,
  defaultStaff,
  tz,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  staff: StaffRef[];
  defaultStaff: string;
  tz: string;
}) => {
  const { t } = useTranslation();
  const weekdays = t('bookingCommon.weekdays', { returnObjects: true }) as string[];
  const [staffId, setStaffId] = useState('');
  const [timeZone, setTimeZone] = useState(tz);
  const [minutes, setMinutes] = useState(30);
  const [gap, setGap] = useState(0);
  const [weeks, setWeeks] = useState(4);
  const [startDate, setStartDate] = useState(() => localKey(new Date()));
  const [days, setDays] = useState<Record<number, DayTpl>>(() =>
    Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((d) => [
        d,
        { on: d >= 1 && d <= 5, ranges: [{ from: '10:00', to: '13:00' }, { from: '14:00', to: '17:00' }] },
      ]),
    ),
  );
  const zones = Array.from(new Set([tz, 'Asia/Baku', 'Europe/Berlin']));

  const selectedDays = WEEK_ORDER.filter((d) => days[d].on);
  const preview = selectedDays.reduce(
    (acc, d) => acc + days[d].ranges.reduce((a, r) => a + Math.max(0, Math.floor((toMin(r.to) - toMin(r.from) + gap) / (minutes + gap))), 0),
    0,
  ) * weeks;

  const update = (d: number, fn: (x: DayTpl) => DayTpl) => setDays((all) => ({ ...all, [d]: fn(all[d]) }));

  const m = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ created: number; skipped: number }>('/admin/booking/slots/template', {
          staffId: staff.length ? staffId || defaultStaff : undefined,
          timeZone,
          minutes,
          gapMinutes: gap,
          weeks,
          startDate,
          days: selectedDays.map((d) => ({ weekday: d, ranges: days[d].ranges })),
        })
      ).data,
    onSuccess: (r) => {
      toast.success(t('adminBookings.tpl.result', r));
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errText(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('adminBookings.tpl.title')}
      description={t('adminBookings.tpl.description')}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-muted">{selectedDays.length ? t('adminBookings.tpl.preview', { count: preview }) : t('adminBookings.tpl.pickDay')}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('adminBookings.form.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!selectedDays.length || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Spinner className="size-3.5" />}
            {t('adminBookings.tpl.generate')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {staff.length > 0 && (
          <div className="sm:col-span-2 lg:col-span-3">
            <StaffSelect staff={staff} value={staffId || defaultStaff} onChange={setStaffId} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="tpl-tz">{t('adminBookings.form.timeZone')}</label>
          <select id="tpl-tz" className="input" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z === tz ? t('adminBookings.form.browserTz', { tz: z }) : z}
              </option>
            ))}
          </select>
        </div>
        <LengthSelect id="tpl-len" value={minutes} onChange={setMinutes} />
        <div>
          <label className="label" htmlFor="tpl-gap">{t('adminBookings.tpl.gap')}</label>
          <input id="tpl-gap" type="number" min={0} max={120} step={5} className="input" value={gap} onChange={(e) => setGap(Math.max(0, Math.min(120, Number(e.target.value) || 0)))} />
        </div>
        <div>
          <label className="label" htmlFor="tpl-start">{t('adminBookings.tpl.startDate')}</label>
          <input id="tpl-start" type="date" className="input" value={startDate} min={localKey(new Date())} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="tpl-weeks">{t('adminBookings.tpl.weeks')}</label>
          <input id="tpl-weeks" type="number" min={1} max={12} className="input" value={weeks} onChange={(e) => setWeeks(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
        </div>
      </div>

      <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
        {WEEK_ORDER.map((d) => {
          const day = days[d];
          return (
            <li key={d} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start">
              <label className="flex min-h-9 w-44 shrink-0 cursor-pointer items-center gap-2.5 text-sm font-semibold text-navy-900">
                <input type="checkbox" className="size-4 accent-brand-600" checked={day.on} onChange={(e) => update(d, (x) => ({ ...x, on: e.target.checked }))} />
                {weekdays[d]}
              </label>
              {day.on && (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {day.ranges.map((r, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
                      <input type="time" step={300} aria-label={t('adminBookings.tpl.from')} className="rounded-md border-0 bg-white px-1.5 py-1 text-xs tabular-nums" value={r.from} onChange={(e) => update(d, (x) => ({ ...x, ranges: x.ranges.map((y, j) => (j === i ? { ...y, from: e.target.value } : y)) }))} />
                      <span className="text-xs text-muted">–</span>
                      <input type="time" step={300} aria-label={t('adminBookings.tpl.to')} className="rounded-md border-0 bg-white px-1.5 py-1 text-xs tabular-nums" value={r.to} onChange={(e) => update(d, (x) => ({ ...x, ranges: x.ranges.map((y, j) => (j === i ? { ...y, to: e.target.value } : y)) }))} />
                      {day.ranges.length > 1 && (
                        <button type="button" className="grid size-7 place-items-center rounded-md text-muted hover:bg-red-50 hover:text-danger" aria-label={t('adminBookings.tpl.removeRange')} onClick={() => update(d, (x) => ({ ...x, ranges: x.ranges.filter((_, j) => j !== i) }))}>
                          <X className="size-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                  {day.ranges.length < 6 && (
                    <button type="button" className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-600 hover:bg-brand-50" onClick={() => update(d, (x) => ({ ...x, ranges: [...x.ranges, { from: '15:00', to: '16:00' }] }))}>
                      <Plus className="size-3.5" aria-hidden /> {t('adminBookings.tpl.addRange')}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
};

// Office visits (client portal bookings) live in their own tab: ConsultationSlot kind OFFICE (lib/clientProcess/office).
const OfficeVisitsAdmin = lazy(() => import('@/components/clientProcess/OfficeVisitsAdmin'));

export default function AdminBookings() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'office' ? 'office' : 'online';
  return (
    <div>
      <Tabs
        className="mb-4"
        label={t('admin.nav.bookings')}
        items={(['online', 'office'] as const).map((k) => ({ key: k, label: t(k === 'office' ? 'cp.office.tab' : 'cp.office.tabOnline') }))}
        value={tab}
        onChange={(k) => setParams(k === 'office' ? { tab: 'office' } : {}, { replace: true })}
      />
      {tab === 'office' ? (
        <Suspense fallback={<LoadingBlock />}>
          <OfficeVisitsAdmin />
        </Suspense>
      ) : (
        <ConsultationBookings />
      )}
    </div>
  );
}
