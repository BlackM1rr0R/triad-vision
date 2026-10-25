import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Clock, Loader2, Plus, X } from 'lucide-react';
import { PeopleList, Popover } from '@/components/tasks/bits';
import { CaseField } from '@/components/tasks/pickers';
import type { CaseRef } from '@/components/tasks/types';
import { Avatar, Field, Modal } from '@/components/chat/bits';
import { calendarApi, useFreeBusy } from './api';
import type { EventColor, EventDto, EventInput, Person, Visibility } from './types';
import { EVENT_COLORS } from './types';
import { DAY, EMPTY_RECURRENCE, MIN, REMINDER_OPTIONS, TONES, WEEKDAY_CODES, addDays, buildRRule, errorText, fmtTime, fromInputs, fullName, parseDayKey, parseRecurrence, roundTo, startOfDay, toDateInput, toTimeInput, userColor, weekdayShort, type RecurrenceForm } from './utils';

export interface DialogInitial {
  event?: EventDto | null;
  start?: Date;
  end?: Date;
  allDay?: boolean;
}

const PRESETS: RecurrenceForm['freq'][] = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

/** Busy timeline of the attendees (and me) on the start day; clicking a free slot moves the start there. */
const FindTime = ({ day, users, people, meId, onPick }: { day: Date; users: string[]; people: Person[]; meId: string; onPick: (start: Date) => void }) => {
  const { t } = useTranslation();
  const from = startOfDay(day);
  const to = addDays(from, 1);
  const ids = useMemo(() => [...new Set([meId, ...users])], [meId, users]);
  const fb = useFreeBusy(from, to, ids);
  const pct = (d: Date) => (Math.max(0, Math.min(DAY, d.getTime() - from.getTime())) / DAY) * 100;
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="mb-2 text-xs text-muted">{t('calendar.findTime.hint')}</p>
      <div className="relative ml-28">
        <div className="flex justify-between text-[0.55rem] text-muted">
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h}>{String(h).padStart(2, '0')}:00</span>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {ids.map((id) => {
          const u = fb.data?.find((x) => x.userId === id);
          const p = people.find((x) => x.id === id);
          return (
            <div key={id} className="flex items-center gap-2">
              <span className="w-26 truncate text-xs text-ink">{id === meId ? t('calendar.findTime.you') : fullName(p ?? u)}</span>
              <div
                role="button"
                tabIndex={0}
                className="relative h-6 flex-1 cursor-crosshair overflow-hidden rounded-md bg-success-bg"
                title={t('calendar.findTime.free')}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const minutes = Math.round((((e.clientX - r.left) / r.width) * 24 * 60) / 30) * 30;
                  onPick(new Date(from.getTime() + minutes * MIN));
                }}
              >
                {fb.isLoading && <Loader2 className="absolute top-1 left-1 size-4 animate-spin text-muted" />}
                {(u?.busy ?? []).map((b, i) => {
                  const s = new Date(b.start);
                  const e = new Date(b.end);
                  const left = pct(s);
                  const width = Math.max(0.8, pct(e) - left);
                  return <span key={i} className={clsx('absolute inset-y-0 rounded-sm', b.source === 'event' ? TONES[userColor(id)].dot : TONES.red.dot, 'opacity-70')} style={{ left: `${left}%`, width: `${width}%` }} title={`${b.title ?? t('calendar.labels.busy')} · ${fmtTime(s)}–${fmtTime(e)}`} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Create / edit dialog with attendees, recurrence, reminders, visibility, case link and "find a time". */
export const EventDialog = ({ open, onClose, initial, people, meId, onSaved }: { open: boolean; onClose: () => void; initial: DialogInitial; people: Person[]; meId: string; onSaved: (e: EventDto) => void }) => {
  const { t } = useTranslation();
  const ev = initial.event ?? null;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState({ date: '', time: '' });
  const [end, setEnd] = useState({ date: '', time: '' });
  const [color, setColor] = useState<EventColor>('blue');
  const [visibility, setVisibility] = useState<Visibility>('TEAM');
  const [rec, setRec] = useState<RecurrenceForm>(EMPTY_RECURRENCE);
  const [customRec, setCustomRec] = useState(false);
  const [reminder, setReminder] = useState<number | null>(15);
  const [caseRef, setCaseRef] = useState<CaseRef | null>(null);
  const [attendees, setAttendees] = useState<Person[]>([]);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [findTime, setFindTime] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const s = ev ? new Date(ev.startsAt) : (initial.start ?? roundTo(new Date(Date.now() + 60 * MIN), 30));
    const e = ev ? new Date(ev.endsAt) : (initial.end ?? new Date(s.getTime() + 60 * MIN));
    setTitle(ev?.title ?? '');
    setDescription(ev?.description ?? '');
    setLocation(ev?.location ?? '');
    setMeetingUrl(ev?.meetingUrl ?? '');
    setAllDay(ev?.allDay ?? initial.allDay ?? false);
    setStart({ date: toDateInput(s), time: toTimeInput(s) });
    setEnd({ date: toDateInput(ev?.allDay || initial.allDay ? addDays(e, -1) : e), time: toTimeInput(e) });
    setColor(ev?.color ?? 'blue');
    setVisibility(ev?.visibility ?? 'TEAM');
    const r = parseRecurrence(ev?.rrule);
    setRec(r);
    setCustomRec(r.freq !== 'NONE' && (r.interval > 1 || r.byDay.length > 0 || r.ends !== 'never'));
    setReminder(ev ? ev.reminderMinutes : 15);
    setCaseRef(ev?.case ? { id: ev.case.id, number: ev.case.number, clientName: '' } : null);
    setAttendees(ev?.attendees ?? []);
    setFindTime(false);
    setBusy(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const startDate = useMemo(() => fromInputs(start.date, allDay ? '00:00' : start.time), [start, allDay]);

  // Keep the end after the start when the start moves.
  const moveStart = (next: { date: string; time: string }) => {
    const oldS = fromInputs(start.date, start.time);
    const oldE = fromInputs(end.date, end.time);
    const dur = Math.max(0, oldE.getTime() - oldS.getTime());
    const s = fromInputs(next.date, next.time);
    const e = new Date(s.getTime() + dur);
    setStart(next);
    setEnd({ date: toDateInput(e), time: toTimeInput(e) });
  };

  const submit = async () => {
    if (!title.trim() || busy) return;
    const s = allDay ? startOfDay(parseDayKey(start.date) ?? new Date()) : fromInputs(start.date, start.time);
    const e = allDay ? addDays(startOfDay(parseDayKey(end.date) ?? s), 1) : fromInputs(end.date, end.time);
    if (e.getTime() <= s.getTime()) {
      toast.error(t('calendar.errors.END_BEFORE_START'));
      return;
    }
    const body: EventInput = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      meetingUrl: meetingUrl.trim() || null,
      startsAt: s.toISOString(),
      endsAt: e.toISOString(),
      allDay,
      color,
      visibility,
      rrule: buildRRule(rec),
      reminderMinutes: reminder,
      caseId: caseRef?.id ?? null,
      attendeeIds: attendees.map((a) => a.id),
    };
    setBusy(true);
    try {
      const saved = ev ? await calendarApi.update(ev.id, body) : await calendarApi.create(body);
      toast.success(t(ev ? 'calendar.toasts.saved' : 'calendar.toasts.created'));
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: (v: T) => string }) => (
    <div className="flex flex-wrap gap-1" role="radiogroup">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} className={clsx('rounded-lg border px-2.5 py-1 text-xs font-semibold', value === o.v ? 'border-primary bg-primary/[0.06] text-link' : 'border-line text-ink hover:bg-sunken')}>
          {o.l || label(o.v)}
        </button>
      ))}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ev ? t('calendar.actions.edit') : t('calendar.newEvent')}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">
            {t('calendar.actions.cancel')}
          </button>
          <button type="button" onClick={() => void submit()} disabled={!title.trim() || busy} className="btn-primary btn-sm">
            {busy ? <Loader2 className="size-4 animate-spin" /> : ev ? t('calendar.actions.save') : t('calendar.actions.create')}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t('calendar.ph.title')} aria-label={t('calendar.fields.title')} className="w-full border-0 bg-transparent p-0 font-display text-xl font-bold text-ink outline-none placeholder:text-subtle" />

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field label={t('calendar.fields.start')}>
            <div className="flex gap-1.5">
              <input type="date" value={start.date} onChange={(e) => moveStart({ ...start, date: e.target.value })} className="input" required />
              {!allDay && <input type="time" value={start.time} onChange={(e) => moveStart({ ...start, time: e.target.value })} className="input w-28" />}
            </div>
          </Field>
          <span className="hidden self-end pb-3 text-muted sm:block">→</span>
          <Field label={t('calendar.fields.end')}>
            <div className="flex gap-1.5">
              <input type="date" value={end.date} onChange={(e) => setEnd({ ...end, date: e.target.value })} className="input" required />
              {!allDay && <input type="time" value={end.time} onChange={(e) => setEnd({ ...end, time: e.target.value })} className="input w-28" />}
            </div>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-primary" /> {t('calendar.fields.allDay')}
          </label>
          <button type="button" onClick={() => setFindTime((f) => !f)} className={clsx('inline-flex items-center gap-1.5 text-sm font-semibold', findTime ? 'text-link' : 'text-link hover:underline')}>
            <Clock className="size-4" /> {t('calendar.actions.findTime')}
          </button>
        </div>
        {findTime && (
          <FindTime
            day={startDate}
            users={attendees.map((a) => a.id)}
            people={people}
            meId={meId}
            onPick={(s) => {
              setAllDay(false);
              moveStart({ date: toDateInput(s), time: toTimeInput(s) });
            }}
          />
        )}

        <Field label={t('calendar.fields.attendees')}>
          <div className="flex flex-wrap items-center gap-1.5">
            {attendees.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-0.5 pr-1 pl-0.5 text-xs">
                <Avatar person={a} size="xs" /> {fullName(a)}
                <button type="button" onClick={() => setAttendees((x) => x.filter((y) => y.id !== a.id))} className="grid size-4 place-items-center rounded-full text-muted hover:text-danger-fg" aria-label={t('calendar.actions.delete')}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <span className="relative">
              <button type="button" onClick={() => setPeopleOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-medium text-muted hover:border-line-strong hover:text-link">
                <Plus className="size-3.5" /> {t('calendar.ph.attendees')}
              </button>
              <Popover open={peopleOpen} onClose={() => setPeopleOpen(false)}>
                <PeopleList people={people.filter((p) => p.id !== meId)} selected={attendees.map((a) => a.id)} onToggle={(p) => setAttendees((x) => (x.some((y) => y.id === p.id) ? x.filter((y) => y.id !== p.id) : [...x, p]))} />
              </Popover>
            </span>
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('calendar.fields.location')}>
            <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={255} placeholder={t('calendar.ph.location')} className="input" />
          </Field>
          <Field label={t('calendar.fields.meetingUrl')}>
            <input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} maxLength={500} placeholder={t('calendar.ph.meetingUrl')} className="input" inputMode="url" />
          </Field>
        </div>
        <Field label={t('calendar.fields.description')}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} placeholder={t('calendar.ph.description')} className="input resize-y" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">{t('calendar.fields.recurrence')}</span>
            <Seg value={customRec ? ('CUSTOM' as RecurrenceForm['freq']) : rec.freq} options={[...PRESETS.map((f) => ({ v: f, l: t(`calendar.recurrence.${f.toLowerCase()}`) })), { v: 'CUSTOM' as RecurrenceForm['freq'], l: t('calendar.recurrence.custom') }]} onChange={(v) => {
              if (v === ('CUSTOM' as RecurrenceForm['freq'])) {
                setCustomRec(true);
                setRec((r) => ({ ...r, freq: r.freq === 'NONE' ? 'WEEKLY' : r.freq }));
              } else {
                setCustomRec(false);
                setRec({ ...EMPTY_RECURRENCE, freq: v });
              }
            }} label={(v) => v} />
            {customRec && (
              <div className="mt-2 space-y-2 rounded-xl border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">{t('calendar.recurrence.every')}</span>
                  <input type="number" min={1} max={99} value={rec.interval} onChange={(e) => setRec({ ...rec, interval: Math.max(1, Number(e.target.value) || 1) })} className="input w-16 py-1" />
                  <select value={rec.freq} onChange={(e) => setRec({ ...rec, freq: e.target.value as RecurrenceForm['freq'] })} className="input w-auto py-1">
                    <option value="DAILY">{t('calendar.recurrence.unitDay')}</option>
                    <option value="WEEKLY">{t('calendar.recurrence.unitWeek')}</option>
                    <option value="MONTHLY">{t('calendar.recurrence.unitMonth')}</option>
                    <option value="YEARLY">{t('calendar.recurrence.unitYear')}</option>
                  </select>
                </div>
                {rec.freq === 'WEEKLY' && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="mr-1 text-muted">{t('calendar.recurrence.on')}</span>
                    {WEEKDAY_CODES.map((c, i) => (
                      <button key={c} type="button" onClick={() => setRec({ ...rec, byDay: rec.byDay.includes(c) ? rec.byDay.filter((x) => x !== c) : [...rec.byDay, c] })} className={clsx('size-8 rounded-full text-xs font-semibold', rec.byDay.includes(c) ? 'bg-primary text-primary-contrast' : 'bg-sunken text-ink hover:bg-primary/[0.06]')} aria-pressed={rec.byDay.includes(c)}>
                        {weekdayShort()[i].slice(0, 2)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">{t('calendar.recurrence.ends')}</span>
                  <select value={rec.ends} onChange={(e) => setRec({ ...rec, ends: e.target.value as RecurrenceForm['ends'] })} className="input w-auto py-1">
                    <option value="never">{t('calendar.recurrence.never')}</option>
                    <option value="after">{t('calendar.recurrence.after')}</option>
                    <option value="until">{t('calendar.recurrence.until')}</option>
                  </select>
                  {rec.ends === 'after' && (
                    <>
                      <input type="number" min={1} max={999} value={rec.count} onChange={(e) => setRec({ ...rec, count: Math.max(1, Number(e.target.value) || 1) })} className="input w-20 py-1" />
                      <span className="text-muted">{t('calendar.recurrence.occurrences')}</span>
                    </>
                  )}
                  {rec.ends === 'until' && <input type="date" value={rec.until} onChange={(e) => setRec({ ...rec, until: e.target.value })} className="input w-auto py-1" />}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <Field label={t('calendar.fields.reminder')}>
              <select value={reminder === null ? '' : String(reminder)} onChange={(e) => setReminder(e.target.value === '' ? null : Number(e.target.value))} className="input">
                {REMINDER_OPTIONS.map((o) => (
                  <option key={o.key} value={o.value === null ? '' : o.value}>
                    {t(`calendar.reminder.${o.key}`)}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <span className="label">{t('calendar.fields.visibility')}</span>
              <Seg value={visibility} options={[{ v: 'TEAM' as Visibility, l: t('calendar.visibility.TEAM') }, { v: 'PRIVATE' as Visibility, l: t('calendar.visibility.PRIVATE') }]} onChange={setVisibility} label={(v) => v} />
              <span className="mt-1 block text-xs text-muted">{t(visibility === 'PRIVATE' ? 'calendar.visibility.privateHint' : 'calendar.visibility.teamHint')}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">{t('calendar.fields.color')}</span>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={clsx('size-7 rounded-full ring-offset-2 ring-offset-card transition-shadow', TONES[c].dot, color === c && 'ring-2 ring-focus')} aria-label={c} aria-pressed={color === c} />
              ))}
            </div>
          </div>
          <div>
            <span className="label">{t('calendar.fields.case')}</span>
            <CaseField value={caseRef} onChange={setCaseRef} align="right" />
          </div>
        </div>
      </form>
    </Modal>
  );
};
