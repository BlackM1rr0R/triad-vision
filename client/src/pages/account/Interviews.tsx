import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCircle2, Video, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesOps } from '@/i18n/pagesOps';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { InterviewCard } from '@/components/ops/InterviewCard';
import { toastOpsError, type Interview } from '@/components/ops/shared';

registerCopy(pagesOps);

/** Candidate portal: /account/interviews — upcoming / past, confirm or decline, join, add to calendar. */
export default function AccountInterviews() {
  const { t } = useTranslation();
  usePageTitle(t('ops.account.title'));
  const qc = useQueryClient();
  const [declining, setDeclining] = useState<Interview | null>(null);
  const [reason, setReason] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-interviews'],
    queryFn: async () => (await api.get<{ upcoming: Interview[]; past: Interview[] }>('/interviews/mine')).data,
    refetchInterval: 60_000,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['my-interviews'] });
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
        <Spinner className="size-8 text-brand-600" />
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

  const actionsFor = (i: Interview) =>
    i.status === 'PROPOSED' ? (
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-navy-900 sm:text-2xl">{t('ops.account.title')}</h2>
        <p className="mt-1 text-sm text-muted">{t('ops.account.subtitle')}</p>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-bold text-navy-900">{t('ops.account.upcoming')}</h3>
        {data.upcoming.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            {/* TODO(ui): large portal empty state (size-14 icon, display title) -> <EmptyState size="lg" tone="brand"> (portal rework) */}
            <span className="grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600">
              <Video className="size-6" aria-hidden />
            </span>
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
        <h3 className="mb-3 text-sm font-bold text-navy-900">{t('ops.account.past')}</h3>
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
