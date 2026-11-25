import { Link, useParams } from 'react-router-dom';
import { BadgeEuro, CalendarCheck, Clock, GraduationCap, Info, Languages } from 'lucide-react';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { useMoney } from '@/components/tools/format';
import { CheckList, FaqList, RelatedLinks, StepsList, useCareer, type Faq, type Labels, type Step } from '@/components/career/CareerBlocks';
import NotFound from '@/pages/NotFound';
import { usePageTitle } from '@/lib/usePageTitle';

interface AusbildungData {
  slug: string;
  asOf: string;
  labels: Labels;
  allowanceNote: string;
  keywords: string[];
  title: string;
  description: string;
  name: string;
  intro: string;
  about: string;
  requirements: string[];
  pay: string;
  after: string;
  faq: Faq[];
  years: number;
  germanLevel: string;
  allowance: [number, number];
  hub: { slug: string; path: string };
  visa: { slug: string; path: string };
  steps: Step[];
  others: { slug: string; path: string; name: string; title: string }[];
}

/** /ausbildung/:slug — one Ausbildung occupation (server lib/careerPages; az, ru, tr, en, de; other languages 404). */
export default function AusbildungOccupation() {
  const { slug = '' } = useParams();
  const { data, isLoading } = useCareer<AusbildungData>(`ausbildung/${encodeURIComponent(slug)}`);
  const { euro } = useMoney();
  usePageTitle(data?.title ?? null);
  if (isLoading) return <PageHeroSkeleton />;
  if (!data) return <NotFound />;
  const l = data.labels;
  return (
    <>
      <PageHero title={data.title} subtitle={data.intro} crumb={{ to: '/ausbildung', label: l.ausbildungHub }}>
        <p className="eyebrow mt-4" lang="de">
          {data.name}
        </p>
      </PageHero>

      <section className="section" aria-labelledby="ausb-facts">
        <div className="container-x">
          <h2 id="ausb-facts" className="sr-only">
            {data.name}
          </h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="card card-pad rounded-3xl">
              <dt className="flex items-center gap-2 text-sm text-muted">
                <Clock className="size-4 text-primary" aria-hidden /> {l.years}
              </dt>
              <dd className="mt-1 font-display text-2xl font-semibold text-ink tabular-nums">{data.years.toLocaleString()}</dd>
            </div>
            <div className="card card-pad rounded-3xl">
              <dt className="flex items-center gap-2 text-sm text-muted">
                <Languages className="size-4 text-primary" aria-hidden /> {l.germanLevel}
              </dt>
              <dd className="mt-1 font-display text-2xl font-semibold text-ink">{data.germanLevel}</dd>
            </div>
            <div className="card card-pad rounded-3xl">
              <dt className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <BadgeEuro className="size-4 text-primary" aria-hidden /> {l.allowance}
                <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning-fg">{l.estimate}</span>
              </dt>
              <dd className="mt-1 font-display text-2xl font-semibold text-ink tabular-nums">
                {euro(data.allowance[0])} – {euro(data.allowance[1])} <span className="text-base text-muted">{l.perMonth}</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="section pt-0" aria-labelledby="ausb-about">
        <div className="container-x grid gap-6 lg:grid-cols-2">
          <div className="card card-pad rounded-3xl">
            <h2 id="ausb-about" className="font-display text-xl font-semibold text-ink">
              {l.about}
            </h2>
            <p className="mt-3 leading-relaxed text-muted">{data.about}</p>
            <h2 className="mt-6 font-display text-xl font-semibold text-ink">{l.requirements}</h2>
            <div className="mt-3">
              <CheckList items={data.requirements} />
            </div>
          </div>
          <div className="card card-pad rounded-3xl">
            <h2 className="font-display text-xl font-semibold text-ink">{l.allowance}</h2>
            <p className="mt-3 leading-relaxed text-muted">{data.pay}</p>
            <p className="mt-2 flex gap-2 text-xs leading-relaxed text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {data.allowanceNote}
            </p>
            <h2 className="mt-6 font-display text-xl font-semibold text-ink">{l.after}</h2>
            <p className="mt-3 leading-relaxed text-muted">{data.after}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to={data.visa.path} className={buttonClass({ variant: 'outline', size: 'sm' })}>
                {l.visaLink}
              </Link>
              <Link to={data.hub.path} className={buttonClass({ variant: 'outline', size: 'sm' })}>
                {l.apply}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <StepsList title={l.steps} steps={data.steps} id="ausb-steps" />
      <FaqList title={l.faq} items={data.faq} id="ausb-faq" />
      <RelatedLinks
        id="ausb-related"
        title={l.ausbildungOthers}
        links={[{ to: '/ausbildung', label: l.ausbildungHub, icon: 'ausbildung' as const }, ...data.others.map((o) => ({ to: o.path, label: o.title, icon: 'ausbildung' as const }))]}
      />

      <section className="section bg-sunken">
        <div className="container-x text-center">
          <GraduationCap className="mx-auto size-8 text-primary" aria-hidden />
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link to="/booking" className={buttonClass({ size: 'lg' })}>
              <CalendarCheck className="size-5" aria-hidden /> {l.cta}
            </Link>
            <Link to="/jobs" className={buttonClass({ variant: 'outline', size: 'lg' })}>
              {l.apply}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
