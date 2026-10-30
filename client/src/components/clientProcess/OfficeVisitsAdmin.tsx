import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { CalendarDays, MapPin, Plus, Store, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { Modal } from '@/components/admin/Modal';
import { fmtDateTime } from '@/components/admin/labels';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { cpKeys, useCpError, type VisitReason } from './api';
import { confirmDialog } from '@/components/ui/ConfirmHost';

type Office = { index: number; city: string; address: string };
type DayVisit = {
  id: string;
  caseId: string | null;
  caseNumber: string | null;
  status: 'BOOKED' | 'CANCELLED' | 'DONE' | 'NO_SHOW';
  reason: VisitReason;
  message: string | null;
  startsAt: string;
  endsAt: string;
  location: string | null;
  client: { id: string | null; name: string; email: string };
  phone: string | null;
  staff: { id: string; name: string };
};
type SlotGroup = { id: string; staff: { id: string; firstName: string; lastName: string }; startsAt: string; endsAt: string; location: string | null; capacity: number; visits: { id: string; name: string; reason: VisitReason; case: { id: string; number: string } | null }[] };

const bakuDay = (d = new Date()) => new Date(d.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);
const STATUS_TONE: Record<DayVisit['status'], string> = toneClasses(STATUS_TONES.officeVisit);

const CreateModal = ({ open, onClose, offices }: { open: boolean; onClose: () => void; offices: Office[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useCpError('admin');
  const [mode, setMode] = useState<'single' | 'template'>('single');
  const [date, setDate] = useState(bakuDay(new Date(Date.now() + 86400000)));
  const [time, setTime] = useState('10:00');
  const [minutes, setMinutes] = useState(30);
  const [capacity, setCapacity] = useState(1);
  const [officeIndex, setOfficeIndex] = useState(offices[0]?.index ?? 0);
  const [weeks, setWeeks] = useState(4);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [from, setFrom] = useState('10:00');
  const [to, setTo] = useState('13:00');
  const days = t('cp.office.weekdayShort', { returnObjects: true }) as string[];
  const create = useMutation({
    mutationFn: async () => {
      if (mode === 'single') {
        const startsAt = new Date(`${date}T${time}:00+04:00`).toISOString();
        return (await api.post<{ created: number }>('/admin/client-process/office/slots', { startsAt, minutes, capacity, officeIndex })).data;
      }
      return (
        await api.post<{ created: number }>('/admin/client-process/office/slots/template', {
          timeZone: 'Asia/Baku',
          minutes,
          capacity,
          officeIndex,
          weeks,
          days: weekdays.map((weekday) => ({ weekday, ranges: [{ from, to }] })),
        })
      ).data;
    },
    onSuccess: (r) => {
      toast.success(t('cp.office.createdN', { count: mode === 'single' ? 1 : r.created }));
      void qc.invalidateQueries({ queryKey: cpKeys.officeAdmin });
      onClose();
    },
    onError,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cp.office.create')}
      footer={
        <button type="button" className="btn-primary btn-sm" disabled={create.isPending || !offices.length || (mode === 'template' && !weekdays.length)} onClick={() => create.mutate()}>
          {t('cp.office.createBtn')}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['single', 'template'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={clsx('min-h-9 rounded-full border px-3 text-xs font-semibold', mode === m ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line')}>
              {t(`cp.office.${m}`)}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="label">{t('cp.office.officeLabel')}</span>
          <select className="input" value={officeIndex} onChange={(e) => setOfficeIndex(Number(e.target.value))}>
            {offices.map((o) => (
              <option key={o.index} value={o.index}>
                {o.city ? `${o.city} · ` : ''}
                {o.address}
              </option>
            ))}
          </select>
        </label>
        {mode === 'single' ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">{t('cp.office.date')}</span>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">{t('cp.office.time')}</span>
              <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
        ) : (
          <>
            <div>
              <p className="label">{t('cp.office.weekdays')}</p>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button key={d} type="button" aria-pressed={weekdays.includes(d)} onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))} className={clsx('min-h-9 min-w-10 rounded-lg border px-2 text-xs font-semibold', weekdays.includes(d) ? 'border-primary bg-primary/[0.06] text-link' : 'border-line')}>
                    {days[d]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="label">{t('cp.office.from')}</span>
                <input type="time" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">{t('cp.office.to')}</span>
                <input type="time" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">{t('cp.office.weeks')}</span>
                <input type="number" min={1} max={12} className="input" value={weeks} onChange={(e) => setWeeks(Math.min(12, Math.max(1, Number(e.target.value) || 1)))} />
              </label>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">{t('cp.office.minutes')}</span>
            <select className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('cp.office.capacity')}</span>
            <input type="number" min={1} max={10} className="input" value={capacity} onChange={(e) => setCapacity(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
          </label>
        </div>
      </div>
    </Modal>
  );
};

/** Admin → Bookings → "Office visits": office slots with seats, the day's visits, done / no-show / cancel. */
export default function OfficeVisitsAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useCpError('admin');
  const [day, setDay] = useState(bakuDay());
  const [createOpen, setCreateOpen] = useState(false);
  const offices = useQuery({ queryKey: [...cpKeys.officeAdmin, 'offices'], queryFn: async () => (await api.get<{ offices: Office[] }>('/admin/client-process/offices')).data.offices, staleTime: 5 * 60_000 });
  const visits = useQuery({ queryKey: [...cpKeys.officeAdmin, 'visits', day], queryFn: async () => (await api.get<{ visits: DayVisit[] }>('/admin/client-process/office/visits', { params: { day } })).data.visits });
  const slots = useQuery({ queryKey: [...cpKeys.officeAdmin, 'slots'], queryFn: async () => (await api.get<{ slots: SlotGroup[] }>('/admin/client-process/office/slots')).data.slots });
  const refresh = () => void qc.invalidateQueries({ queryKey: cpKeys.officeAdmin });
  const mark = useMutation({ mutationFn: ({ id, status }: { id: string; status: 'DONE' | 'NO_SHOW' }) => api.patch(`/admin/booking/bookings/${id}`, { status }), onSuccess: refresh, onError });
  const cancel = useMutation({ mutationFn: ({ id, message }: { id: string; message: string }) => api.post(`/admin/client-process/office/visits/${id}/cancel`, message ? { message } : {}), onSuccess: refresh, onError });
  const removeSlot = useMutation({ mutationFn: (id: string) => api.delete(`/admin/client-process/office/slots/${id}`), onSuccess: () => { toast.success(t('cp.office.deleted')); refresh(); }, onError });
  const upcoming = useMemo(() => (slots.data ?? []).filter((s) => new Date(s.endsAt).getTime() > Date.now()), [slots.data]);

  return (
    <div className="space-y-6">
      <PageHead
        title={t('cp.office.tab')}
        subtitle={t('cp.office.subtitle')}
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)} disabled={!offices.data?.length}>
            <Plus className="size-4" aria-hidden /> {t('cp.office.create')}
          </button>
        }
      />
      {offices.data && !offices.data.length && <p className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg">{t('cp.office.noOffices')}</p>}

      <Panel
        title={t('cp.office.visitsOfDay')}
        icon={CalendarDays}
        actions={
          <label className="flex items-center gap-2 text-xs">
            <span className="sr-only">{t('cp.office.day')}</span>
            <input type="date" className="input min-h-9 py-1" value={day} onChange={(e) => setDay(e.target.value || bakuDay())} />
          </label>
        }
      >
        {visits.isLoading ? (
          <LoadingBlock />
        ) : !visits.data?.length ? (
          <p className="text-sm text-muted">{t('cp.office.noVisits')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {visits.data.map((v) => {
              const started = new Date(v.startsAt).getTime() <= Date.now();
              return (
                <li key={v.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <p className="w-32 shrink-0 text-sm font-bold text-ink">{fmtDateTime(v.startsAt)}</p>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold break-words text-ink">
                      {v.client.name}
                      <span className={clsx('badge ml-2', STATUS_TONE[v.status])}>{t(`cp.office.status.${v.status}`)}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {t(`cp.office.reasons.${v.reason}`)}
                      {v.message && ` · ${v.message}`} · {v.staff.name}
                      {v.phone && ` · ${v.phone}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {v.caseId && (
                      <Link to={`/admin/cases/${v.caseId}`} className="btn-secondary btn-sm">
                        {v.caseNumber ?? t('cp.office.openCase')}
                      </Link>
                    )}
                    {v.status === 'BOOKED' && (
                      <>
                        <button type="button" className="btn-secondary btn-sm" disabled={!started} onClick={() => mark.mutate({ id: v.id, status: 'DONE' })}>
                          {t('cp.office.done')}
                        </button>
                        <button type="button" className="btn-secondary btn-sm" disabled={!started} onClick={() => mark.mutate({ id: v.id, status: 'NO_SHOW' })}>
                          {t('cp.office.noShow')}
                        </button>
                        {!started && (
                          <button
                            type="button"
                            className="btn-secondary btn-sm text-danger-fg"
                            onClick={() => {
                              const message = window.prompt(t('cp.office.cancelMessage')) ;
                              if (message !== null) cancel.mutate({ id: v.id, message: message.trim() });
                            }}
                          >
                            {t('cp.office.cancelVisit')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title={t('cp.office.slots')} icon={Store}>
        {slots.isLoading ? (
          <LoadingBlock />
        ) : !upcoming.length ? (
          <EmptyState icon={Store} title={t('cp.office.noSlotsStaff')} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((s) => (
              <li key={s.id} className="rounded-lg border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">{fmtDateTime(s.startsAt)}</p>
                    <p className="text-xs text-muted">
                      {s.staff.firstName} {s.staff.lastName} · {t('cp.office.seats', { booked: s.visits.length, capacity: s.capacity })}
                    </p>
                    {s.location && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                        <MapPin className="size-3 shrink-0" aria-hidden /> <span className="truncate">{s.location}</span>
                      </p>
                    )}
                  </div>
                  {s.visits.length < s.capacity && (
                    <button type="button" className="btn-secondary btn-sm text-danger-fg" aria-label={t('cp.office.deleteFree')} title={t('cp.office.deleteFree')} onClick={async () => (await confirmDialog({ title: t('cp.office.deleteFree'), message: t('ui.confirmDlg.deleteNamed', { name: `${fmtDateTime(s.startsAt)} · ${s.staff.firstName} ${s.staff.lastName}` }), confirmLabel: t('ui.confirmDlg.delete') })) && removeSlot.mutate(s.id)}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
                {s.visits.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {s.visits.map((v) => (
                      <li key={v.id} className="truncate text-ink">
                        {v.case ? <Link to={`/admin/cases/${v.case.id}`} className="font-semibold hover:text-link">{v.name}</Link> : v.name} · {t(`cp.office.reasons.${v.reason}`)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {offices.data && <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} offices={offices.data} />}
    </div>
  );
}
