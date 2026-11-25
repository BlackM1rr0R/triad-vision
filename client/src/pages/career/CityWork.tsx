import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeEuro, Briefcase, CalendarCheck, Info, MapPin } from 'lucide-react';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { useMoney } from '@/components/tools/format';
import { RelatedLinks, useCareer } from '@/components/career/CareerBlocks';
import { registerCopy } from '@/i18n';
import { pagesProfessionHubs } from '@/i18n/pagesProfessionHubs';
import { pagesAudience } from '@/i18n/pagesAudience';
import NotFound from '@/pages/NotFound';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesProfessionHubs);
registerCopy(pagesAudience);

interface CityData {
  slug: string;
  name: string;
  state: string | null;
  texts: {
    title: string;
    description: string;
    h1: string;
    intro: string;
    labels: Record<'costs' | 'flat1' | 'flat2' | 'wg' | 'food' | 'transport' | 'estimate' | 'source' | 'jobs' | 'jobsNone' | 'landings' | 'professions' | 'tools' | 'others', string>;
  };
  costs: { flat1: [number, number]; flat2: [number, number]; wg: [number, number]; food: [number, number]; transport: number };
  jobs: { slug: string; title: string; city: string | null; salaryMin: number | null; salaryMax: number | null }[];
  total: number;
  landings: { path: string; label: string; count: number }[];
  hubs: string[];
  others: { slug: string; name: string; path: string }[];
}

/** /cities/:slug — work and living costs in one city (server lib/careerPages/cities.ts; az, ru, tr, en, de). */
export default function CityWork() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const { euro } = useMoney();
  const { data, isLoading } = useCareer<CityData>(`cities/${encodeURIComponent(slug)}`);
  usePageTitle(data?.texts.h1 ?? null);
  if (isLoading) return <PageHeroSkeleton />;
  if (!data) return <NotFound />;
  const l = data.texts.labels;
  const range = (r: [number, number]) => `${euro(r[0])} – ${euro(r[1])}`;
  const pay = (j: CityData['jobs'][number]) =>
    j.salaryMin && j.salaryMax && j.salaryMin !== j.salaryMax ? range([j.salaryMin, j.salaryMax]) : j.salaryMin || j.salaryMax ? euro((j.salaryMin || j.salaryMax)!) : null;
  const rows: [string, string][] = [
    [l.flat1, range(data.costs.flat1)],
    [l.flat2, range(data.costs.flat2)],
    [l.wg, range(data.costs.wg)],
    [l.food, range(data.costs.food)],
    [l.transport, euro(data.costs.transport)],
  ];
  return (
    <>
      <PageHero title={data.texts.h1} subtitle={data.texts.intro} crumb={{ to: '/cities', label: l.others }} />

      <section className="section" aria-labelledby="city-costs">
        <div className="container-x max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="city-costs" className="h-section text-ink">
              {l.costs}
            </h2>
            <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-semibold text-warning-fg">{l.estimate}</span>
          </div>
          <table className="mt-4 w-full text-left text-sm">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-b border-line">
                  <th scope="row" className="py-3 pr-4 font-normal text-muted">
                    {k}
                  </th>
                  <td className="py-3 text-right font-semibold text-ink tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 flex gap-2 text-xs text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {l.source}
          </p>
        </div>
      </section>

      <section className="section bg-sunken" aria-labelledby="city-jobs">
        <div className="container-x">
          <h2 id="city-jobs" className="h-section section-head text-ink">
            {l.jobs}
          </h2>
          {data.jobs.length ? (
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.jobs.map((j) => (
                <li key={j.slug}>
                  <Link to={`/jobs/${j.slug}`} className="card card-interactive block h-full p-5">
                    <p className="font-display font-semibold text-ink">{j.title}</p>
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      {j.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden /> {j.city}
                        </span>
                      )}
                      {pay(j) && (
                        <span className="inline-flex items-center gap-1">
                          <BadgeEuro className="size-3.5" aria-hidden /> {pay(j)}
                        </span>
                      )}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card card-pad text-muted">{l.jobsNone}</p>
          )}
          <Link to="/jobs" className={buttonClass({ variant: 'outline', className: 'mt-5' })}>
            <Briefcase className="size-4" aria-hidden /> {t('profHub.jobsAll')}
          </Link>
        </div>
      </section>

      <RelatedLinks id="city-landings" title={l.landings} links={data.landings.map((x) => ({ to: x.path, label: `${x.label} (${x.count})` }))} />
      <RelatedLinks id="city-professions" title={l.professions} links={data.hubs.map((h) => ({ to: `/for/${h}`, label: t(`profHub.hubs.${h}.chip`) }))} />
      <RelatedLinks
        id="city-tools"
        title={l.tools}
        links={[
          { to: '/budget', label: t('toolsPage.items.budget.title') },
          { to: '/rent-check', label: t('toolsPage.items.rentCheck.title') },
          { to: '/salary-calculator', label: t('toolsPage.items.salary.title') },
          { to: '/cities', label: t('toolsPage.items.cities.title') },
        ]}
      />
      <RelatedLinks id="city-others" title={l.others} links={data.others.map((o) => ({ to: o.path, label: o.name, icon: 'city' as const }))} />

      <section className="section bg-sunken">
        <div className="container-x text-center">
          <Link to="/booking" className={buttonClass({ size: 'lg' })}>
            <CalendarCheck className="size-5" aria-hidden /> {t('profHub.ctaBooking')}
          </Link>
        </div>
      </section>
    </>
  );
}
