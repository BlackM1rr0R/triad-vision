import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Ban, CalendarDays, Plus, Video } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesOps } from '@/i18n/pagesOps';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { toLocalInput } from '@/components/admin/labels';
import { InterviewCard } from '@/components/ops/InterviewCard';
import { defaultStart, toastOpsError, type Interview } from '@/components/ops/shared';
import { Empty, Loading, Section } from './shared';
import { EvaluateButton } from '@/components/placement/Evaluations';

registerCopy(pagesOps);

interface Applicant { applicationId: string; status: string; candidateId: string; name: string; profession: string | null; vacancy: { id: string; title: L10n } }

/** Employer portal tab: propose interviews to presented candidates, confirm / reschedule / cancel. */
export const CompanyInterviews = () => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const [proposing, setProposing] = useState(false);
  const [applicationId, setApplicationId] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [minutes, setMinutes] = useState(45);
  const [notes, setNotes] = useState('');
  const [reschedule, setReschedule] = useState<{ id: string; at: string } | null>(null);
  const [cancelling, setCancelling] = useState<{ id: string; reason: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['company-interviews'],
    queryFn: async () => (await api.get<{ items: Interview[] }>('/interviews')).data.items,
    refetchInterval: 60_000,
  });
  const applicants = useQuery({
    queryKey: ['company-interview-applicants'],
    queryFn: async () => (await api.get<{ items: Applicant[] }>('/interviews/applicants')).data.items,
    enabled: proposing,
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['company-interviews'] });
    void qc.invalidateQueries({ queryKey: ['company-candidates'] });
  };
  const propose = useMutation({
    mutationFn: () => api.post('/interviews', { applicationId, startsAt: new Date(startsAt).toISOString(), minutes, notes: notes.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('ops.company.proposed'));
      setProposing(false);
      setApplicationId('');
      setNotes('');
      setStartsAt(defaultStart());
      invalidate();
    },
    onError: toastOpsError,
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/interviews/${id}`, body),
    onSuccess: () => {
      toast.success(t('ops.interviews.updated'));
      setReschedule(null);
      setCancelling(null);
      invalidate();
    },
    onError: toastOpsError,
  });

  if (isLoading) return <Loading />;
  if (isError || !data) {
    return (
      <Section>
        <p className="text-sm text-muted">{t('ops.common.loadFailed')}</p>
        <button type="button" className="btn-ghost btn-sm mt-4" onClick={() => refetch()}>{t('ops.common.refresh')}</button>
      </Section>
    );
  }
  const now = Date.now();
  const upcoming = data.filter((i) => new Date(i.endsAt).getTime() >= now && i.status !== 'CANCELLED');
  const past = data.filter((i) => !upcoming.includes(i)).reverse();

  /** After the interview started (or was marked done) the employer can evaluate it. */
  const evaluable = (i: Interview) => i.status === 'DONE' || ((i.status === 'PROPOSED' || i.status === 'CONFIRMED') && new Date(i.startsAt).getTime() <= now);
  const actionsFor = (i: Interview) => {
    const live = i.status === 'PROPOSED' || i.status === 'CONFIRMED';
    if (!live) return null;
    return (
      <>
        {evaluable(i) && <EvaluateButton interviewId={i.id} />}
        <button type="button" className="btn-secondary btn-sm" onClick={() => setReschedule({ id: i.id, at: toLocalInput(i.startsAt) })}>
          <CalendarDays className="size-3.5" /> {t('ops.interviews.actions.reschedule')}
        </button>
        <button type="button" className="btn-secondary btn-sm text-danger" onClick={() => setCancelling({ id: i.id, reason: '' })}>
          <Ban className="size-3.5" /> {t('ops.interviews.actions.cancel')}
        </button>
      </>
    );
  };

  return (
    <div className="space-y-6">
      <Section
        title={t('ops.company.title')}
        icon={Video}
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => setProposing(true)}>
            <Plus className="size-3.5" /> {t('ops.company.propose')}
          </button>
        }
      >
        <p className="-mt-2 mb-5 text-sm text-muted">{t('ops.company.subtitle')} {t('ops.company.hint')}</p>
        {upcoming.length === 0 ? (
          <Empty icon={Video} title={t('ops.company.empty')} text={t('ops.company.subtitle')} />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {upcoming.map((i) => (
              <li key={i.id}><InterviewCard interview={i} audience="company" actions={actionsFor(i)} /></li>
            ))}
          </ul>
        )}
      </Section>
      {past.length > 0 && (
        <Section title={t('ops.interviews.past')}>
          <ul className="grid gap-4 lg:grid-cols-2">
            {past.map((i) => (
              <li key={i.id}><InterviewCard interview={i} audience="company" compact actions={evaluable(i) ? <EvaluateButton interviewId={i.id} /> : undefined} /></li>
            ))}
          </ul>
        </Section>
      )}

      <Modal
        open={proposing}
        onClose={() => setProposing(false)}
        title={t('ops.company.propose')}
        description={t('ops.company.hint')}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setProposing(false)}>{t('ops.common.cancel')}</button>
            <button type="button" className="btn-primary btn-sm" disabled={!applicationId || !startsAt || propose.isPending} onClick={() => propose.mutate()}>
              {propose.isPending ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} {t('ops.interviews.actions.propose')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="ci-app">{t('ops.company.applicant')}</label>
            {applicants.data && applicants.data.length === 0 ? (
              <p className="text-sm text-muted">{t('ops.company.noApplicants')}</p>
            ) : (
              <select id="ci-app" data-autofocus className="input" value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
                <option value="">{t('ops.company.chooseApplicant')}</option>
                {applicants.data?.map((a) => (
                  <option key={a.applicationId} value={a.applicationId}>{a.name}{a.profession ? ` · ${a.profession}` : ''} — {tr(a.vacancy.title)}</option>
                ))}
              </select>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ci-start">{t('ops.interviews.fields.startsAt')}</label>
              <input id="ci-start" type="datetime-local" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="ci-min">{t('ops.interviews.fields.minutes')}</label>
              <select id="ci-min" className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ci-notes">{t('ops.interviews.fields.notes')}</label>
            <textarea id="ci-notes" rows={3} maxLength={4000} className="input" placeholder={t('ops.interviews.fields.notesPh')} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <p className="text-[11px] text-muted">{t('ops.interviews.timezone')}</p>
        </div>
      </Modal>

      <Modal
        open={!!reschedule}
        onClose={() => setReschedule(null)}
        size="sm"
        title={t('ops.interviews.actions.reschedule')}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setReschedule(null)}>{t('ops.common.cancel')}</button>
            <button type="button" className="btn-primary btn-sm" disabled={!reschedule?.at || patch.isPending} onClick={() => reschedule && patch.mutate({ id: reschedule.id, body: { startsAt: new Date(reschedule.at).toISOString() } })}>
              {patch.isPending ? <Spinner className="size-3.5" /> : null} {t('ops.common.save')}
            </button>
          </>
        }
      >
        <label className="label" htmlFor="ci-re">{t('ops.interviews.fields.newTime')}</label>
        <input id="ci-re" data-autofocus type="datetime-local" className="input" value={reschedule?.at ?? ''} onChange={(e) => setReschedule((r) => (r ? { ...r, at: e.target.value } : r))} />
      </Modal>

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        size="sm"
        title={t('ops.interviews.cancelTitle')}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setCancelling(null)}>{t('ops.common.cancel')}</button>
            <button type="button" className="btn-danger btn-sm" disabled={patch.isPending} onClick={() => cancelling && patch.mutate({ id: cancelling.id, body: { status: 'CANCELLED', reason: cancelling.reason.trim() || undefined } })}>
              {patch.isPending ? <Spinner className="size-3.5" /> : <Ban className="size-3.5" />} {t('ops.interviews.actions.cancel')}
            </button>
          </>
        }
      >
        <label className="label" htmlFor="ci-cr">{t('ops.interviews.fields.reason')}</label>
        <textarea id="ci-cr" data-autofocus rows={3} maxLength={2000} className="input" value={cancelling?.reason ?? ''} onChange={(e) => setCancelling((c) => (c ? { ...c, reason: e.target.value } : c))} />
      </Modal>
    </div>
  );
};
