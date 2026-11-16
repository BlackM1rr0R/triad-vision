import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesRealSalaries, pagesRealSalariesAdmin } from '@/i18n/pagesRealSalaries';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { toastJobsError } from '@/components/jobs/labels';

registerCopy(pagesRealSalaries);
registerCopy(pagesRealSalariesAdmin);

/** Shapes of GET /api/admin/real-salaries (server/src/lib/realSalaries/service.ts → staffOverview). */
interface RecordRow {
  caseId: string;
  caseNumber: string;
  profession: string | null;
  rawProfession: string;
  city: string | null;
  rawCity: string | null;
  employerName: string | null;
  grossMonthly: number | null;
  skip: string | null;
  excluded: boolean;
  exclusionReason: string | null;
  at: string;
}
interface GroupRow {
  profession: string;
  city: string | null;
  workers: number;
  result: { stat: { p25: number; median: number; p75: number; band: string } } | { suppressed: string };
}
interface Overview {
  records: RecordRow[];
  groups: GroupRow[];
  workers: number;
  snapshot: { month: string; computedAt: string; groups: number } | null;
}

const QK = ['admin-real-salaries'];
const eur = (n: number) => `${n.toLocaleString('de-DE')} €`;

/**
 * Admin → Employers → real salary database (/admin/real-salaries): the contract records behind /real-salaries
 * (internal: amounts per case are visible to staff only), exclude / include records, the group preview with
 * exact worker counts and why a group is hidden, and "recompute now" (ADMIN+).
 */
export default function AdminRealSalaries() {
  const { t } = useTranslation();
  usePageTitle(t('realSalariesAdmin.title'));
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const qc = useQueryClient();
  const q = useQuery({ queryKey: QK, queryFn: async () => (await api.get<Overview>('/admin/real-salaries')).data });
  const refresh = () => void qc.invalidateQueries({ queryKey: QK });
  const exclude = useMutation({
    mutationFn: (v: { caseId: string; reason: string | null }) => api.post('/admin/real-salaries/exclusions', v),
    onSuccess: refresh,
    onError: toastJobsError,
  });
  const include = useMutation({ mutationFn: (caseId: string) => api.delete(`/admin/real-salaries/exclusions/${caseId}`), onSuccess: refresh, onError: toastJobsError });
  const recompute = useMutation({
    mutationFn: () => api.post('/admin/real-salaries/recompute'),
    onSuccess: () => {
      toast.success(t('realSalariesAdmin.recomputed'));
      refresh();
      void qc.invalidateQueries({ queryKey: ['real-salaries'] });
    },
    onError: toastJobsError,
  });
  const prof = (p: string | null, raw?: string) => (p ? t(`realSalaries.profession.${p}`, { defaultValue: p }) : (raw ?? '—'));
  const d = q.data;

  return (
    <div>
      <PageHeader
        title={t('realSalariesAdmin.title')}
        subtitle={t('realSalariesAdmin.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/real-salaries" className="btn-secondary btn-sm" target="_blank">
              <ExternalLink className="size-4" aria-hidden /> {t('realSalariesAdmin.publicPage')}
            </Link>
            {isAdmin && (
              <button type="button" className="btn-primary btn-sm" disabled={recompute.isPending} onClick={() => recompute.mutate()}>
                {recompute.isPending ? <Spinner className="size-3.5" /> : <RefreshCw className="size-4" aria-hidden />} {t('realSalariesAdmin.recompute')}
              </button>
            )}
          </div>
        }
      />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError || !d ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted">
            {d.snapshot
              ? t('realSalariesAdmin.snapshot', { month: d.snapshot.month, date: new Date(d.snapshot.computedAt).toLocaleString(), groups: d.snapshot.groups })
              : t('realSalariesAdmin.noSnapshot')}{' '}
            · {t('realSalariesAdmin.workers', { n: d.workers })}
          </p>

          <section className="card p-4">
            <h2 className="font-display text-lg font-semibold text-ink">{t('realSalariesAdmin.groupsTitle')}</h2>
            {d.groups.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t('realSalariesAdmin.empty')}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-1 pr-3">{t('realSalariesAdmin.cols.profession')}</th>
                      <th className="py-1 pr-3">{t('realSalariesAdmin.cols.city')}</th>
                      <th className="py-1 pr-3">{t('realSalariesAdmin.cols.workers')}</th>
                      <th className="py-1">{t('realSalariesAdmin.cols.result')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {d.groups.map((g) => (
                      <tr key={`${g.profession}|${g.city ?? ''}`}>
                        <td className="py-1.5 pr-3 text-ink">{prof(g.profession)}</td>
                        <td className="py-1.5 pr-3">{g.city ?? t('realSalariesAdmin.germany')}</td>
                        <td className="py-1.5 pr-3">{g.workers}</td>
                        <td className="py-1.5">
                          {'stat' in g.result ? (
                            <span className="text-success-fg">
                              {t('realSalariesAdmin.published')}: {eur(g.result.stat.p25)} – {eur(g.result.stat.p75)} ({eur(g.result.stat.median)})
                            </span>
                          ) : (
                            <span className="text-muted">{t(`realSalariesAdmin.suppressed.${g.result.suppressed}`)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="font-display text-lg font-semibold text-ink">{t('realSalariesAdmin.recordsTitle')}</h2>
            {d.records.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t('realSalariesAdmin.empty')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {d.records.map((r) => (
                  <li key={r.caseId} className={clsx('flex flex-wrap items-center justify-between gap-2 py-2', r.excluded && 'opacity-70')}>
                    <div className="min-w-0 text-sm">
                      <Link to={`/admin/cases/${r.caseId}`} className="font-semibold text-link hover:underline">
                        {r.caseNumber}
                      </Link>{' '}
                      · {prof(r.profession, r.rawProfession)} · {r.city ?? r.rawCity ?? '—'}
                      {r.employerName && <span className="text-muted"> · {r.employerName}</span>}
                      <p className="text-xs text-muted">
                        {r.grossMonthly !== null ? eur(r.grossMonthly) : '—'} ·{' '}
                        {r.skip ? t(`realSalariesAdmin.skip.${r.skip}`) : t('realSalariesAdmin.used')}
                        {r.exclusionReason ? ` · ${r.exclusionReason}` : ''}
                      </p>
                    </div>
                    {r.excluded ? (
                      <button type="button" className="btn-secondary btn-sm" disabled={include.isPending} onClick={() => include.mutate(r.caseId)}>
                        {t('realSalariesAdmin.include')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={exclude.isPending}
                        onClick={() => {
                          const reason = window.prompt(t('realSalariesAdmin.reasonPrompt'));
                          if (reason === null) return;
                          exclude.mutate({ caseId: r.caseId, reason: reason.trim() || null });
                        }}
                      >
                        {t('realSalariesAdmin.exclude')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
