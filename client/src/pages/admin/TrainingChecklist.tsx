import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, CheckCircle2, Circle, PartyPopper } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesStaffOnboarding } from '@/i18n/pagesStaffOnboarding';
import { ErrorBlock, ListSkeleton, PageHead, Panel } from '@/components/admin/ui';
import { fmtDate, toastError } from '@/components/admin/labels';
import { ProgressBar } from '@/components/staffOnboarding/ProgressBar';
import { pick, trainingChecklistKey, trainingTeamKey, type TeamMember, type TrainingChecklist as Checklist } from '@/components/staffOnboarding/api';

registerCopy(pagesStaffOnboarding);

/**
 * Admin → New staff checklist (/admin/training-checklist, STAFF+): ten tasks done in the real system, detected
 * by the server (requests / database) or ticked by hand; ADMIN+ also see the team's progress
 * (server lib/staffOnboarding).
 */
export default function AdminTrainingChecklist() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('sob.training.title'));
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: trainingChecklistKey, queryFn: async () => (await api.get<Checklist>('/admin/training-checklist/me')).data, refetchOnWindowFocus: true });
  const tick = useMutation({
    mutationFn: async (p: { id: string; done: boolean }) => (await api.post<Checklist>(`/admin/training-checklist/me/${p.id}`, { done: p.done })).data,
    onSuccess: (data) => {
      qc.setQueryData(trainingChecklistKey, data);
      void qc.invalidateQueries({ queryKey: trainingTeamKey });
    },
    onError: (e) => toastError(e, t('sob.error')),
  });

  if (q.isLoading) return <ListSkeleton rows={10} cols={2} />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const progressLabel = t('sob.training.progress', { done: d.done, total: d.total });

  return (
    <div className="space-y-6">
      <PageHead title={t('sob.training.title')} subtitle={t('sob.training.subtitle')} />

      <Panel title={t('sob.training.mine')}>
        <div className="mb-4 space-y-1.5">
          <p className="text-sm font-medium text-ink">{progressLabel}</p>
          <ProgressBar percent={d.percent} label={progressLabel} />
        </div>
        {d.complete && (
          <p role="status" className="mb-4 flex items-center gap-2 rounded-lg bg-success-bg px-3 py-2 text-sm text-success-fg">
            <PartyPopper className="size-4" aria-hidden /> {t('sob.training.complete')}
          </p>
        )}
        <ol className="divide-y divide-line">
          {d.tasks.map((task, idx) => (
            <li key={task.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <span className="flex min-w-0 flex-1 items-start gap-3">
                {task.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-fg" aria-hidden /> : <Circle className="mt-0.5 size-5 shrink-0 text-subtle" aria-hidden />}
                <span className="min-w-0">
                  <span className={clsx('block text-sm font-semibold', task.done ? 'text-muted line-through decoration-1' : 'text-ink')}>
                    {idx + 1}. {pick(task.title, i18n.language)}
                    <span className="sr-only"> — {task.done ? t('sob.setup.state.done') : t('sob.setup.state.open')}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{pick(task.how, i18n.language)}</span>
                  <span className="mt-1 flex flex-wrap gap-2 text-[11px]">
                    {task.target > 1 && <span className="num rounded bg-sunken px-1.5 py-0.5 text-muted">{t('sob.training.count', { count: task.count, target: task.target })}</span>}
                    {task.auto && <span className="rounded bg-success-bg px-1.5 py-0.5 text-success-fg">{t('sob.training.auto')}</span>}
                    {task.manual && !task.auto && <span className="rounded bg-neutral-bg px-1.5 py-0.5 text-neutral-fg">{t('sob.training.manual')}</span>}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 gap-2 pl-8 sm:pl-0">
                <Link to={task.link} className="btn-secondary btn-sm">
                  {t('sob.training.go')} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
                {!task.auto &&
                  (task.manual ? (
                    <button type="button" className="btn-ghost btn-sm" disabled={tick.isPending} onClick={() => tick.mutate({ id: task.id, done: false })}>
                      {t('sob.training.undo')}
                    </button>
                  ) : (
                    <button type="button" className="btn-primary btn-sm" disabled={tick.isPending} onClick={() => tick.mutate({ id: task.id, done: true })}>
                      {t('sob.training.markDone')}
                    </button>
                  ))}
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      {isAdmin && <TeamProgress tasks={d.tasks.map((x) => ({ id: x.id, title: pick(x.title, i18n.language) }))} />}
    </div>
  );
}

const TeamProgress = ({ tasks }: { tasks: { id: string; title: string }[] }) => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: trainingTeamKey, queryFn: async () => (await api.get<{ members: TeamMember[] }>('/admin/training-checklist/team')).data });
  const titleOf = new Map(tasks.map((x) => [x.id, x.title]));
  return (
    <Panel title={t('sob.training.team.title')}>
      {q.isLoading ? (
        <ListSkeleton rows={4} cols={3} />
      ) : q.error ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">{t('sob.training.team.name')}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t('sob.training.team.joined')}</th>
                <th scope="col" className="w-48 py-2 pr-3 font-medium">{t('sob.training.team.progress')}</th>
                <th scope="col" className="py-2 font-medium">{t('sob.training.team.open')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(q.data?.members ?? []).map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-3 text-ink">
                    {m.name} <span className="text-xs text-muted">· {t(`sob.whatsNew.roles.${m.role}`)}</span>
                  </td>
                  <td className="num py-2 pr-3 text-muted">{fmtDate(m.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar percent={m.percent} label={`${m.name}: ${m.done}/${m.total}`} />
                      <span className="num w-12 shrink-0 text-right text-xs text-muted">
                        {m.done}/{m.total}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 text-xs text-muted">{m.open.length ? m.open.map((id) => titleOf.get(id) ?? id).join(', ') : t('sob.training.team.none')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};
