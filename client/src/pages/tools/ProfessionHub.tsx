import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, BadgeEuro, Briefcase, CalendarCheck, ExternalLink, Gauge, GraduationCap, HardHat, Info, MapPin, Search, UserPlus } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { ToolCard } from '@/components/audience/AudienceSections';
import { TOOLS } from '@/components/audience/tools';
import { PathLink, useGuides } from '@/components/guides/shared';
import { ProfessionPicker } from '@/components/tools/ProfessionPicker';
import { HubCareerSections } from '@/components/career/CareerBlocks'; // requirements, visa path, steps, FAQ, related (server lib/careerPages)
import { useMoney } from '@/components/tools/format';
import { buttonClass } from '@/components/ui/Button';
import { useGlossaryList } from '@/pages/glossary/GlossaryIndex';
import NotFound from '@/pages/NotFound';
import { api } from '@/lib/api';
import { getBrand } from '@/lib/brand';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesProfessionHubs } from '@/i18n/pagesProfessionHubs';
import { pagesWorkScenes } from '@/i18n/pagesWorkScenes';
import { pagesAudience } from '@/i18n/pagesAudience';
import { usePageTitle } from '@/lib/usePageTitle';
import { WaitlistForm } from '@/components/jobs/WaitlistForm'; // no vacancy with a free place: the vacancy waitlist
import { DeactivatedBadge, isDeactivated } from '@/components/vacancyActive/DeactivatedBadge'; // deactivated ones after the open ones
import { SCENE_META } from '@/lib/workScenes/meta';
import type { SceneId, WorkScene } from '@/lib/workScenes/types';
import { HUB_SALARY_AS_OF, HUB_SALARY_SOURCES, germanyJobsLink, hubBySlug, salaryMid, type ProfessionHub as Hub } from '@/lib/professionHubs';

registerCopy(pagesProfessionHubs);
registerCopy(pagesWorkScenes);
registerCopy(pagesAudience);

/** Scene data is loaded on demand (only the hub's own scene). */
const SCENES: Record<SceneId, () => Promise<WorkScene>> = {
  'restaurant-kitchen': () => import('@/lib/workScenes/scenes/restaurantKitchen').then((m) => m.RESTAURANT_KITCHEN),
  'truck-cab': () => import('@/lib/workScenes/scenes/truckCab').then((m) => m.TRUCK_CAB),
  'hospital-ward': () => import('@/lib/workScenes/scenes/hospitalWard').then((m) => m.HOSPITAL_WARD),
  'construction-site': () => import('@/lib/workScenes/scenes/constructionSite').then((m) => m.CONSTRUCTION_SITE),
  'electrical-panel': () => import('@/lib/workScenes/scenes/electricalPanel').then((m) => m.ELECTRICAL_PANEL),
};

const VOCAB_COUNT = 8;

interface HubVacancy {
  slug: string;
  title: string;
  city: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: string;
  publishedAt: string | null;
  free?: number;
  /** false: deactivated / expired (listed after the open ones, no apply; server lib/vacancyActive.ts). */
  active?: boolean;
}

const useHubVacancies = (slug: string) => {
  const lng = currentSiteLocale();
  return useQuery({
    queryKey: ['profession-hub-vacancies', slug, lng],
    queryFn: async () => (await api.get<{ total: number; withFreePlaces?: number; items: HubVacancy[] }>(`/profession-hubs/${encodeURIComponent(slug)}/vacancies`, { params: { lng } })).data,
    staleTime: 60_000,
  });
};

