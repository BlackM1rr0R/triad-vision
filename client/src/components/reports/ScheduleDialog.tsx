import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CalendarClock, History, Pause, Play, Plus, Send, Trash2, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { Modal } from '@/components/settlement/Modal';
import { useReportFormat, type Delivery, type Schedule, type StaffUser } from './types';

/** "Send this report": the schedules of a saved report, their delivery log and a form for a new one. */

const useErr = () => {
  const { t } = useTranslation();
  return (err: unknown) => toast.error(t(`reports.errors.${errorCode(err)}`, { defaultValue: t('reports.errors.generic') }));
};

const Deliveries = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const q = useQuery({ queryKey: ['reports', 'deliveries', id], queryFn: async () => (await api.get<{ deliveries: Delivery[] }>(`/admin/reports/schedules/${id}/deliveries`)).data.deliveries });
  if (!q.data) return null;
  if (!q.data.length) return <p className="px-1 py-2 text-xs text-muted">{t('reports.schedule.noDeliveries')}</p>;
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {q.data.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md bg-sunken px-2 py-1.5">
          <span className={clsx('font-semibold', d.status === 'SENT' ? 'text-success-fg' : d.status === 'FAILED' ? 'text-danger-fg' : 'text-muted')}>{t(`reports.schedule.status.${d.status}`)}</span>
          <span className="text-muted">{f.dateTime(d.createdAt)}</span>
          <span>{t('reports.schedule.rows', { count: d.rows })}</span>
          <span className="min-w-0 truncate text-muted">{d.recipients.join(', ')}</span>
          {d.error && <span className="text-danger-fg">{t(`reports.errors.${d.error}`, { defaultValue: d.error })}</span>}
        </li>
      ))}
    </ul>
  );
};

