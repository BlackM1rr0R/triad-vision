import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, CalendarDays, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesOps } from '@/i18n/pagesOps';
import { pagesInterviewCalendar } from '@/i18n/pagesInterviewCalendar';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { InterviewCard } from '@/components/ops/InterviewCard';
import { toastOpsError, type Interview } from '@/components/ops/shared';
import { CalendarDay } from '@/components/illustrations';
import { SlotPicker } from '@/components/ops/SlotPicker';
import { fmtBaku, type InterviewInvite } from '@/components/ops/interviewCalendar';

registerCopy(pagesOps);
registerCopy(pagesInterviewCalendar);

/** Candidate portal: /account/interviews — upcoming / past, confirm or decline, join, add to calendar. */
export default function AccountInterviews() {
  const { t, i18n } = useTranslation();
  const { tr } = useL10n();
  usePageTitle(t('ops.account.title'));
  const [picking, setPicking] = useState<InterviewInvite | null>(null);
  const qc = useQueryClient();
  const [declining, setDeclining] = useState<Interview | null>(null);
  const [reason, setReason] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-interviews'],
    queryFn: async () => (await api.get<{ upcoming: Interview[]; past: Interview[] }>('/interviews/mine')).data,
    refetchInterval: 60_000,
  });
  // "Pick a time" invitations (open ones, and the booked ones with their move / cancel rules).
  const invites = useQuery({
    queryKey: ['my-interview-invites'],
    queryFn: async () => (await api.get<{ items: InterviewInvite[] }>('/interview-calendar/invites')).data.items,
    refetchInterval: 60_000,
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['my-interviews'] });
    void qc.invalidateQueries({ queryKey: ['my-interview-invites'] });
  };
  const confirm = useMutation({
    mutationFn: (id: string) => api.post(`/interviews/${id}/confirm`),
    onSuccess: () => {
      toast.success(t('ops.account.confirmed'));
      invalidate();
    },
    onError: toastOpsError,
  });
  const decline = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/interviews/${id}/decline`, { reason: reason.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('ops.account.declined'));
      setDeclining(null);
      setReason('');
      invalidate();
    },
    onError: toastOpsError,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-[30vh] place-items-center">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-muted">{t('ops.common.loadFailed')}</p>
        <button type="button" className="btn-ghost btn-sm mt-4" onClick={() => refetch()}>
          {t('ops.common.refresh')}
        </button>
      </div>
    );
  }

  const openInvites = (invites.data ?? []).filter((v) => v.status === 'OPEN');
  const inviteOf = (i: Interview) => (i.inviteId ? invites.data?.find((v) => v.id === i.inviteId) : undefined);

  const actionsFor = (i: Interview) => {
    const inv = inviteOf(i);
    // A self-booked time: move / give back only within the employer's rules.
    if (inv && i.status === 'CONFIRMED') {
      return (
        <>
          {inv.canMove && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setPicking(inv)}>
              <CalendarDays className="size-3.5" /> {t('ivcal.change')}
            </button>
          )}
          {inv.canCancel ? (
            <button type="button" className="btn-white btn-sm ml-auto border border-line text-danger" onClick={() => setDeclining(i)}>
              <XCircle className="size-3.5" /> {t('ops.account.decline')}
            </button>
          ) : null}
          <p className="w-full text-[11px] text-muted">
            {inv.canCancel && inv.moveUntil ? `${t('ivcal.moveUntil', { date: fmtBaku(inv.moveUntil, i18n.language) })} ${t('ivcal.movesLeft', { count: inv.reschedulesLeft })}` : t('ivcal.fixed')}
          </p>
        </>
      );
    }
    return i.status === 'PROPOSED' ? (
      <>
        <button type="button" className="btn-primary btn-sm" disabled={confirm.isPending} onClick={() => confirm.mutate(i.id)}>
          {confirm.isPending && confirm.variables === i.id ? <Spinner className="size-3.5" /> : <CheckCircle2 className="size-3.5" />} {t('ops.account.confirm')}
        </button>
        <button type="button" className="btn-secondary btn-sm text-danger" onClick={() => setDeclining(i)}>
          <XCircle className="size-3.5" /> {t('ops.account.decline')}
        </button>
      </>
    ) : i.status === 'CONFIRMED' ? (
      <button type="button" className="btn-white btn-sm ml-auto border border-line text-danger" onClick={() => setDeclining(i)}>
        <XCircle className="size-3.5" /> {t('ops.account.decline')}
      </button>
    ) : null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="type-page-title">{t('ops.account.title')}</h2>
        <p className="mt-1 text-sm text-muted">{t('ops.account.subtitle')}</p>
      </div>

      {openInvites.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-ink">{t('ivcal.pickTitle')}</h3>
          <ul className="grid gap-4 lg:grid-cols-2">
            {openInvites.map((v) => (
              <li key={v.id} className="card flex flex-col gap-3 border-brand-200 p-4 sm:p-5">
                <div>
                  <p className="font-display text-base font-bold text-navy-900">{t('ivcal.from_', { company: v.company.name })}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {v.application ? `${tr(v.application.vacancy.title)} · ` : ''}{t('ivcal.minutes', { count: v.minutes })}
                  </p>
                </div>
                {v.notes && <p className="rounded-lg bg-surface/70 px-3 py-2 text-xs whitespace-pre-wrap text-ink/80">{v.notes}</p>}
                <button type="button" className="btn-primary btn-sm self-start" onClick={() => setPicking(v)}>
                  <CalendarClock className="size-3.5" /> {t('ivcal.pick')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">{t('ops.account.upcoming')}</h3>
        {data.upcoming.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <CalendarDay className="w-40" />
            <p className="mt-4 max-w-md text-sm text-muted">{t('ops.account.empty')}</p>
          </div>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {data.upcoming.map((i) => (
              <li key={i.id}>
                <InterviewCard interview={i} audience="candidate" actions={actionsFor(i)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">{t('ops.account.past')}</h3>
        {data.past.length === 0 ? (
          <p className="text-sm text-muted">{t('ops.account.noPast')}</p>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {data.past.map((i) => (
              <li key={i.id}>
                <InterviewCard interview={i} audience="candidate" compact />
              </li>
            ))}
          </ul>
        )}
      </section>

      <SlotPicker
        invite={picking}
        onClose={() => setPicking(null)}
        onDone={() => {
          setPicking(null);
          invalidate();
        }}
      />

      <Modal
        open={!!declining}
        onClose={() => setDeclining(null)}
        size="sm"
        title={t('ops.account.declineTitle')}
        description={t('ops.account.declineText')}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDeclining(null)}>{t('ops.common.cancel')}</button>
            <button type="button" className="btn-danger btn-sm" disabled={decline.isPending} onClick={() => declining && decline.mutate({ id: declining.id, reason })}>
              {decline.isPending ? <Spinner className="size-3.5" /> : <XCircle className="size-3.5" />} {t('ops.account.decline')}
            </button>
          </>
        }
      >
        <label className="label" htmlFor="iv-reason">{t('ops.account.declineReason')}</label>
        <textarea id="iv-reason" data-autofocus rows={3} maxLength={2000} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
}
