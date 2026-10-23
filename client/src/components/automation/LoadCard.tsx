import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, Scale, Shuffle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesAutomation } from '@/i18n/pagesAutomation';
import { Panel } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, fullName } from '@/components/admin/labels';
import { toastAutomationError, type Overview } from './types';

registerCopy(pagesAutomation);

export const useAssignmentOverview = (enabled = true) =>
  useQuery({ queryKey: ['assignment-overview'], queryFn: async () => (await api.get<Overview>('/admin/assignment')).data, enabled, refetchInterval: 120_000 });

/** Current load per staff (weighted bar), unassigned count and a one-click rebalance suggestion (ADMIN+). */
export const LoadCard = ({ compact = false }: { compact?: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const { data, isLoading } = useAssignmentOverview(isAdmin);
  const apply = useMutation({
    mutationFn: async () => (await api.post<{ applied: string[]; skipped: string[] }>('/admin/assignment/rebalance', { moves: data!.suggestion.map(({ caseId, fromId, toId }) => ({ caseId, fromId, toId })) })).data,
    onSuccess: (r) => {
      toast.success(t('automation.load.applied', { count: r.applied.length }));
      if (r.skipped.length) toast.message(t('automation.load.skipped', { count: r.skipped.length }));
      void qc.invalidateQueries({ queryKey: ['assignment-overview'] });
      void qc.invalidateQueries({ queryKey: ['ops-workload'] });
    },
    onError: toastAutomationError,
  });
  if (!isAdmin) return null;

  const staff = data?.staff ?? [];
  const max = Math.max(1, ...staff.map((s) => s.weighted));
  const rows = compact ? [...staff].sort((a, b) => b.weighted - a.weighted).slice(0, 8) : staff;

  return (
    <Panel
      title={t('automation.load.title')}
      icon={Scale}
      actions={compact ? <Link to="/admin/automation?tab=assignment" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">{t('automation.load.open_link')} <ArrowRight className="size-3.5" /></Link> : undefined}
    >
      {isLoading || !data ? (
        <Spinner className="size-5 text-brand-600" />
      ) : (
        <div className="space-y-4">
          <p className={clsx('text-sm', data.unassigned ? 'font-semibold text-amber-800' : 'text-muted')}>{t('automation.load.unassigned', { count: data.unassigned })}</p>
          <ul className="space-y-2.5">
            {rows.map((s) => (
              <li key={s.id} className="text-xs">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2">
                  <span className={clsx('min-w-0 truncate font-medium text-navy-900', (!s.inPool || !s.autoAssign || s.absentUntil) && 'text-muted')}>
                    {fullName(s)}
                    {s.absentUntil && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{t('automation.load.absent', { date: fmtDate(s.absentUntil) })}</span>}
                    {!s.autoAssign && <span className="ml-1.5 text-[10px]">({t('automation.load.off')})</span>}
                    {s.autoAssign && !s.inPool && <span className="ml-1.5 text-[10px]">({t('automation.load.notInPool')})</span>}
                  </span>
                  <span className="shrink-0 text-muted tabular-nums">
                    <span className="font-semibold text-navy-900">{t('automation.load.open', { count: s.open })}</span> · {t('automation.load.weighted', { value: s.weighted })}
                    {s.maxOpenCases !== null && ` · ${t('automation.load.max', { max: s.maxOpenCases })}`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface" role="img" aria-label={`${fullName(s)}: ${s.weighted}`}>
                  <div className={clsx('h-full rounded-full', s.maxOpenCases !== null && s.open >= s.maxOpenCases ? 'bg-amber-500' : 'bg-brand-500')} style={{ width: `${Math.round((s.weighted / max) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="rounded-lg border border-line bg-surface/50 p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold text-navy-900"><Shuffle className="size-3.5 text-brand-600" /> {t('automation.load.suggestion')}</p>
            {data.suggestion.length === 0 ? (
              <p className="text-xs text-muted">{t('automation.load.noSuggestion')}</p>
            ) : (
              <>
                <ul className="mb-3 space-y-1 text-xs">
                  {data.suggestion.slice(0, compact ? 5 : 50).map((m) => (
                    <li key={m.caseId}>
                      <Link to={`/admin/cases/${m.caseId}`} className="hover:underline">{t('automation.load.move', { number: m.number, from: m.fromName ?? t('automation.load.unassignedFrom'), to: m.toName })}</Link>
                    </li>
                  ))}
                  {compact && data.suggestion.length > 5 && <li className="text-muted">+{data.suggestion.length - 5}</li>}
                </ul>
                <button type="button" className="btn-primary btn-sm" disabled={apply.isPending} onClick={() => apply.mutate()}>
                  {apply.isPending ? <Spinner className="size-3.5" /> : <Shuffle className="size-3.5" />} {t('automation.load.apply', { count: data.suggestion.length })}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
};

export default LoadCard;