const Vocabulary = ({ hub }: { hub: Hub }) => {
  const { t } = useTranslation();
  const lng = currentSiteLocale();
  const [scene, setScene] = useState<WorkScene | null>(null);
  useEffect(() => {
    let alive = true;
    if (!hub.scene) return;
    void SCENES[hub.scene]()
      .then((s) => alive && setScene(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hub.scene]);
  if (!scene) return null;
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-muted">{t('profHub.vocab')}</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {scene.spots.slice(0, VOCAB_COUNT).map((s) => (
          <li key={s.id} className="rounded-xl bg-sunken px-3 py-2">
            <span lang="de" className="font-semibold text-ink">
              {s.de}
            </span>
            {lng !== 'de' && <span className="block text-xs text-muted">{s.name[lng]}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
};

const Vacancies = ({ hub }: { hub: Hub }) => {
  const { t } = useTranslation();
  const { euro } = useMoney();
  const { data, isLoading } = useHubVacancies(hub.slug);
  const pay = (v: HubVacancy) => (v.salaryMin && v.salaryMax && v.salaryMin !== v.salaryMax ? `${euro(v.salaryMin)} – ${euro(v.salaryMax)}` : v.salaryMin || v.salaryMax ? euro((v.salaryMin || v.salaryMax)!) : null);
  return (
    <section className="section bg-sunken" aria-labelledby="hub-jobs">
      <div className="container-x">
        <div className="section-head max-w-3xl">
          <h2 id="hub-jobs" className="h-section text-ink">
            {t('profHub.jobs')}
          </h2>
          <p className="mt-2 text-muted">{t('profHub.jobsText')}</p>
        </div>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card h-28 animate-pulse" />
            ))}
          </div>
        ) : data && data.items.length ? (
          <>
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.items.map((v) => (
                <li key={v.slug}>
                  <Link to={`/jobs/${v.slug}`} className={clsx('card card-interactive block h-full p-5', isDeactivated(v) && 'opacity-80')}>
                    {isDeactivated(v) && <DeactivatedBadge long className="mb-2" />}
                    <p className="font-display font-semibold text-ink">{v.title}</p>
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      {v.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden /> {v.city}
                        </span>
                      )}
                      {pay(v) && (
                        <span className="inline-flex items-center gap-1">
                          <BadgeEuro className="size-3.5" aria-hidden /> {pay(v)} {t('profHub.perMonth')}
                        </span>
                      )}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">{t('profHub.jobsCount', { count: data.total })}</p>
          </>
        ) : (
          <p className="card card-pad text-muted">{t('profHub.jobsEmpty')}</p>
        )}
        {/* No vacancy of the hub with a free place: "Uyğun vakansiya açılanda xəbər ver" (server lib/jobAlerts/waitlist.ts). */}
        {data && (data.withFreePlaces ?? data.items.length) === 0 && <WaitlistForm className="mt-5" only={hub.professions} full={data.items.some((v) => !isDeactivated(v))} />}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/jobs" className={buttonClass({ variant: 'outline' })}>
            <Briefcase className="size-4" aria-hidden /> {t('profHub.jobsAll')}
          </Link>
          <Link to={germanyJobsLink(hub)} className={buttonClass({ variant: 'outline' })}>
            <Search className="size-4" aria-hidden /> {t('profHub.germanyCta')}
          </Link>
        </div>
      </div>
    </section>
  );
};

const Guides = ({ hub }: { hub: Hub }) => {
  const { t } = useTranslation();
  const { data } = useGuides();
  const items = hub.guides.map((k) => data?.find((g) => g.key === k)).filter((g): g is NonNullable<typeof g> => !!g);
  if (!items.length) return null;
  return (
    <section className="section" aria-labelledby="hub-guides">
      <div className="container-x">
        <h2 id="hub-guides" className="h-section section-head text-ink">
          {t('profHub.guides')}
        </h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map((g) => (
            <PathLink key={g.key} path={g.path} className="card card-interactive card-pad block rounded-3xl">
              <h3 className="font-display text-lg leading-snug font-semibold text-ink">{g.title}</h3>
              <p className="mt-2 line-clamp-3 text-sm text-muted">{g.description}</p>
            </PathLink>
          ))}
        </div>
      </div>
    </section>
  );
};

