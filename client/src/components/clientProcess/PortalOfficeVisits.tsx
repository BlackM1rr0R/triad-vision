import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { CalendarPlus, MapPin, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { cpKeys, useCpError, VISIT_REASONS, type OfficeSlot, type OfficeVisit, type VisitReason } from './api';

const STATUS_TONE: Record<OfficeVisit['status'], string> = {
  BOOKED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-100 text-slate-500',
  DONE: 'bg-sky-100 text-sky-800',
  NO_SHOW: 'bg-red-100 text-red-700',
};

/** Free office slots, grouped per day; `onPick(slotId)`. */
const SlotPicker = ({ selected, onPick }: { selected: string | null; onPick: (id: string) => void }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const { data, isLoading } = useQuery({
    queryKey: cpKeys.officeSlots,
    queryFn: async () => (await api.get<{ slots: OfficeSlot[] }>('/client-process/office/slots')).data.slots,
  });
  if (isLoading) return <p className="text-sm text-muted">…</p>;
  if (!data?.length) return <p className="rounded-xl border border-line bg-slate-50 px-4 py-3 text-sm text-muted">{t('cp.office.noSlots')}</p>;
  const days = new Map<string, OfficeSlot[]>();
  for (const s of data) {
    const k = date(s.startsAt, { weekday: 'short', day: 'numeric', month: 'short' });
    days.set(k, [...(days.get(k) ?? []), s]);
  }
  return (
    <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
      {[...days.entries()].map(([day, slots]) => (
        <div key={day}>
          <p className="mb-1.5 text-xs font-bold text-muted uppercase">{day}</p>
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                aria-pressed={selected === s.id}
                className={clsx('min-h-10 rounded-lg border px-3 text-sm font-semibold transition', selected === s.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-navy-900 hover:border-brand-400')}
                title={s.location ?? ''}
              >
                {date(s.startsAt, { hour: '2-digit', minute: '2-digit' })}
                <span className={clsx('ml-1.5 text-xs font-medium', selected === s.id ? 'text-white/80' : 'text-muted')}>{t('cp.office.free', { count: s.free })}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/** "Ofisə gəliş təyin et" on the client's case page: book, see, cancel, reschedule, add to calendar. */
export const PortalOfficeVisits = ({ caseId, closed }: { caseId: string; closed?: boolean }) => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const qc = useQueryClient();
  const onError = useCpError();
  const [mode, setMode] = useState<null | { kind: 'book' } | { kind: 'move'; visitId: string }>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [reason, setReason] = useState<VisitReason>('originals');
  const [message, setMessage] = useState('');
  const { data } = useQuery({
    queryKey: cpKeys.visits(caseId),
    queryFn: async () => (await api.get<{ visits: OfficeVisit[] }>('/client-process/office/visits', { params: { caseId } })).data.visits,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: cpKeys.visits(caseId) });
    void qc.invalidateQueries({ queryKey: cpKeys.officeSlots });
    void qc.invalidateQueries({ queryKey: ['case', caseId] });
  };
  const close = () => {
    setMode(null);
    setSlotId(null);
    setMessage('');
  };
  const book = useMutation({
    mutationFn: () => api.post('/client-process/office/visits', { caseId, slotId, reason, ...(message.trim() ? { message: message.trim() } : {}) }),
    onSuccess: () => {
      toast.success(t('cp.office.booked'));
      close();
      refresh();
    },
    onError: (e) => {
      onError(e);
      void qc.invalidateQueries({ queryKey: cpKeys.officeSlots });
    },
  });
  const move = useMutation({
    mutationFn: (visitId: string) => api.post(`/client-process/office/visits/${visitId}/reschedule`, { slotId }),
    onSuccess: () => {
      toast.success(t('cp.office.rescheduled'));
      close();
      refresh();
    },
    onError,
  });
  const cancel = useMutation({
    mutationFn: (visitId: string) => api.post(`/client-process/office/visits/${visitId}/cancel`),
    onSuccess: () => {
      toast.success(t('cp.office.cancelled'));
      refresh();
    },
    onError,
  });

  const visits = data ?? [];
  const now = Date.now();
  const upcoming = visits.filter((v) => v.status === 'BOOKED' && new Date(v.endsAt).getTime() > now);
  const past = visits.filter((v) => !upcoming.includes(v)).slice(0, 5);
  if (closed && !visits.length) return null;

  return (
    <section id="office-visits" className="card scroll-mt-24 p-5 sm:p-6" aria-labelledby="office-visits-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="office-visits-title" className="flex items-center gap-2 text-lg font-extrabold text-navy-900">
            <Store className="size-5 text-brand-600" aria-hidden /> {t('cp.office.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('cp.office.subtitle')}</p>
        </div>
        {!closed && !mode && (
          <button type="button" className="btn-primary btn-sm w-full sm:w-auto" onClick={() => setMode({ kind: 'book' })}>
            <CalendarPlus className="size-4" aria-hidden /> {t('cp.office.book')}
          </button>
        )}
      </div>

      {mode && (
        <form
          className="mt-4 space-y-4 rounded-xl border border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!slotId) return;
            if (mode.kind === 'move') move.mutate(mode.visitId);
            else book.mutate();
          }}
        >
          {mode.kind === 'book' && (
            <fieldset>
              <legend className="label">{t('cp.office.reason')}</legend>
              <div className="flex flex-wrap gap-2">
                {VISIT_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    aria-pressed={reason === r}
                    className={clsx('min-h-10 rounded-full border px-3.5 text-sm font-semibold', reason === r ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-card text-navy-900')}
                  >
                    {t(`cp.office.reasons.${r}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div>
            <p className="label">{t('cp.office.pick')}</p>
            <SlotPicker selected={slotId} onPick={setSlotId} />
          </div>
          {mode.kind === 'book' && (
            <label className="block">
              <span className="label">{t('cp.office.message')}</span>
              <textarea className="input min-h-16" value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} placeholder={reason === 'other' ? t('cp.office.messageRequired') : ''} />
            </label>
          )}
          <p className="text-xs text-muted">{t('cp.office.bring')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary btn-sm" disabled={!slotId || book.isPending || move.isPending || (mode.kind === 'book' && reason === 'other' && !message.trim())}>
              {t('cp.office.confirm')}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={close}>
              {t('cp.office.close')}
            </button>
          </div>
        </form>
      )}

      {visits.length === 0 && !mode && <p className="mt-4 text-sm text-muted">{t('cp.office.none')}</p>}
      {[...upcoming, ...past].length > 0 && (
        <ul className="mt-4 space-y-3">
          {[...upcoming, ...past].map((v) => (
            <li key={v.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-navy-900">{dateTime(v.startsAt)}</p>
                <span className={clsx('badge', STATUS_TONE[v.status])}>{t(`cp.office.status.${v.status}`)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{t(`cp.office.reasons.${v.reason}`)}</p>
              {v.location && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted">
                  <MapPin className="size-4 shrink-0" aria-hidden /> {v.location}
                </p>
              )}
              {v.canCancel && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <a className="btn-outline btn-sm" href={`/api/client-process/office/visits/${v.id}/ics`}>
                    <CalendarPlus className="size-4" aria-hidden /> {t('cp.office.ics')}
                  </a>
                  <button type="button" className="btn-outline btn-sm" onClick={() => setMode({ kind: 'move', visitId: v.id })}>
                    {t('cp.office.reschedule')}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm text-red-600"
                    disabled={cancel.isPending}
                    onClick={() => {
                      if (window.confirm(t('cp.office.cancelConfirm'))) cancel.mutate(v.id);
                    }}
                  >
                    {t('cp.office.cancel')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
