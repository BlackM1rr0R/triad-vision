import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Copy, Plus, Repeat, Settings2, Trash2, UserRound, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { currentLocale, registerCopy, type Locale } from '@/i18n';
import { pagesTeam } from '@/i18n/pagesTeam';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { TONE_CLASS, TONE_TEXT } from '@/components/ui/status';
import { SHIFT_KINDS, addDays, bakuDay, dayDate, hhmm, mondayOf, parseHhmm, useShiftCalendar, type CalendarData, type CoverageConfig, type Shift, type ShiftKind } from './api';
import { toastTeamError } from './shared';

registerCopy(pagesTeam);

const INTL: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
const fmt = (key: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(INTL[currentLocale()], { timeZone: 'UTC', ...opts }).format(dayDate(key));

export const KIND_STYLE: Record<ShiftKind, string> = {
  OFFICE: 'bg-brand-100 text-brand-800 ring-brand-300',
  REMOTE: 'bg-violet-100 text-violet-800 ring-violet-300',
  ON_CALL: 'bg-amber-100 text-amber-900 ring-amber-300',
};
const LEAVE_STYLE: Record<string, string> = { VACATION: 'bg-sky-400', SICK: 'bg-rose-400', REMOTE: 'bg-violet-400', OTHER: 'bg-slate-400' };

type View = 'week' | 'month';
type Person = CalendarData['people'][number];
const name = (p: { firstName: string; lastName: string } | undefined) => (p ? `${p.firstName} ${p.lastName}`.trim() : '—');

const leaveOn = (data: CalendarData, userId: string, day: string) => {
  const start = dayDate(day).getTime();
  const end = start + 86400_000 - 1;
  return data.leave.filter((l) => l.userId === userId && new Date(l.startsAt).getTime() <= end && new Date(l.endsAt).getTime() >= start);
};

// ─── Dialogs ───────────────────────────────────────────────────────────

const ShiftDialog = ({ open, onClose, people, initial, onSaved }: { open: boolean; onClose: () => void; people: Person[]; initial: Partial<Shift> & { date: string }; onSaved: () => void }) => {
  const { t } = useTranslation();
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [kind, setKind] = useState<ShiftKind>('OFFICE');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setUserId(initial.userId ?? people[0]?.id ?? '');
    setDate(initial.date);
    setStart(hhmm(initial.startMin ?? 540));
    setEnd(hhmm(initial.endMin ?? 1080));
    setKind(initial.kind ?? 'OFFICE');
    setNote(initial.note ?? '');
  }, [open, initial, people]);
  const startMin = parseHhmm(start);
  const endMin = parseHhmm(end === '00:00' ? '24:00' : end);
  const valid = !!userId && !!date && Number.isFinite(startMin) && Number.isFinite(endMin) && endMin > startMin;
  const save = useMutation({
    mutationFn: async () => {
      const body = { date, startMin, endMin, kind, note: note.trim() || null };
      return initial.id ? api.patch(`/admin/shifts/${initial.id}`, body) : api.post('/admin/shifts', { ...body, userId });
    },
    onSuccess: () => {
      toast.success(t('team.common.saved'));
      onSaved();
      onClose();
    },
    onError: toastTeamError,
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`/admin/shifts/${initial.id}`),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: toastTeamError,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={initial.id ? t('team.shifts.editShift') : t('team.shifts.newShift')}
      as="form"
      busy={save.isPending || remove.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
      footer={
        <>
          {initial.id && (
            <button type="button" className="btn-secondary btn-sm mr-auto text-danger" onClick={() => remove.mutate()}>
              <Trash2 className="size-3.5" /> {t('team.common.delete')}
            </button>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('team.common.cancel')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={!valid || save.isPending}>
            {save.isPending ? <Spinner className="size-3.5" /> : null} {t('team.common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label">{t('team.shifts.person')}</span>
          <select className="input" value={userId} disabled={!!initial.id} onChange={(e) => setUserId(e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {name(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t('team.shifts.date')}</span>
          <input type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">{t('team.shifts.start')}</span>
            <input type="time" className="input" required value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('team.shifts.end')}</span>
            <input type="time" className="input" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {!valid && start && end && <p className="text-xs text-danger">{t('team.errors.END_BEFORE_START')}</p>}
        <fieldset>
          <legend className="label">{t('team.shifts.kind')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {SHIFT_KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={clsx('min-h-10 rounded-lg px-2 text-xs font-semibold ring-1 transition', kind === k ? KIND_STYLE[k] : 'bg-surface text-muted ring-line')}>
                {t(`team.shifts.kinds.${k}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="label">{t('team.shifts.note')}</span>
          <input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="text-[11px] text-muted">{t('team.shifts.bakuTime')}</p>
      </div>
    </Modal>
  );
};

const RepeatDialog = ({ open, onClose, week, onDone }: { open: boolean; onClose: () => void; week: string; onDone: () => void }) => {
  const { t } = useTranslation();
  const [weeks, setWeeks] = useState(4);
  const [replace, setReplace] = useState(false);
  const run = useMutation({
    mutationFn: async () => (await api.post<{ created: number; skipped: number }>('/admin/shifts/repeat', { week, weeks, replace })).data,
    onSuccess: (r) => {
      toast.success(t('team.shifts.copied', { created: r.created, skipped: r.skipped }));
      onDone();
      onClose();
    },
    onError: toastTeamError,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('team.shifts.repeatTitle')}
      busy={run.isPending}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('team.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={run.isPending} onClick={() => run.mutate()}>
            {t('team.shifts.repeatRun')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('team.shifts.repeatText', { week: fmt(week, { day: 'numeric', month: 'long' }) })}</p>
        <label className="block">
          <span className="label">{t('team.shifts.repeatWeeks')}</span>
          <input type="number" min={1} max={12} className="input" value={weeks} onChange={(e) => setWeeks(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
        </label>
        <label className="inline-flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> {t('team.shifts.replace')}
        </label>
      </div>
    </Modal>
  );
};

const CoverageDialog = ({ open, onClose, config, onDone }: { open: boolean; onClose: () => void; config: CoverageConfig; onDone: () => void }) => {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState(config);
  useEffect(() => {
    if (open) setCfg(config);
  }, [open, config]);
  const save = useMutation({
    mutationFn: async () => api.put('/admin/shifts/coverage', cfg),
    onSuccess: () => {
      toast.success(t('team.common.saved'));
      onDone();
      onClose();
    },
    onError: toastTeamError,
  });
  const monday = '2026-01-05';
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('team.shifts.coverageTitle')}
      busy={save.isPending}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('team.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {t('team.common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted">{t('team.shifts.coverageText')}</p>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" className="size-4" checked={cfg.requireOffice} onChange={(e) => setCfg({ ...cfg, requireOffice: e.target.checked })} /> {t('team.shifts.requireOffice')}
        </label>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" className="size-4" checked={cfg.requireOnCall} onChange={(e) => setCfg({ ...cfg, requireOnCall: e.target.checked })} /> {t('team.shifts.requireOnCall')}
        </label>
        <fieldset>
          <legend className="label">{t('team.shifts.workingDays')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={cfg.weekdays.includes(d)}
                onClick={() => setCfg({ ...cfg, weekdays: cfg.weekdays.includes(d) ? cfg.weekdays.filter((x) => x !== d) : [...cfg.weekdays, d].sort() })}
                className={clsx('min-h-9 min-w-11 rounded-lg px-2 text-xs font-semibold ring-1', cfg.weekdays.includes(d) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-surface text-muted ring-line')}
              >
                {fmt(addDays(monday, d - 1), { weekday: 'short' })}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
};

// ─── Views ─────────────────────────────────────────────────────────────

const CoverageCell = ({ c }: { c: CalendarData['coverage'][number] | undefined }) => {
  const { t } = useTranslation();
  if (!c) return null;
  const warn = c.warnings.length > 0;
  return (
    <span className={clsx('mt-1 inline-flex items-center gap-1 text-[10px] font-semibold', warn ? TONE_TEXT.danger : 'text-muted')} title={warn ? c.warnings.map((w) => t(`team.shifts.warnings.${w}`)).join(' · ') : undefined}>
      {warn && <AlertTriangle className="size-3" aria-hidden />}
      {t('team.shifts.coverageCounts', { office: c.office, onCall: c.onCall })}
      {warn && <span className="sr-only">{c.warnings.map((w) => t(`team.shifts.warnings.${w}`)).join(', ')}</span>}
    </span>
  );
};

const WeekView = ({ data, people, isAdmin, onAdd, onEdit }: { data: CalendarData; people: Person[]; isAdmin: boolean; onAdd: (userId: string, day: string) => void; onEdit: (s: Shift) => void }) => {
  const { t } = useTranslation();
  const today = bakuDay();
  const byName = new Map(data.people.map((p) => [p.id, p]));
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full min-w-[860px] table-fixed text-left text-xs">
        <thead className="border-b border-line bg-surface/70">
          <tr>
            <th className="sticky left-0 z-10 w-44 bg-surface px-3 py-2 text-[10px] font-semibold tracking-wide text-muted uppercase">{t('team.shifts.person')}</th>
            {data.days.map((d) => {
              const c = data.coverage.find((x) => x.day === d);
              return (
                <th key={d} className={clsx('px-2 py-2 align-top font-semibold', d === today ? 'text-brand-700' : 'text-ink', c?.warnings.length && 'bg-danger-bg/60')}>
                  <span className="block capitalize">{fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <CoverageCell c={c} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {people.map((p) => {
            const covering = data.handovers.filter((h) => h.substituteId === p.id && h.active > 0);
            const away = data.handovers.filter((h) => h.originalStaffId === p.id && h.active > 0);
            return (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 bg-card px-3 py-2 align-top">
                  <span className="block truncate font-semibold text-ink">{name(p)}</span>
                  {covering.map((h) => (
                    <span key={`c${h.originalStaffId}`} className={clsx('mt-1 block truncate rounded px-1.5 py-0.5 text-[10px]', TONE_CLASS.info)}>
                      {t('team.shifts.covering', { name: name(byName.get(h.originalStaffId)), count: h.active })}
                    </span>
                  ))}
                  {away.map((h) => (
                    <span key={`a${h.substituteId}`} className={clsx('mt-1 block truncate rounded px-1.5 py-0.5 text-[10px]', TONE_CLASS.neutral)}>
                      {t('team.shifts.coveredBy', { name: name(byName.get(h.substituteId)), count: h.active })}
                    </span>
                  ))}
                </td>
                {data.days.map((d) => {
                  const shifts = data.shifts.filter((s) => s.userId === p.id && s.date === d);
                  const leave = leaveOn(data, p.id, d);
                  return (
                    <td key={d} className={clsx('group px-1.5 py-1.5 align-top', d === today && 'bg-brand-50/30')}>
                      <div className="flex min-h-12 flex-col gap-1">
                        {leave.map((l) => (
                          <span
                            key={l.id}
                            className={clsx('flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-semibold', l.status === 'APPROVED' ? 'bg-surface text-ink' : 'border border-dashed border-line text-muted')}
                            title={l.note ?? undefined}
                          >
                            <span className={clsx('size-2 shrink-0 rounded-full', LEAVE_STYLE[l.type])} aria-hidden />
                            {t(`team.shifts.leave.${l.type}`)}
                            {l.status === 'PENDING' && ` · ${t('team.shifts.pending')}`}
                          </span>
                        ))}
                        {shifts.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => onEdit(s)}
                            title={s.note ?? undefined}
                            className={clsx('truncate rounded px-1.5 py-1 text-left text-[11px] font-semibold ring-1 disabled:cursor-default', KIND_STYLE[s.kind])}
                          >
                            {hhmm(s.startMin)}–{hhmm(s.endMin)} · {t(`team.shifts.kindsShort.${s.kind}`)}
                          </button>
                        ))}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onAdd(p.id, d)}
                            aria-label={t('team.shifts.addFor', { name: name(p), day: fmt(d, { day: 'numeric', month: 'long' }) })}
                            className="flex min-h-7 items-center justify-center rounded text-muted opacity-0 transition group-hover:opacity-100 hover:bg-surface hover:text-ink focus-visible:opacity-100"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const MonthView = ({ data, month, people, onPick }: { data: CalendarData; month: string; people: Person[]; onPick: (day: string) => void }) => {
  const { t } = useTranslation();
  const today = bakuDay();
  const ids = new Set(people.map((p) => p.id));
  const byName = new Map(data.people.map((p) => [p.id, p]));
  const weeks: string[][] = [];
  for (let i = 0; i < data.days.length; i += 7) weeks.push(data.days.slice(i, i + 7));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
        {data.days.slice(0, 7).map((d) => (
          <div key={d} className="bg-surface px-2 py-1.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
            {fmt(d, { weekday: 'short' })}
          </div>
        ))}
        {weeks.flat().map((d) => {
          const c = data.coverage.find((x) => x.day === d);
          const shifts = data.shifts.filter((s) => s.date === d && ids.has(s.userId));
          const away = data.leave.filter((l) => ids.has(l.userId) && leaveOn(data, l.userId, d).some((x) => x.id === l.id));
          const inMonth = d.startsWith(month);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              className={clsx('flex min-h-24 flex-col gap-1 bg-card p-1.5 text-left text-[11px] transition hover:bg-surface', !inMonth && 'opacity-50', c?.warnings.length && inMonth && 'bg-danger-bg/40')}
            >
              <span className={clsx('flex items-center justify-between font-semibold', d === today ? 'text-brand-700' : 'text-ink')}>
                {Number(d.slice(8))}
                {c?.warnings.length ? <AlertTriangle className={clsx('size-3.5', TONE_TEXT.danger)} aria-label={c.warnings.map((w) => t(`team.shifts.warnings.${w}`)).join(', ')} /> : null}
              </span>
              <span className="flex flex-wrap gap-1">
                {SHIFT_KINDS.map((k) => {
                  const n = new Set(shifts.filter((s) => s.kind === k).map((s) => s.userId)).size;
                  return n ? (
                    <span key={k} className={clsx('rounded px-1 font-semibold ring-1', KIND_STYLE[k])}>
                      {t(`team.shifts.kindsShort.${k}`)} {n}
                    </span>
                  ) : null;
                })}
              </span>
              {away.slice(0, 3).map((l) => (
                <span key={l.id} className={clsx('flex items-center gap-1 truncate', l.status === 'PENDING' && 'italic text-muted')}>
                  <span className={clsx('size-1.5 shrink-0 rounded-full', LEAVE_STYLE[l.type])} aria-hidden />
                  {name(byName.get(l.userId))}
                </span>
              ))}
              {away.length > 3 && <span className="text-muted">+{away.length - 3}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Calendar ──────────────────────────────────────────────────────────

/**
 * Team calendar (week / month): shifts, approved and pending leave, active handovers and the coverage
 * warning per day. ADMIN+ edits shifts (click a cell, copy the previous week, repeat a weekly pattern,
 * coverage rule); everyone else sees the team, optionally only themselves.
 */
export const ShiftCalendar = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(bakuDay());
  const [onlyMe, setOnlyMe] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; initial: Partial<Shift> & { date: string } }>({ open: false, initial: { date: bakuDay() } });
  const [repeat, setRepeat] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);

  const week = mondayOf(anchor);
  const month = anchor.slice(0, 7);
  const range = useMemo(() => {
    if (view === 'week') return { from: week, to: addDays(week, 6) };
    const [y, m] = month.split('-').map(Number);
    const end = addDays(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), -1); // last day of the month
    return { from: mondayOf(`${month}-01`), to: addDays(mondayOf(end), 6) };
  }, [view, week, month]);
  const { data, isLoading, error, refetch } = useShiftCalendar(range.from, range.to);
  const refresh = () => qc.invalidateQueries({ queryKey: ['shifts'] });

  const copyPrev = useMutation({
    mutationFn: async () => (await api.post<{ created: number; skipped: number }>('/admin/shifts/copy-week', { from: addDays(week, -7), to: week })).data,
    onSuccess: (r) => {
      toast.success(t('team.shifts.copied', { created: r.created, skipped: r.skipped }));
      void refresh();
    },
    onError: toastTeamError,
  });

  const people = useMemo(() => (data?.people ?? []).filter((p) => !onlyMe || p.id === user?.id), [data, onlyMe, user]);
  const move = (n: number) => {
    if (view === 'week') setAnchor(addDays(anchor, 7 * n));
    else {
      const [y, m] = month.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 + n, 1));
      setAnchor(d.toISOString().slice(0, 10));
    }
  };
  const title = view === 'week' ? `${fmt(week, { day: 'numeric', month: 'short' })} – ${fmt(addDays(week, 6), { day: 'numeric', month: 'short', year: 'numeric' })}` : fmt(`${month}-01`, { month: 'long', year: 'numeric' });
  const warnings = (data?.coverage ?? []).filter((c) => c.warnings.length && (view === 'week' || c.day.startsWith(month)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          variant="pills"
          label={t('team.shifts.view')}
          items={(['week', 'month'] as View[]).map((k) => ({ key: k, label: t(`team.shifts.views.${k}`), icon: k === 'week' ? CalendarRange : CalendarDays }))}
          value={view}
          onChange={setView}
        />
        <div className="inline-flex items-center gap-1">
          <button type="button" className="btn-secondary btn-sm px-2" aria-label={t('team.shifts.prev')} onClick={() => move(-1)}>
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAnchor(bakuDay())}>
            {t('team.shifts.today')}
          </button>
          <button type="button" className="btn-secondary btn-sm px-2" aria-label={t('team.shifts.next')} onClick={() => move(1)}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        <h2 className="text-sm font-semibold text-ink capitalize">{title}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={onlyMe} className={clsx('btn-secondary btn-sm', onlyMe && 'border-brand-500 text-brand-700')} onClick={() => setOnlyMe((v) => !v)}>
            {onlyMe ? <UserRound className="size-3.5" /> : <Users className="size-3.5" />} {onlyMe ? t('team.shifts.onlyMe') : t('team.shifts.everyone')}
          </button>
          {isAdmin && view === 'week' && (
            <>
              <button type="button" className="btn-secondary btn-sm" disabled={copyPrev.isPending} onClick={() => copyPrev.mutate()}>
                {copyPrev.isPending ? <Spinner className="size-3.5" /> : <Copy className="size-3.5" />} {t('team.shifts.copyPrev')}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setRepeat(true)}>
                <Repeat className="size-3.5" /> {t('team.shifts.repeat')}
              </button>
            </>
          )}
          {isAdmin && (
            <>
              <button type="button" className="btn-secondary btn-sm px-2" aria-label={t('team.shifts.coverageTitle')} title={t('team.shifts.coverageTitle')} onClick={() => setCoverageOpen(true)}>
                <Settings2 className="size-3.5" />
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => setDialog({ open: true, initial: { date: view === 'week' ? week : anchor } })}>
                <Plus className="size-3.5" /> {t('team.shifts.newShift')}
              </button>
            </>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className={clsx('flex items-start gap-2 rounded-xl px-4 py-3 text-sm', TONE_CLASS.danger)} role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">{t('team.shifts.coverageWarning', { count: warnings.length })}</span>{' '}
            {warnings
              .slice(0, 6)
              .map((c) => `${fmt(c.day, { weekday: 'short', day: 'numeric', month: 'short' })}: ${c.warnings.map((w) => t(`team.shifts.warnings.${w}`)).join(', ')}`)
              .join(' · ')}
          </p>
        </div>
      )}

      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : view === 'week' ? (
        <WeekView
          data={data}
          people={people}
          isAdmin={isAdmin}
          onAdd={(userId, day) => setDialog({ open: true, initial: { userId, date: day } })}
          onEdit={(s) => setDialog({ open: true, initial: s })}
        />
      ) : (
        <MonthView
          data={data}
          month={month}
          people={people}
          onPick={(d) => {
            setAnchor(d);
            setView('week');
          }}
        />
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {SHIFT_KINDS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={clsx('size-3 rounded ring-1', KIND_STYLE[k])} aria-hidden /> {t(`team.shifts.kinds.${k}`)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded border border-dashed border-line" aria-hidden /> {t('team.shifts.pendingLeave')}
        </span>
        <span>{t('team.shifts.bakuTime')}</span>
      </div>

      {data && (
        <>
          <ShiftDialog open={dialog.open} onClose={() => setDialog((d) => ({ ...d, open: false }))} people={data.people} initial={dialog.initial} onSaved={() => void refresh()} />
          <RepeatDialog open={repeat} onClose={() => setRepeat(false)} week={week} onDone={() => void refresh()} />
          <CoverageDialog open={coverageOpen} onClose={() => setCoverageOpen(false)} config={data.config} onDone={() => void refresh()} />
        </>
      )}
    </div>
  );
};
