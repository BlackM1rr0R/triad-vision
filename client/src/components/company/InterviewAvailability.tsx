import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, Clock3, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesOps } from '@/i18n/pagesOps';
import { pagesInterviewCalendar } from '@/i18n/pagesInterviewCalendar';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { toastOpsError } from '@/components/ops/shared';
import { SETTING_KEYS, type Availability, type AvailabilityRule, type InterviewInvite, type SchedulingSettings, type Slot } from '@/components/ops/interviewCalendar';
import { Section } from './shared';

registerCopy(pagesOps);
registerCopy(pagesInterviewCalendar);

interface Applicant { applicationId: string; status: string; candidateId: string; name: string; profession: string | null; vacancy: { id: string; title: L10n } }

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const todayIso = () => new Date().toISOString().slice(0, 10);

interface Draft {
  settings: SchedulingSettings;
  weekly: AvailabilityRule[];
  dates: AvailabilityRule[];
  blocks: (AvailabilityRule & { wholeDay: boolean })[];
}

const toDraft = (a: Availability): Draft => ({
  settings: a.settings,
  weekly: a.weekly,
  dates: a.dates,
  blocks: a.blocks.map((b) => ({ ...b, wholeDay: !b.startTime })),
});

/**
 * Employer portal: free hours for interviews (weekly + one-off, German time), booking rules,
 * "let the candidate pick a time" invitations and the ones still waiting for a pick.
 */
