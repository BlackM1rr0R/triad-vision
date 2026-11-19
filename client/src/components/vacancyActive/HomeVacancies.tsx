import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy, registerLazyCopy } from '@/i18n';
import pagesJobs from '@/i18n/pagesJobs?lazy-copy'; // job card labels (jobsArea.common.*), awaited with the home chunk
import { pagesVacancyActive } from '@/i18n/pagesVacancyActive';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Stagger, StaggerItem } from '@/components/motion';
import { JobCard } from '@/components/jobs/JobCard';
import type { VacancyList } from '@/components/jobs/types';
import { VisaSection } from '@/components/home/Sections';

registerLazyCopy(pagesJobs);
registerCopy(pagesVacancyActive);

/** Cards in the home vacancy section. */
export const HOME_VACANCY_COUNT = 8;

/** Same request as the /jobs board (GET /api/vacancies?closed=1): query key under 'jobs', server-rendered (entry-server SSR_QUERY_KEYS). */
export const homeVacanciesQuery = {
  queryKey: ['jobs', 'home', HOME_VACANCY_COUNT] as const,
  queryFn: async () => (await api.get<VacancyList>('/vacancies', { params: { closed: 1, pageSize: HOME_VACANCY_COUNT } })).data,
  staleTime: 60_000,
};

const RAIL = 'mobile-rail cards-balanced sm:[--cols:2] lg:[--cols:3] xl:[--cols:4]';

/**
 * Home page section that used to show the visa category cards ("Viza növləri"): the real vacancies from the admin
 * (one source with /jobs) — open ones first (free places badge), then deactivated ones ("Deaktiv — müraciət qəbul
 * olunmur", no apply on their page). No vacancy at all (or the API fails): the old visa category cards, so the home
 * page never shows an empty section.
 */
export const HomeVacanciesSection = () => {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery(homeVacanciesQuery);
  if (!isLoading && !data?.items.length) return <VisaSection />;
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading
          eyebrow={t('vacActive.home.eyebrow')}
          title={t('vacActive.home.title')}
          subtitle={t('vacActive.home.subtitle')}
          action={
            <Link to="/jobs" className="btn-ghost group w-full whitespace-nowrap sm:w-auto">
              {t('vacActive.home.all')} <ArrowRight className="size-4" />
            </Link>
          }
        />
        {!data ? (
          <div className={RAIL}>
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonCard key={i} lines={3} className="h-full" />
            ))}
          </div>
        ) : (
          <Stagger className={RAIL}>
            {data.items.slice(0, HOME_VACANCY_COUNT).map((v) => (
              <StaggerItem key={v.id}>
                <JobCard v={v} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </section>
  );
};
