import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { CalendarClock, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesFamilyLanguage } from '@/i18n/pagesFamilyLanguage';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { toastError } from '@/components/admin/labels';
import { EXAM_DATES_KEY, useAdminExamDates } from '@/components/german/api';
import { CEFR, PROVIDERS, type GermanExamDate } from '@/components/german/types';

registerCopy(pagesFamilyLanguage);

/** "2027-02-14T09:00:00.000Z" → value of a datetime-local input in the browser's time zone. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const DateForm = ({ initial, onDone }: { initial: GermanExamDate | null; onDone: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState({
    provider: initial?.provider ?? 'GOETHE',
    level: initial?.level ?? '',
    city: initial?.city ?? 'Baku',
    location: initial?.location ?? '',
    examDate: initial ? toLocalInput(initial.examDate) : '',
    registrationDeadline: initial?.registrationDeadline?.slice(0, 10) ?? '',
    link: initial?.link ?? '',
    notes: initial?.notes ?? '',
    published: initial?.published ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      provider: f.provider,
      level: f.level || null,
      city: f.city.trim() || 'Baku',
      location: f.location.trim() || null,
      examDate: new Date(f.examDate).toISOString(),
      registrationDeadline: f.registrationDeadline || null,
      link: f.link.trim() || null,
      notes: f.notes.trim() || null,
      published: f.published,
    };
    try {
      if (initial) await api.patch(`/admin/german/exam-dates/${initial.id}`, body);
      else await api.post('/admin/german/exam-dates', body);
      await qc.invalidateQueries({ queryKey: EXAM_DATES_KEY });
      toast.success(t('germanProgress.examDates.saved'));
      onDone();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="ed-provider" className="label">{t('germanProgress.examDates.provider')}</label>
        <select id="ed-provider" className="input" value={f.provider} onChange={set('provider')}>
          {PROVIDERS.map((p) => <option key={p} value={p}>{t(`germanProgress.exams.providers.${p}`)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="ed-level" className="label">{t('germanProgress.examDates.level')}</label>
        <select id="ed-level" className="input" value={f.level} onChange={set('level')}>
          <option value="">{t('germanProgress.examDates.anyLevel')}</option>
          {CEFR.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="ed-date" className="label">{t('germanProgress.examDates.examDate')}</label>
        <input id="ed-date" type="datetime-local" className="input" value={f.examDate} onChange={set('examDate')} required />
      </div>
      <div>
        <label htmlFor="ed-deadline" className="label">{t('germanProgress.examDates.deadline')}</label>
        <input id="ed-deadline" type="date" className="input" value={f.registrationDeadline} onChange={set('registrationDeadline')} />
      </div>
      <div>
        <label htmlFor="ed-city" className="label">{t('germanProgress.examDates.city')}</label>
        <input id="ed-city" className="input" value={f.city} onChange={set('city')} maxLength={80} />
      </div>
      <div>
        <label htmlFor="ed-location" className="label">{t('germanProgress.examDates.location')}</label>
        <input id="ed-location" className="input" value={f.location} onChange={set('location')} maxLength={200} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="ed-link" className="label">{t('germanProgress.examDates.link')}</label>
        <input id="ed-link" type="url" className="input" value={f.link} onChange={set('link')} maxLength={2000} placeholder="https://" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="ed-notes" className="label">{t('germanProgress.examDates.notes')}</label>
        <input id="ed-notes" className="input" value={f.notes} onChange={set('notes')} maxLength={500} />
      </div>
      <label className="flex items-center justify-between gap-3 text-sm text-navy-900 sm:col-span-2">
        {t('germanProgress.examDates.published')}
        <Switch checked={f.published} onChange={(v) => setF((s) => ({ ...s, published: v }))} label={t('germanProgress.examDates.published')} />
      </label>
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-white btn-sm border border-line" onClick={onDone}>{t('germanProgress.cancel')}</button>
        <button type="submit" className="btn-primary btn-sm" disabled={busy || !f.examDate}>{busy && <Spinner className="size-3.5" />} {t('germanProgress.save')}</button>
      </div>
    </form>
  );
};

/** Admin → İmtahan tarixləri: upcoming German exam dates (Baku) that candidates can pick for their exam. */
export default function GermanExamDates() {
  const { t } = useTranslation();
  const { dateTime, date } = useL10n();
  const { user } = useAuth();
  const qc = useQueryClient();
  usePageTitle(t('germanProgress.examDates.title'));
  const [scope, setScope] = useState<'upcoming' | 'all'>('upcoming');
  const { data, isLoading, error, refetch } = useAdminExamDates(scope);
  const [editing, setEditing] = useState<GermanExamDate | 'new' | null>(null);
  const [deleting, setDeleting] = useState<GermanExamDate | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/admin/german/exam-dates/${deleting.id}`);
      await qc.invalidateQueries({ queryKey: EXAM_DATES_KEY });
      toast.success(t('germanProgress.examDates.deleted'));
      setDeleting(null);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHead
        title={t('germanProgress.examDates.title')}
        subtitle={t('germanProgress.examDates.subtitle')}
        actions={
          canEdit ? (
            <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>
              <Plus className="size-3.5" aria-hidden /> {t('germanProgress.examDates.add')}
            </button>
          ) : (
            <span className="text-xs text-muted">{t('germanProgress.examDates.adminOnly')}</span>
          )
        }
      />
      <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group">
        {(['upcoming', 'all'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={scope === s} className={clsx('rounded-md px-3 py-1.5 text-xs font-semibold transition', scope === s ? 'bg-navy-900 text-white' : 'text-muted hover:text-navy-900')} onClick={() => setScope(s)}>
            {t(`germanProgress.examDates.${s}`)}
          </button>
        ))}
      </div>
      <Panel bodyClassName="p-0">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} onRetry={() => refetch()} />
        ) : !data?.length ? (
          <EmptyState icon={CalendarClock} title={t('germanProgress.examDates.empty')} />
        ) : (
          <ul className="divide-y divide-line">
            {data.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-navy-900">
                    {t(`germanProgress.exams.providers.${d.provider}`)}
                    {d.level && <span className="badge bg-brand-100 text-brand-700">{d.level}</span>}
                    {!d.published && <span className="badge bg-slate-100 text-slate-700">{t('germanProgress.examDates.hidden')}</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-ink/80">
                    {dateTime(d.examDate)} · {[d.location, d.city].filter(Boolean).join(', ')}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                    {d.registrationDeadline && (
                      <span>
                        {t('germanProgress.examDates.deadline')}: {date(d.registrationDeadline)}
                      </span>
                    )}
                    <span>{t('germanProgress.examDates.candidates', { count: d.candidates ?? 0 })}</span>
                    {d.link && (
                      <a href={d.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                        {t('germanProgress.examDates.link')} <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand-700" onClick={() => setEditing(d)} aria-label={t('germanProgress.examDates.edit')}>
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-red-700" onClick={() => setDeleting(d)} aria-label={t('germanProgress.delete')}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? t('germanProgress.examDates.add') : t('germanProgress.examDates.edit')} size="lg">
        {editing && <DateForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title={t('germanProgress.examDates.deleteTitle')}
        message={t('germanProgress.examDates.deleteBody')}
        confirmLabel={t('germanProgress.delete')}
        loading={busy}
      />
    </div>
  );
}
