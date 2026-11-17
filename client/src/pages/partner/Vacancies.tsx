import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Briefcase, ExternalLink, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { ErrorRetry, Loading, Section } from '@/components/partnerPortal/ui';

interface PartnerVacancy {
  id: string;
  slug: string;
  title: L10n;
  city: string | null;
  profession: string | null;
  positions: number | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  publishedAt: string | null;
}

/** Open vacancies (public data) for partners with the vacancies permission (GET /partner/vacancies). */
export default function PartnerVacanciesPage() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const q = useQuery({ queryKey: ['partner-portal', 'vacancies'], queryFn: async () => (await api.get<{ items: PartnerVacancy[] }>('/partner/vacancies')).data.items });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorRetry onRetry={() => q.refetch()} />;
  const salary = (v: PartnerVacancy) => (v.salaryMin && v.salaryMax ? `${v.salaryMin}–${v.salaryMax} €` : v.salaryMin ? `${v.salaryMin} €` : null);
  return (
    <Section title={t('partnerAccess.vacancies.title')} icon={Briefcase}>
      <p className="mb-4 text-sm text-muted">{t('partnerAccess.vacancies.intro')}</p>
      {q.data.length === 0 ? (
        <p className="text-sm text-muted">{t('partnerAccess.vacancies.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((v) => (
            <li key={v.id} className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-3">
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{tr(v.title)}</span>
                <span className="flex flex-wrap gap-x-3 text-xs text-muted">
                  {v.city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden /> {v.city}
                    </span>
                  )}
                  {v.positions ? <span>{t('partnerAccess.vacancies.positions', { count: v.positions })}</span> : null}
                  {salary(v) && (
                    <span>
                      {t('partnerAccess.vacancies.salary')}: {salary(v)}
                    </span>
                  )}
                </span>
              </span>
              <Link to={`/jobs/${v.slug}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:underline" target="_blank" rel="noreferrer">
                {t('partnerAccess.vacancies.open')} <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
