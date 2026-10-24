import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowUpRight, CheckCircle2, HeartHandshake } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate } from '@/components/admin/labels';
import { Panel } from '@/components/admin/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { RiskBadge, RiskReasons } from './RiskBadge';
import { caseCheckInsKey, useCaseCheckIns } from './caseCheckIns';

/**
 * Case card → "After arrival": churn risk with its reasons and every check-in of this worker (and the
 * employer), with "mark as handled" for reported problems. The cross-case list stays at /admin/check-ins.
 */
export default function CaseCheckInsPanel({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useCaseCheckIns(caseId);
  const resolve = useMutation({
    mutationFn: async (id: string) => api.post(`/admin/check-ins/${id}/resolve`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: caseCheckInsKey(caseId) });
      void qc.invalidateQueries({ queryKey: ['my-work'] });
    },
    onError: () => toast.error(t('time.errors.generic')),
  });
  const f = q.data;

  return (
    <Panel
      id="case-checkins"
      title={t('checkInAdmin.title')}
      icon={HeartHandshake}
      actions={
        <Link to="/admin/check-ins" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
          {t('caseLayout.postArrival.allCheckIns')} <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-16 w-full" rounded="xl" />
      ) : !f ? (
        <p className="text-sm text-muted">{t('caseLayout.postArrival.noFollowUp')}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <RiskBadge level={f.riskLevel} score={f.riskScore} />
            <span className="text-muted">
              {t('checkInAdmin.cols.arrived')}: {fmtDate(f.arrivedAt)}
            </span>
            {f.leftJobAt ? (
              <span className="badge bg-danger-bg text-danger-fg">
                {t('checkInAdmin.leftOn', { date: fmtDate(f.leftJobAt) })}
                {f.leftReason && ` · ${t(`checkInAdmin.reasons.${f.leftReason}`)}`}
              </span>
            ) : (
              <span className="badge bg-success-bg text-success-fg">{t('checkInAdmin.employed')}</span>
            )}
          </div>
          {f.riskReasons && <RiskReasons reasons={f.riskReasons} />}
          {f.checkIns.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {f.checkIns.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {t(`checkInAdmin.${c.audience}`)} · {t('checkInAdmin.days', { n: c.offsetDays })}
                      <span className="ml-2 text-xs font-normal text-muted">{fmtDate(c.answeredAt ?? c.sentAt ?? c.dueAt)}</span>
                    </p>
                    <p className={clsx('mt-0.5 text-xs', c.answer === 'ISSUE' && !c.resolvedAt ? 'font-semibold text-danger-fg' : 'text-muted')}>
                      {c.answer === 'OK'
                        ? t('caseLayout.postArrival.ok')
                        : c.answer === 'ISSUE'
                          ? `${t('caseLayout.postArrival.issue')}${c.topics?.length ? `: ${c.topics.map((x) => t(`checkIn.topics.${x}`)).join(', ')}` : ''}`
                          : t('checkInAdmin.pending')}
                    </p>
                    {c.comment && <p className="mt-1 text-xs whitespace-pre-line text-ink/80">“{c.comment}”</p>}
                  </div>
                  {c.answer === 'ISSUE' &&
                    (c.resolvedAt ? (
                      <span className="text-xs text-emerald-700">✓ {t('checkInAdmin.resolved')}</span>
                    ) : (
                      <button type="button" className="btn-secondary btn-sm" disabled={resolve.isPending} onClick={() => resolve.mutate(c.id)}>
                        <CheckCircle2 className="size-3.5" aria-hidden /> {t('checkInAdmin.resolve')}
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
