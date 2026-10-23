import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, Briefcase, MapPin, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/portal/ConfirmDialog';
import { fmtDate } from '@/components/admin/labels';
import { ScorePill } from '@/components/jobs/MatchMeter';
import { toastJobsError, useJobLabels } from '@/components/jobs/labels';
import { APPLICATION_STATUS_TONE, type ApplicationStatus, type EmploymentType } from '@/components/jobs/types';
import type { L10n } from '@/lib/types';
import { PartyChatButton, PartyConversations, PartyThreadFromQuery, usePartyThreads } from '@/components/messagingPlus/PartyThread';

registerCopy(pagesJobs);

interface MyApplication {
  id: string;
  status: ApplicationStatus;
  matchScore: number | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  vacancy: { id: string; slug: string; title: L10n; city: string | null; isOpen: boolean; employmentType: EmploymentType; salaryMin: number | null; salaryMax: number | null };
}

const WITHDRAWABLE: ApplicationStatus[] = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW'];
/** Visual pipeline shown on each card. */
const PIPELINE: ApplicationStatus[] = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED'];

export default function AccountApplications() {
  const { t } = useTranslation();
  usePageTitle(t('jobsArea.applications.title'));
  const L = useJobLabels();
  const qc = useQueryClient();
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-applications'],
    queryFn: async () => (await api.get<{ items: MyApplication[] }>('/vacancies/my/applications')).data.items,
  });
  // Three-party threads (messaging plus): "Söhbət" on an application once Triad Vision opened it.
  const threads = usePartyThreads();
  const threadByApp = new Map((threads.data ?? []).filter((th) => th.applicationId).map((th) => [th.applicationId!, th]));
  const withdraw = useMutation({
    mutationFn: (id: string) => api.post(`/vacancies/my/applications/${id}/withdraw`),
    onSuccess: () => {
      toast.success(t('jobsArea.applications.withdrawn'));
      setWithdrawId(null);
      void qc.invalidateQueries({ queryKey: ['my-applications'] });
    },
    onError: toastJobsError,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-[30vh] place-items-center">
        <Spinner className="size-8 text-brand-600" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-muted">{t('jobsArea.errors.generic')}</p>
        <button type="button" className="btn-ghost btn-sm mt-4" onClick={() => refetch()}>
          {t('jobsArea.common.retry')}
        </button>
      </div>
    );
  }

  const items = data ?? [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-navy-900 sm:text-2xl">{t('jobsArea.applications.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('jobsArea.applications.subtitle')}</p>
        </div>
        <Link to="/jobs" className="btn-ghost btn-sm">
          {t('jobsArea.applications.browse')} <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          {/* TODO(ui): large portal empty state (size-14 icon, display title) -> <EmptyState size="lg" tone="brand"> (portal rework) */}
          <span className="grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600">
            <Briefcase className="size-6" aria-hidden />
          </span>
          <p className="mt-4 font-display text-lg font-bold text-navy-900">{t('jobsArea.applications.empty')}</p>
          <p className="mt-1 max-w-md text-sm text-muted">{t('jobsArea.applications.emptyText')}</p>
          <Link to="/jobs" className="btn-primary btn-sm mt-5">
            {t('jobsArea.applications.browse')}
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((a) => {
            const reached = PIPELINE.indexOf(a.status);
            const ended = a.status === 'REJECTED' || a.status === 'WITHDRAWN';
            return (
              <li key={a.id} className="card flex min-w-0 flex-col p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {a.vacancy.isOpen ? (
                      <Link to={`/jobs/${a.vacancy.slug}`} className="font-display text-lg leading-snug font-bold break-words text-navy-900 hover:text-brand-700">
                        {L.title(a.vacancy.title)}
                      </Link>
                    ) : (
                      <p className="font-display text-lg leading-snug font-bold break-words text-navy-900">{L.title(a.vacancy.title)}</p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      {a.vacancy.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden /> {a.vacancy.city}
                        </span>
                      )}
                      <span>{t('jobsArea.applications.appliedOn', { date: fmtDate(a.createdAt) })}</span>
                      {!a.vacancy.isOpen && <span className="badge bg-neutral-bg text-neutral-fg">{t('jobsArea.applications.closedVacancy')}</span>}
                    </p>
                  </div>
                  <span className={clsx('badge shrink-0', APPLICATION_STATUS_TONE[a.status])}>{L.appStatus(a.status)}</span>
                </div>

                <ol className="mt-5 flex gap-1" aria-label={L.appStatus(a.status)}>
                  {PIPELINE.map((s, i) => (
                    <li
                      key={s}
                      title={L.appStatus(s)}
                      className={clsx(
                        'h-1.5 flex-1 rounded-full',
                        ended ? 'bg-slate-200' : i <= reached ? (a.status === 'ACCEPTED' ? 'bg-emerald-500' : 'bg-brand-600') : 'bg-line',
                      )}
                    />
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted">{t(`jobsArea.applications.hint.${a.status}`)}</p>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
                  <span className="inline-flex items-center gap-2 text-xs text-muted">
                    {t('jobsArea.common.match')} <ScorePill score={a.matchScore} />
                  </span>
                  <PartyChatButton thread={threadByApp.get(a.id)} />
                  {WITHDRAWABLE.includes(a.status) && (
                    <button
                      type="button"
                      className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-ink/70 hover:text-danger"
                      onClick={() => setWithdrawId(a.id)}
                    >
                      <Undo2 className="size-3.5" /> {t('jobsArea.applications.withdraw')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PartyConversations threads={threads.data} exclude={new Set(items.map((a) => a.id))} />
      <PartyThreadFromQuery />

      <ConfirmDialog
        open={!!withdrawId}
        title={t('jobsArea.applications.withdrawTitle')}
        confirmLabel={t('jobsArea.applications.withdraw')}
        danger
        busy={withdraw.isPending}
        onConfirm={() => withdrawId && withdraw.mutate(withdrawId)}
        onClose={() => setWithdrawId(null)}
      >
        <p className="text-sm text-muted">{t('jobsArea.applications.withdrawText')}</p>
      </ConfirmDialog>
    </div>
  );
}
