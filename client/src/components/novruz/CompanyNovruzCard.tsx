import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Flower2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ErrorState } from '@/components/ui/ErrorState';
import { Loading, Section, useCompany } from '@/components/company/shared';
import type { WorkersResponse } from '@/components/company/workerTypes';
import { firstNameOf } from '@/lib/novruzCard/data';
import { NovruzCardStudio, type StudioWorker } from './NovruzCardStudio';
import { NovruzDatesNote } from './NovruzInfo';

/**
 * Company portal → /company/novruz-card (?worker=<caseId> preselects one): the Novruz card studio with the
 * company's own workers (first names from the employer panel, GET /api/company/workers — scoped to the company on
 * the server), the company name and its stored logo. Workers who left or whose case was closed are not offered.
 */
export const CompanyNovruzCard = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { data: company } = useCompany();
  const q = useQuery({
    queryKey: ['company-workers'],
    queryFn: async () => (await api.get<WorkersResponse>('/company/workers')).data,
  });
  const workers: StudioWorker[] = useMemo(
    () => (q.data?.items ?? []).filter((w) => w.phase !== 'LEFT' && w.phase !== 'CLOSED').map((w) => ({ id: w.id, firstName: firstNameOf(w.name) })),
    [q.data],
  );
  const preselect = params.get('worker');
  const initialSelected = useMemo(() => {
    if (preselect && workers.some((w) => w.id === preselect)) return [preselect];
    return workers.filter((w) => (q.data?.items ?? []).some((x) => x.id === w.id && (x.phase === 'WORKING' || x.phase === 'TRAVELLING'))).map((w) => w.id);
  }, [preselect, workers, q.data]);

  return (
    <Section
      title={t('novruz.portal.title')}
      icon={Flower2}
      actions={
        <Link to="/company/workers" className="btn-ghost btn-sm">
          <ArrowLeft className="size-4" aria-hidden /> {t('novruz.portal.back')}
        </Link>
      }
    >
      <div className="space-y-5">
        <NovruzDatesNote />
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <ErrorState onRetry={() => void q.refetch()} />
        ) : (
          <NovruzCardStudio workers={workers} initialSelected={initialSelected} defaultCompany={company?.name ?? ''} logoUrl={company?.logo?.url ?? null} />
        )}
      </div>
    </Section>
  );
};

export default CompanyNovruzCard;