const GlossaryTerms = ({ hub }: { hub: Hub }) => {
  const { t } = useTranslation();
  const { data } = useGlossaryList();
  const terms = hub.glossary.map((s) => data?.items.find((i) => i.slug === s)).filter((x): x is NonNullable<typeof x> => !!x);
  if (!terms.length) return null;
  return (
    <div className="mt-8">
      <h3 className="font-display font-semibold text-ink">{t('profHub.glossary')}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {terms.map((x) => (
          <li key={x.slug}>
            <Link to={`/glossary/${x.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink hover:border-line-strong" lang="de">
              {x.article ? `${x.article} ` : ''}
              {x.term}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** /for/:profession — "I am a …" hub of one profession. */
export default function ProfessionHub() {
  const { profession } = useParams();
  const hub = hubBySlug(profession);
  const { t } = useTranslation();
  const { euro } = useMoney();
  usePageTitle(hub ? t(`profHub.hubs.${hub.slug}.h1`) : null);
  if (!hub) return <NotFound />;

  const scene = hub.scene ? (SCENE_META.find((s) => s.id === hub.scene) ?? null) : null;
  const tools = hub.tools.map((p) => TOOLS.find((x) => x.to === p)).filter((x): x is (typeof TOOLS)[number] => !!x);
  const level = hub.mockExam.endsWith('b1') ? 'b1' : 'a1';
  const asOf = new Date(`${HUB_SALARY_AS_OF}T12:00:00Z`).toLocaleDateString(currentSiteLocale(), { dateStyle: 'medium' });

  return (
    <>
      <PageHero title={t(`profHub.hubs.${hub.slug}.h1`)} subtitle={t(`profHub.hubs.${hub.slug}.intro`)} crumb={{ to: '/for-workers', label: t('siteNav.overview.worker.title') }}>
        <p className="eyebrow mt-4">{t('profHub.eyebrow')}</p>
      </PageHero>

      <section className="section" aria-labelledby="hub-tools">
        <div className="container-x">
          <div className="section-head max-w-3xl">
            <h2 id="hub-tools" className="h-section text-ink">
              {t('profHub.tools')}
            </h2>
            <p className="mt-2 text-muted">{t('profHub.toolsText')}</p>
          </div>
          <ul className="grid-cards sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tools.map((tool) => (
              <li key={tool.key}>
                <ToolCard tool={tool} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <HubCareerSections slug={hub.slug} salaryLink={`/salary-calculator?gross=${salaryMid(hub)}`} />

      <section className="section bg-sunken" aria-labelledby="hub-learn">
        <div className="container-x grid gap-6 lg:grid-cols-2">
          {scene ? (
          <div className="card card-pad rounded-3xl">
            <h2 id="hub-learn" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <HardHat className="size-5 text-primary" aria-hidden /> {t('profHub.scene')}: {t(`ws.scenes.${scene.id}.title`)}
            </h2>
            <p className="mt-2 text-sm text-muted">{t('profHub.sceneText')}</p>
            <Vocabulary hub={hub} />
            <Link to={scene.path} className={buttonClass({ className: 'mt-5' })}>
              {t('profHub.sceneCta')} <ArrowRight className="size-4" aria-hidden />
            </Link>
            <GlossaryTerms hub={hub} />
          </div>
          ) : (
            <div className="card card-pad rounded-3xl">
              <h2 id="hub-learn" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <HardHat className="size-5 text-primary" aria-hidden /> {t('profHub.glossary')}
              </h2>
              <GlossaryTerms hub={hub} />
            </div>
          )}
          <div className="space-y-6">
            <div className="card card-pad rounded-3xl">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <GraduationCap className="size-5 text-primary" aria-hidden /> {t('profHub.exam')} {level.toUpperCase()}
              </h2>
              <p className="mt-2 text-sm text-muted">{t(`profHub.examText.${level}`)}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to={hub.mockExam} className={buttonClass()}>
                  {t('profHub.examCta')} <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link to="/german-level-test-self" className={buttonClass({ variant: 'outline' })}>
                  <Gauge className="size-4" aria-hidden /> {t('profHub.levelSelf')}
                </Link>
              </div>
            </div>
            <div className="card card-pad rounded-3xl" aria-labelledby="hub-salary">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="hub-salary" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                  <BadgeEuro className="size-5 text-primary" aria-hidden /> {t('profHub.salary')}
                </h2>
                <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-semibold text-warning-fg">{t('profHub.estimate')}</span>
              </div>
              <p className="mt-3 font-display text-2xl font-semibold text-ink tabular-nums">{t('profHub.salaryRange', { low: euro(hub.salary[0]), high: euro(hub.salary[1]) })}</p>
              <p className="mt-2 flex gap-2 text-xs leading-relaxed text-muted">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('profHub.salaryText')}
              </p>
              <p className="mt-2 text-xs text-muted">
                {t('profHub.asOf', { date: asOf })} · {t('profHub.sources')}:{' '}
                {HUB_SALARY_SOURCES.map((s, i) => (
                  <span key={s.url}>
                    {i > 0 && ', '}
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                      {s.label}
                      <ExternalLink className="ml-0.5 inline size-3" aria-hidden />
                    </a>
                  </span>
                ))}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to={`/salary-calculator?gross=${salaryMid(hub)}`} className={buttonClass({ variant: 'outline', size: 'sm' })}>
                  {t('profHub.salaryCalc')}
                </Link>
                <Link to="/shortage-barometer" className={buttonClass({ variant: 'outline', size: 'sm' })}>
                  {t('profHub.shortage')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Vacancies hub={hub} />

      <section className="section" aria-labelledby="hub-germany">
        <div className="container-x">
          <div className="card card-pad flex flex-col gap-4 rounded-3xl sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="hub-germany" className="font-display text-lg font-semibold text-ink">
                {t('profHub.germany')}
              </h2>
              <p className="mt-1 text-sm text-muted">{t('profHub.germanyText')}</p>
            </div>
            <Link to={germanyJobsLink(hub)} className={buttonClass({ className: 'shrink-0' })}>
              <Search className="size-4" aria-hidden /> {t('profHub.germanyCta')}
            </Link>
          </div>
        </div>
      </section>

      <Guides hub={hub} />

      <section className="section bg-sunken" aria-labelledby="hub-cta">
        <div className="container-x">
          <div className="card card-pad rounded-3xl text-center">
            <h2 id="hub-cta" className="font-display text-2xl font-semibold text-ink">
              {t('profHub.ctaTitle')}
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-muted">{t('profHub.ctaText', { phone: getBrand().phone })}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link to="/booking" className={buttonClass({ size: 'lg' })}>
                <CalendarCheck className="size-5" aria-hidden /> {t('profHub.ctaBooking')}
              </Link>
              <Link to="/register" className={buttonClass({ variant: 'outline', size: 'lg' })}>
                <UserPlus className="size-5" aria-hidden /> {t('profHub.ctaRegister')}
              </Link>
            </div>
          </div>
          <div className="mt-10">
            <ProfessionPicker current={hub.slug} heading={t('profHub.other')} />
          </div>
        </div>
      </section>
    </>
  );
}
