import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileSignature } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesPlacement } from '@/i18n/pagesPlacement';
import { pagesJobs } from '@/i18n/pagesJobs';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtDate, fullName } from '@/components/admin/labels';
import { useJobLabels } from '@/components/jobs/labels';
import { ContractWarnings } from '@/components/placement/EmploymentContractPanel';
import type { EmploymentContract } from '@/components/placement/api';
import type { CaseStatus } from '@/lib/types';

registerCopy(pagesPlacement);
registerCopy(pagesJobs);

const FILTERS = ['warnings', 'probation', 'all'] as const;
type Filter = (typeof FILTERS)[number];

interface Row extends EmploymentContract {
  case: { id: string; number: string; status: CaseStatus; client: { id: string; firstName: string; lastName: string }; assignedStaff: { id: string; firstName: string; lastName: string } | null };
}

/** Admin: employment contracts with warnings or a probation ending within 30 days (Arbeitsvertrag tracker). */
export default function AdminEmploymentContracts() {
  const { t } = useTranslation();
  const L = useJobLabels();
  usePageTitle(t('placement.contract.list.title'));
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS as readonly string[]).includes(params.get('filter') ?? '') ? (params.get('filter') as Filter) : 'warnings';
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['employment-contracts', filter],
    queryFn: async () => (await api.get<{ items: Row[]; counts: { warnings: number; probation: number } }>('/admin/placement/contracts', { params: { filter } })).data,
    placeholderData: keepPreviousData,
  });
  return (
    <div>
      <PageHead title={t('placement.contract.list.title')} subtitle={t('placement.contract.list.subtitle')} />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setParams(f === 'warnings' ? {} : { filter: f }, { replace: true })} count={f === 'all' ? undefined : data?.counts[f]}>
            {t(`placement.contract.list.filters.${f}`)}
          </Chip>
        ))}
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={FileSignature} title={t('placement.contract.list.empty')} />
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {data.items.map((r) => (
            <li key={r.id} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,9rem)_minmax(0,9rem)] lg:items-center">
              <div className="min-w-0">
                <Link to={`/admin/cases/${r.case.id}#case-employment`} className="font-semibold text-link hover:underline">
                  {r.case.number}
                </Link>
                <p className="truncate text-xs text-muted">
                  {fullName(r.case.client)}
                  {r.case.assignedStaff ? ` · ${fullName(r.case.assignedStaff)}` : ''}
                </p>
                <StatusBadge status={r.case.status} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-ink/80">
                  {[r.employerName, r.jobTitle, t(`placement.contract.types.${r.contractType}`)].filter(Boolean).join(' · ')}
                </p>
                {(r.warnings.length > 0 || (r.blueCardCheck && r.blueCardCheck !== 'NOT_APPLICABLE')) && (
                  <div className="mt-1">
                    <ContractWarnings warnings={r.warnings} blueCardCheck={r.blueCardCheck} compact />
                  </div>
                )}
              </div>
              <p className="text-xs">
                <span className="text-muted lg:hidden">{t('placement.contract.list.salary')}: </span>
                <span className="font-medium text-ink tabular-nums">{r.grossMonthly != null ? L.euro(r.grossMonthly) : '—'}</span>
              </p>
              <p className="text-xs">
                <span className="text-muted">{t('placement.contract.list.probation')}: </span>
                <span className="font-medium text-ink tabular-nums">{r.probationEndsAt ? fmtDate(r.probationEndsAt) : '—'}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
