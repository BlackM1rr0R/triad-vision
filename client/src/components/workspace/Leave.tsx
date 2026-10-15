import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CalendarRange, Check, ChevronLeft, ChevronRight, Palmtree, Pencil, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { LEAVE_TYPES, type LeaveBalance, type LeaveRequest, type LeaveStatus, type LeaveType, useLeaveCalendar, useWorkspaceInvalidate } from './api';
import { Avatar, Card, Chip, Empty, Field, IconButton, Modal, Skeleton, errorText, fmtDay, fmtUtcDay, fullName, toDateInput, utcDayKey } from './ui';

export const STATUS_TONE: Record<LeaveStatus, 'warn' | 'success' | 'danger' | 'muted'> = { PENDING: 'warn', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'muted' };
const TYPE_TONE: Record<LeaveType, string> = { VACATION: 'bg-sky-400', SICK: 'bg-rose-400', REMOTE: 'bg-violet-400', OTHER: 'bg-slate-400' };

/** New / edit request dialog. Dates are calendar days (sent as YYYY-MM-DD, stored as UTC days). */
export const LeaveDialog = ({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: LeaveRequest | null }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const [type, setType] = useState<LeaveType>('VACATION');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const today = toDateInput(new Date());
    setType(editing?.type ?? 'VACATION');
    setFrom(editing ? utcDayKey(editing.startsAt) : today);
    setTo(editing ? utcDayKey(editing.endsAt) : today);
    setNote(editing?.note ?? '');
    setBusy(false);
  }, [open, editing]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to || busy) return;
    setBusy(true);
    try {
      const payload = { type, startsAt: from, endsAt: to, note: note.trim() || null };
      if (editing) await api.patch(`/workspace/leave/${editing.id}`, payload);
      else await api.post('/workspace/leave', payload);
      toast.success(editing ? t('ws.common.saved') : t('ws.leave.created'));
      inv.leave();
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('ws.leave.edit') : t('ws.leave.new')}
      as="form"
      onSubmit={submit}
      busy={busy}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-white btn-sm border border-line" disabled={busy}>
            {t('ws.common.cancel')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={busy || !from || !to || to < from}>
            {editing ? t('ws.common.save') : t('ws.leave.submit')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="label">{t('ws.leave.type')}</span>
          <div className="grid grid-cols-2 gap-2">
            {LEAVE_TYPES.map((k) => (
              <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)} className={clsx('flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition', type === k ? 'border-brand-500 bg-brand-50 text-ink' : 'border-line bg-surface text-muted hover:text-ink')}>
                <span className={clsx('size-2.5 rounded-full', TYPE_TONE[k])} aria-hidden />
                {t(`ws.leave.types.${k}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('ws.leave.from')}>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (!to || to < e.target.value) setTo(e.target.value);
              }}
              className="input"
              required
            />
          </Field>
          <Field label={t('ws.leave.to')}>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input" required />
          </Field>
        </div>
        <Field label={t('ws.leave.note')} hint={t('ws.common.optional')}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder={t('ws.leave.notePh')} className="input resize-y" />
        </Field>
      </div>
    </Modal>
  );
};

export const LeaveRow = ({ l, mine, admin, onEdit, dense = false }: { l: LeaveRequest; mine: boolean; admin: boolean; onEdit?: (l: LeaveRequest) => void; dense?: boolean }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (path: string, body?: unknown, done?: string) => {
    setBusy(true);
    try {
      await api.post(`/workspace/leave/${l.id}/${path}`, body);
      if (done) toast.success(done);
      inv.leave();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const span = utcDayKey(l.startsAt) === utcDayKey(l.endsAt) ? fmtUtcDay(l.startsAt) : `${fmtUtcDay(l.startsAt)} – ${fmtUtcDay(l.endsAt)}`;
  return (
    <li className={clsx('flex flex-col gap-2 py-3 sm:flex-row sm:items-start', dense ? 'px-0' : '')}>
      {!mine && <Avatar id={l.user.id} person={l.user} size="sm" className="mt-0.5" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('size-2.5 rounded-full', TYPE_TONE[l.type])} aria-hidden />
          <span className="text-sm font-semibold text-ink">
            {!mine && <>{fullName(l.user)} · </>}
            {t(`ws.leave.types.${l.type}`)}
          </span>
          <Chip tone={STATUS_TONE[l.status]}>{t(`ws.leave.status.${l.status}`)}</Chip>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {span} · {t('ws.leave.days', { count: l.days })}
          {l.note && <> · «{l.note}»</>}
        </p>
        {l.decidedBy && (
          <p className="mt-0.5 text-xs text-muted">
            {t('ws.leave.decidedBy', { name: fullName(l.decidedBy), date: l.decidedAt ? fmtDay(l.decidedAt) : '' })}
            {l.decisionNote && <> · «{l.decisionNote}»</>}
          </p>
        )}
        {admin && !mine && l.status === 'PENDING' && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t('ws.leave.decisionPh')} className="input h-8 max-w-xs py-1 text-xs" aria-label={t('ws.leave.decisionNote')} />
            <button type="button" disabled={busy} onClick={() => void act('approve', { decisionNote: note || null }, t('ws.leave.decided'))} className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              <Check className="size-3.5" /> {t('ws.leave.approve')}
            </button>
            <button type="button" disabled={busy} onClick={() => void act('reject', { decisionNote: note || null }, t('ws.leave.decided'))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
              <X className="size-3.5" /> {t('ws.leave.reject')}
            </button>
          </div>
        )}
      </div>
      {mine && (l.status === 'PENDING' || l.status === 'APPROVED') && (
        <div className="flex shrink-0 items-center gap-0.5">
          {l.status === 'PENDING' && onEdit && <IconButton icon={Pencil} label={t('ws.leave.edit')} onClick={() => onEdit(l)} />}
          <button type="button" disabled={busy} onClick={() => void act('cancel', undefined, t('ws.leave.cancelled'))} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-surface hover:text-red-600 disabled:opacity-50">
            <X className="size-3.5" /> {t('ws.leave.cancelRequest')}
          </button>
        </div>
      )}
    </li>
  );
};

export const BalanceStrip = ({ balance }: { balance: LeaveBalance | undefined }) => {
  const { t } = useTranslation();
  if (!balance) return <Skeleton className="h-16" />;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted">{t('ws.leave.balance', { year: balance.year })}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LEAVE_TYPES.map((k) => (
          <div key={k} className="rounded-lg border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <span className={clsx('size-2 rounded-full', TYPE_TONE[k])} aria-hidden />
              {t(`ws.leave.types.${k}`)}
            </div>
            <p className="mt-1 text-lg font-bold text-ink tabular-nums">
              {balance.used[k]} <span className="text-xs font-medium text-muted">{t('ws.leave.used')}</span>
            </p>
            {balance.pending[k] > 0 && (
              <p className="text-xs text-amber-700 tabular-nums">
                +{balance.pending[k]} {t('ws.leave.pending')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const MONTH_FMT: Record<string, string> = { az: 'az-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

/** Month strip: one row per person who is away, one cell per day. */
export const LeaveMonthStrip = () => {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), 1));
  });
  const from = month.toISOString().slice(0, 10);
  const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  const to = last.toISOString().slice(0, 10);
  const q = useLeaveCalendar(from, to);
  const days = useMemo(() => Array.from({ length: last.getUTCDate() }, (_, i) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i + 1))), [month, last]);
  const todayKey = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => {
    const byUser = new Map<string, { user: LeaveRequest['user']; items: LeaveRequest[] }>();
    for (const l of q.data ?? []) {
      const e = byUser.get(l.userId) ?? { user: l.user, items: [] };
      e.items.push(l);
      byUser.set(l.userId, e);
    }
    return [...byUser.values()].sort((a, b) => fullName(a.user).localeCompare(fullName(b.user)));
  }, [q.data]);
  const label = new Intl.DateTimeFormat(MONTH_FMT[i18n.language?.slice(0, 2)] ?? 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month);
  const shift = (n: number) => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + n, 1)));

  return (
    <Card
      icon={CalendarRange}
      title={t('ws.leave.calendar')}
      actions={
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label={t('ws.leave.prevMonth')} onClick={() => shift(-1)} />
          <span className="min-w-32 text-center text-sm font-semibold text-ink capitalize">{label}</span>
          <IconButton icon={ChevronRight} label={t('ws.leave.nextMonth')} onClick={() => shift(1)} />
        </div>
      }
      bodyClassName="p-0! overflow-x-auto"
    >
      {q.isLoading ? (
        <div className="p-4">
          <Skeleton className="h-16" />
        </div>
      ) : !rows.length ? (
        <Empty icon={Palmtree}>{t('ws.leave.nobodyAway')}</Empty>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold text-muted">&nbsp;</th>
              {days.map((d) => {
                const key = d.toISOString().slice(0, 10);
                const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                return (
                  <th key={key} className={clsx('min-w-6 px-0 py-2 text-center font-semibold tabular-nums', weekend ? 'text-muted/50' : 'text-muted', key === todayKey && 'text-brand-600')} title={key}>
                    {d.getUTCDate()}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user.id} className="border-t border-line">
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5 whitespace-nowrap">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    <Avatar id={r.user.id} person={r.user} size="sm" /> {fullName(r.user)}
                  </span>
                </td>
                {days.map((d) => {
                  const key = d.toISOString().slice(0, 10);
                  const hit = r.items.find((l) => utcDayKey(l.startsAt) <= key && utcDayKey(l.endsAt) >= key);
                  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                  return (
                    <td key={key} className={clsx('p-0.5', weekend && 'bg-surface/60')}>
                      {hit && <span className={clsx('block h-5 rounded-sm', TYPE_TONE[hit.type])} title={`${t(`ws.leave.types.${hit.type}`)} · ${key}`} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap gap-3 border-t border-line px-4 py-2 text-xs text-muted">
        {LEAVE_TYPES.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={clsx('size-2.5 rounded-sm', TYPE_TONE[k])} aria-hidden /> {t(`ws.leave.types.${k}`)}
          </span>
        ))}
      </div>
    </Card>
  );
};

export const NewLeaveButton = ({ onClick, className }: { onClick: () => void; className?: string }) => {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onClick} className={clsx('btn-primary btn-sm h-8 px-3', className)}>
      <Plus className="size-4" /> {t('ws.leave.new')}
    </button>
  );
};
