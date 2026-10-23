import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/settlement/Modal';
import { ACTIVITIES, timeError, useInvalidateTime, type Activity, type TimeEntry } from './api';

const bakuToday = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);

/** Manual entry (new) or edit of an existing entry (date / duration only for finished entries). */
export function EntryDialog({ entry, caseId, taskId, onClose }: { entry?: TimeEntry | null; caseId?: string | null; taskId?: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateTime();
  const [form, setForm] = useState({
    date: entry?.day ?? bakuToday(),
    hours: entry ? String(Math.floor(entry.minutes / 60)) : '0',
    minutes: entry ? String(entry.minutes % 60) : '30',
    activity: (entry?.activity ?? 'DOCUMENTS') as Activity,
    note: entry?.note ?? '',
  });
  const running = !!entry?.running;
  const total = (Number(form.hours) || 0) * 60 + (Number(form.minutes) || 0);
  const done = (msg: string) => {
    toast.success(msg);
    invalidate();
    onClose();
  };
  const save = useMutation({
    mutationFn: async () => {
      if (entry) {
        const body: Record<string, unknown> = { activity: form.activity, note: form.note || null };
        if (!running) Object.assign(body, { date: form.date, minutes: total });
        return api.patch(`/admin/time/entries/${entry.id}`, body);
      }
      return api.post('/admin/time/entries', { caseId: caseId ?? null, taskId: taskId ?? null, date: form.date, minutes: total, activity: form.activity, note: form.note || null });
    },
    onSuccess: () => done(t('time.form.saved')),
    onError: (e) => timeError(t, e),
  });
  const remove = useMutation({ mutationFn: async () => api.delete(`/admin/time/entries/${entry!.id}`), onSuccess: () => done(t('time.form.deleted')), onError: (e) => timeError(t, e) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!running && total < 1) {
      toast.error(t('time.form.durationRequired'));
      return;
    }
    save.mutate();
  };
  return (
    <Modal title={entry ? t('time.form.editTitle') : t('time.form.title')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {entry?.caseNumber && (
          <p className="text-xs text-muted">
            {t('time.form.caseNumber')}: <strong className="text-ink">{entry.caseNumber}</strong>
          </p>
        )}
        {!running && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="block">
              <span className="label">{t('time.form.date')}</span>
              <input type="date" className="input" max={bakuToday()} value={form.date} onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))} required />
            </label>
            <label className="block">
              <span className="label">{t('time.form.hours')}</span>
              <input type="number" min={0} max={16} className="input" inputMode="numeric" value={form.hours} onChange={(e) => setForm((s) => ({ ...s, hours: e.target.value }))} />
            </label>
            <label className="block">
              <span className="label">{t('time.form.minutes')}</span>
              <input type="number" min={0} max={59} step={5} className="input" inputMode="numeric" value={form.minutes} onChange={(e) => setForm((s) => ({ ...s, minutes: e.target.value }))} />
            </label>
          </div>
        )}
        <label className="block">
          <span className="label">{t('time.form.activity')}</span>
          <select className="input" value={form.activity} onChange={(e) => setForm((s) => ({ ...s, activity: e.target.value as Activity }))}>
            {ACTIVITIES.map((a) => (
              <option key={a} value={a}>
                {t(`time.activity.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t('time.form.note')}</span>
          <textarea className="input" rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} />
        </label>
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {entry ? (
            <button type="button" className="btn-ghost btn-sm" disabled={remove.isPending} onClick={() => window.confirm(t('time.form.confirmDelete')) && remove.mutate()}>
              <Trash2 className="size-4" /> {t('time.form.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
              {t('time.form.cancel')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
              <Save className="size-4" /> {t('time.form.save')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