export const ScheduleDialog = ({ reportId, users, onClose }: { reportId: string; users: StaffUser[]; onClose: () => void }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const qc = useQueryClient();
  const onErr = useErr();
  const key = ['reports', 'schedules', reportId];
  const list = useQuery({ queryKey: key, queryFn: async () => (await api.get<{ schedules: Schedule[] }>(`/admin/reports/saved/${reportId}/schedules`)).data.schedules });
  const settings = useQuery({ queryKey: ['reports', 'settings'], queryFn: async () => (await api.get<{ settings: { externalAllowList: string[] } }>('/admin/reports/settings')).data.settings });
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ frequency: 'WEEKLY' as Schedule['frequency'], weekday: 1, monthDay: 1, time: '08:00', staff: [] as string[], emails: [] as string[], email: '' });
  const admins = users.filter((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['reports', 'saved'] });
  };

  const create = useMutation({
    mutationFn: async () =>
      api.post(`/admin/reports/saved/${reportId}/schedules`, {
        frequency: form.frequency,
        weekday: form.frequency === 'WEEKLY' ? form.weekday : null,
        monthDay: form.frequency === 'MONTHLY' ? form.monthDay : null,
        time: form.time,
        recipientUserIds: form.staff,
        externalEmails: form.emails,
      }),
    onSuccess: () => {
      toast.success(t('reports.schedule.createdToast'));
      setForm((s) => ({ ...s, staff: [], emails: [], email: '' }));
      refresh();
    },
    onError: onErr,
  });
  const patch = useMutation({ mutationFn: async (v: { id: string; active: boolean }) => api.patch(`/admin/reports/schedules/${v.id}`, { active: v.active }), onSuccess: refresh, onError: onErr });
  const remove = useMutation({ mutationFn: async (id: string) => api.delete(`/admin/reports/schedules/${id}`), onSuccess: refresh, onError: onErr });
  const sendNow = useMutation({
    mutationFn: async (id: string) => (await api.post<{ delivery: Delivery }>(`/admin/reports/schedules/${id}/send-now`)).data.delivery,
    onSuccess: (d, id) => {
      toast.success(t('reports.schedule.sentToast', { count: d.recipients.length }));
      void qc.invalidateQueries({ queryKey: ['reports', 'deliveries', id] });
      refresh();
    },
    onError: onErr,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  const addEmail = () => {
    const v = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || form.emails.includes(v)) return;
    setForm((s) => ({ ...s, emails: [...s.emails, v], email: '' }));
  };
  const allow = settings.data?.externalAllowList ?? [];
  const summary = (s: Schedule) => {
    const when =
      s.frequency === 'WEEKLY' ? `${t(`reports.schedule.freq.${s.frequency}`)} (${(t('reports.schedule.weekdays', { returnObjects: true }) as string[])[(s.weekday ?? 1) - 1]})` : s.frequency === 'MONTHLY' ? `${t(`reports.schedule.freq.${s.frequency}`)} (${s.monthDay})` : t(`reports.schedule.freq.${s.frequency}`);
    return t('reports.schedule.summary', { freq: when, time: s.time, count: s.recipientUserIds.length + s.externalEmails.length });
  };

  return (
    <Modal title={t('reports.schedule.title')} onClose={onClose} wide footer={<button type="button" className="btn-secondary btn-sm" onClick={onClose}>{t('reports.schedule.close')}</button>}>
      <div className="space-y-5">
        <div>
          {list.data?.length === 0 && <p className="text-sm text-muted">{t('reports.schedule.empty')}</p>}
          <ul className="space-y-2">
            {list.data?.map((s) => (
              <li key={s.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <CalendarClock className="size-4 text-link" aria-hidden /> {summary(s)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {s.active ? (s.nextRunAt ? t('reports.schedule.next', { date: f.dateTime(s.nextRunAt) }) : '') : t('reports.schedule.paused')}
                      {s.lastDelivery && ` · ${t(`reports.schedule.status.${s.lastDelivery.status}`)} ${f.dateTime(s.lastDelivery.createdAt)}`}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[...s.recipientUserIds.map((id) => users.find((u) => u.id === id)?.name ?? id), ...s.externalEmails].join(', ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className="btn-secondary btn-sm" onClick={() => patch.mutate({ id: s.id, active: !s.active })}>
                      {s.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {s.active ? t('reports.schedule.pause') : t('reports.schedule.resume')}
                    </button>
                    <button type="button" className="btn-secondary btn-sm" disabled={sendNow.isPending} onClick={() => sendNow.mutate(s.id)}>
                      <Send className="size-3.5" /> {t('reports.schedule.sendNow')}
                    </button>
                    <button type="button" className="btn-secondary btn-sm" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                      <History className="size-3.5" /> {t('reports.schedule.deliveries')}
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => window.confirm(t('reports.schedule.deleteConfirm')) && remove.mutate(s.id)} aria-label={t('reports.remove')}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                {open === s.id && <Deliveries id={s.id} />}
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-lg border border-line bg-surface/50 p-3">
          <p className="text-sm font-semibold text-ink">{t('reports.schedule.add')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="label">{t('reports.schedule.frequency')}</span>
              <select className="input" value={form.frequency} onChange={(e) => setForm((s) => ({ ...s, frequency: e.target.value as Schedule['frequency'] }))}>
                {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map((fr) => (
                  <option key={fr} value={fr}>
                    {t(`reports.schedule.freq.${fr}`)}
                  </option>
                ))}
              </select>
            </label>
            {form.frequency === 'WEEKLY' && (
              <label>
                <span className="label">{t('reports.schedule.weekday')}</span>
                <select className="input" value={form.weekday} onChange={(e) => setForm((s) => ({ ...s, weekday: Number(e.target.value) }))}>
                  {(t('reports.schedule.weekdays', { returnObjects: true }) as string[]).map((d, i) => (
                    <option key={i} value={i + 1}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {form.frequency === 'MONTHLY' && (
              <label>
                <span className="label">{t('reports.schedule.monthDay')}</span>
                <input type="number" min={1} max={31} className="input" value={form.monthDay} onChange={(e) => setForm((s) => ({ ...s, monthDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }))} title={t('reports.schedule.monthDayHint')} />
              </label>
            )}
            <label>
              <span className="label">{t('reports.schedule.time')}</span>
              <input type="time" className="input" value={form.time} onChange={(e) => setForm((s) => ({ ...s, time: e.target.value }))} required />
              <span className="mt-1 block text-[11px] text-muted">{t('reports.schedule.timeHint')}</span>
            </label>
          </div>
          <fieldset>
            <legend className="label">{t('reports.schedule.staff')}</legend>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              {admins.map((u) => (
                <label key={u.id} className={clsx('flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', form.staff.includes(u.id) ? 'border-primary bg-primary/[0.06] text-link' : 'border-line')}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.staff.includes(u.id)}
                    onChange={() => setForm((s) => ({ ...s, staff: s.staff.includes(u.id) ? s.staff.filter((x) => x !== u.id) : [...s.staff, u.id] }))}
                  />
                  {u.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <span className="label">{t('reports.schedule.external')}</span>
            <p className="mb-1.5 text-[11px] text-muted">{t('reports.schedule.externalHint')}</p>
            <p className="mb-1.5 text-[11px] text-muted">{allow.length ? t('reports.schedule.allowList', { list: allow.join(', ') }) : t('reports.schedule.allowListEmpty')}</p>
            <div className="flex gap-2">
              <input
                type="email"
                className="input"
                value={form.email}
                placeholder={t('reports.schedule.externalPlaceholder')}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addEmail();
                  }
                }}
                disabled={!allow.length}
                aria-label={t('reports.schedule.external')}
              />
              <button type="button" className="btn-secondary btn-sm shrink-0" onClick={addEmail} disabled={!allow.length}>
                <Plus className="size-4" /> {t('reports.schedule.addEmail')}
              </button>
            </div>
            {form.emails.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {form.emails.map((m) => (
                  <li key={m} className="flex items-center gap-1 rounded-full bg-primary/[0.06] px-2.5 py-1 text-xs text-link">
                    {m}
                    <button type="button" onClick={() => setForm((s) => ({ ...s, emails: s.emails.filter((x) => x !== m) }))} aria-label={t('reports.remove')}>
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary btn-sm" disabled={create.isPending || (!form.staff.length && !form.emails.length)}>
              <Plus className="size-4" /> {t('reports.schedule.add')}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