export const CompanyInterviewCalendar = ({ onChanged }: { onChanged?: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [inviting, setInviting] = useState(false);
  const [applicationId, setApplicationId] = useState('');
  const [minutes, setMinutes] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  const availability = useQuery({
    queryKey: ['company-interview-availability'],
    queryFn: async () => (await api.get<Availability>('/interview-calendar/availability')).data,
  });
  const preview = useQuery({
    queryKey: ['company-interview-preview'],
    queryFn: async () => (await api.get<{ slots: Slot[] }>('/interview-calendar/availability/preview', { params: { to: new Date(Date.now() + 14 * 864e5).toISOString() } })).data.slots,
  });
  const invites = useQuery({
    queryKey: ['company-interview-invites'],
    queryFn: async () => (await api.get<{ items: InterviewInvite[] }>('/interview-calendar/invites', { params: { status: 'OPEN' } })).data.items,
    refetchInterval: 60_000,
  });
  const applicants = useQuery({
    queryKey: ['company-interview-applicants'],
    queryFn: async () => (await api.get<{ items: Applicant[] }>('/interviews/applicants')).data.items,
    enabled: inviting,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['company-interview-availability'] });
    void qc.invalidateQueries({ queryKey: ['company-interview-preview'] });
    void qc.invalidateQueries({ queryKey: ['company-interview-invites'] });
    onChanged?.();
  };

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api.put('/interview-calendar/availability', {
        settings: d.settings,
        weekly: d.weekly.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
        dates: d.dates.map(({ day, startTime, endTime, note }) => ({ day, startTime, endTime, note: note || null })),
        blocks: d.blocks.map(({ day, startTime, endTime, note, wholeDay }) => ({ day, startTime: wholeDay ? null : startTime, endTime: wholeDay ? null : endTime, note: note || null })),
      }),
    onSuccess: () => {
      toast.success(t('ivcal.saved'));
      setDraft(null);
      refresh();
    },
    onError: toastOpsError,
  });
  const invite = useMutation({
    mutationFn: () => api.post('/interview-calendar/invites', { applicationId, minutes: minutes || undefined, notes: notes.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('ivcal.invited'));
      setInviting(false);
      setApplicationId('');
      setNotes('');
      setMinutes('');
      refresh();
    },
    onError: toastOpsError,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => api.delete(`/interview-calendar/invites/${id}`),
    onSuccess: () => {
      toast.success(t('ivcal.withdrawn'));
      refresh();
    },
    onError: toastOpsError,
  });

  const a = availability.data;
  const hasHours = !!a && (a.weekly.length > 0 || a.dates.length > 0);
  const patch = (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d));
  const setRow = <K extends 'weekly' | 'dates' | 'blocks'>(key: K, idx: number, row: Partial<Draft[K][number]>) =>
    patch((d) => ({ ...d, [key]: d[key].map((r, i) => (i === idx ? { ...r, ...row } : r)) }));
  const removeRow = (key: 'weekly' | 'dates' | 'blocks', idx: number) => patch((d) => ({ ...d, [key]: d[key].filter((_, i) => i !== idx) }));

  const timeInputs = (key: 'weekly' | 'dates' | 'blocks', idx: number, r: AvailabilityRule) => (
    <>
      <input type="time" aria-label={t('ivcal.from')} className="input w-28" value={r.startTime ?? ''} onChange={(e) => setRow(key, idx, { startTime: e.target.value })} />
      <span className="text-muted">–</span>
      <input type="time" aria-label={t('ivcal.to')} className="input w-28" value={r.endTime ?? ''} onChange={(e) => setRow(key, idx, { endTime: e.target.value })} />
    </>
  );
  const removeBtn = (key: 'weekly' | 'dates' | 'blocks', idx: number) => (
    <button type="button" className="btn-ghost btn-sm text-danger" aria-label={t('ivcal.remove')} onClick={() => removeRow(key, idx)}>
      <Trash2 className="size-3.5" />
    </button>
  );

  return (
    <Section
      title={t('ivcal.title')}
      icon={CalendarClock}
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={!a} onClick={() => a && setDraft(toDraft(a))}>
            <Clock3 className="size-4" aria-hidden /> {t('ivcal.open')}
          </button>
          <button type="button" className="btn-primary" disabled={!hasHours} title={hasHours ? undefined : t('ivcal.noAvailability')} onClick={() => setInviting(true)}>
            <Send className="size-4" aria-hidden /> {t('ivcal.invite')}
          </button>
        </div>
      }
    >
      <p className="-mt-2 mb-3 text-sm text-muted">{t('ivcal.subtitle')}</p>
      {availability.isLoading ? (
        <Spinner className="size-5 text-primary" />
      ) : !hasHours ? (
        <p className="text-sm text-amber-800">{t('ivcal.noAvailability')}</p>
      ) : (
        <p className="text-sm text-ink/80">{t('ivcal.preview', { count: preview.data?.length ?? 0 })} <span className="text-xs text-muted">{t('ivcal.germanTime')}</span></p>
      )}

      {!!invites.data?.length && (
        <div className="mt-5">
          <h4 className="mb-2 text-sm font-semibold text-ink">{t('ivcal.openInvites')}</h4>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {invites.data.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-navy-900">{v.candidate.name}</span>
                  {v.application && <span className="text-muted"> · {tr(v.application.vacancy.title)}</span>}
                  <span className="text-muted"> · {t('ivcal.minutes', { count: v.minutes })}</span>
                </span>
                <button type="button" className="btn-ghost btn-sm text-danger" disabled={withdraw.isPending} onClick={() => withdraw.mutate(v.id)}>
                  <Undo2 className="size-3.5" /> {t('ivcal.withdraw')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        size="lg"
        title={t('ivcal.title')}
        description={t('ivcal.germanTime')}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDraft(null)}>{t('ops.common.cancel')}</button>
            <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => draft && save.mutate(draft)}>
              {save.isPending ? <Spinner className="size-3.5" /> : null} {t('ops.common.save')}
            </button>
          </>
        }
      >
        {draft && (
          <div className="space-y-6">
            <section>
              <h4 className="mb-2 text-sm font-semibold text-ink">{t('ivcal.weekly')}</h4>
              <ul className="space-y-2">
                {WEEKDAYS.map((wd) => (
                  <li key={wd} className="flex flex-wrap items-start gap-2">
                    <span className="w-32 pt-2 text-sm text-ink/80">{t(`ivcal.wd${wd}`)}</span>
                    <div className="flex flex-1 flex-col gap-2">
                      {draft.weekly.map((r, idx) =>
                        r.weekday === wd ? (
                          <div key={idx} className="flex flex-wrap items-center gap-2">
                            {timeInputs('weekly', idx, r)}
                            {removeBtn('weekly', idx)}
                          </div>
                        ) : null,
                      )}
                      <button type="button" className="btn-ghost btn-sm self-start" onClick={() => patch((d) => ({ ...d, weekly: [...d.weekly, { weekday: wd, startTime: '09:00', endTime: '12:00' }] }))}>
                        <Plus className="size-3.5" /> {t('ivcal.addRange')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-ink">{t('ivcal.dates')}</h4>
              {draft.dates.length === 0 && <p className="mb-2 text-xs text-muted">{t('ivcal.none')}</p>}
              <ul className="space-y-2">
                {draft.dates.map((r, idx) => (
                  <li key={idx} className="flex flex-wrap items-center gap-2">
                    <input type="date" aria-label={t('ivcal.day')} className="input w-40" min={todayIso()} value={r.day ?? ''} onChange={(e) => setRow('dates', idx, { day: e.target.value })} />
                    {timeInputs('dates', idx, r)}
                    {removeBtn('dates', idx)}
                  </li>
                ))}
              </ul>
              <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => patch((d) => ({ ...d, dates: [...d.dates, { day: todayIso(), startTime: '09:00', endTime: '12:00' }] }))}>
                <Plus className="size-3.5" /> {t('ivcal.addDate')}
              </button>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-ink">{t('ivcal.blocks')}</h4>
              {draft.blocks.length === 0 && <p className="mb-2 text-xs text-muted">{t('ivcal.none')}</p>}
              <ul className="space-y-2">
                {draft.blocks.map((r, idx) => (
                  <li key={idx} className="flex flex-wrap items-center gap-2">
                    <input type="date" aria-label={t('ivcal.day')} className="input w-40" value={r.day ?? ''} onChange={(e) => setRow('blocks', idx, { day: e.target.value })} />
                    <label className="flex items-center gap-1.5 text-xs text-ink/80">
                      <input type="checkbox" checked={r.wholeDay} onChange={(e) => setRow('blocks', idx, { wholeDay: e.target.checked, startTime: r.startTime || '09:00', endTime: r.endTime || '12:00' })} />
                      {t('ivcal.wholeDay')}
                    </label>
                    {!r.wholeDay && timeInputs('blocks', idx, r)}
                    <input className="input w-40" maxLength={200} placeholder={t('ivcal.note')} value={r.note ?? ''} onChange={(e) => setRow('blocks', idx, { note: e.target.value })} />
                    {removeBtn('blocks', idx)}
                  </li>
                ))}
              </ul>
              <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => patch((d) => ({ ...d, blocks: [...d.blocks, { day: todayIso(), wholeDay: true }] }))}>
                <Plus className="size-3.5" /> {t('ivcal.addBlock')}
              </button>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-ink">{t('ivcal.rules')}</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {SETTING_KEYS.map((k) => (
                  <div key={k}>
                    <label className="label" htmlFor={`ivs-${k}`}>{t(`ivcal.${k}`)}</label>
                    <input
                      id={`ivs-${k}`}
                      type="number"
                      min={0}
                      className="input"
                      value={draft.settings[k]}
                      onChange={(e) => patch((d) => ({ ...d, settings: { ...d.settings, [k]: Number(e.target.value) } }))}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </Modal>

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title={t('ivcal.invite')}
        description={t('ivcal.inviteHint')}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setInviting(false)}>{t('ops.common.cancel')}</button>
            <button type="button" className="btn-primary btn-sm" disabled={!applicationId || invite.isPending} onClick={() => invite.mutate()}>
              {invite.isPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />} {t('ivcal.inviteSend')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="ivi-app">{t('ops.company.applicant')}</label>
            {applicants.data && applicants.data.length === 0 ? (
              <p className="text-sm text-muted">{t('ops.company.noApplicants')}</p>
            ) : (
              <select id="ivi-app" data-autofocus className="input" value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
                <option value="">{t('ops.company.chooseApplicant')}</option>
                {applicants.data?.map((ap) => (
                  <option key={ap.applicationId} value={ap.applicationId}>{ap.name}{ap.profession ? ` · ${ap.profession}` : ''} — {tr(ap.vacancy.title)}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="label" htmlFor="ivi-min">{t('ivcal.slotMinutes')}</label>
            <select id="ivi-min" className="input" value={minutes} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{a ? t('ivcal.minutes', { count: a.settings.slotMinutes }) : '—'}</option>
              {[15, 30, 45, 60, 90].filter((m) => m !== a?.settings.slotMinutes).map((m) => <option key={m} value={m}>{t('ivcal.minutes', { count: m })}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ivi-notes">{t('ops.interviews.fields.notes')}</label>
            <textarea id="ivi-notes" rows={3} maxLength={4000} className="input" placeholder={t('ops.interviews.fields.notesPh')} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </Modal>
    </Section>
  );
};
