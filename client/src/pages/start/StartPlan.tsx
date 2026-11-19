import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BadgeEuro, BookOpen, Check, ExternalLink, Link2, MapPin, Pencil } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { ToolCard } from '@/components/audience/AudienceSections';
import { TOOLS } from '@/components/audience/tools';
import { PathLink, useGuides } from '@/components/guides/shared';
import { EmailResult } from '@/components/tools/EmailResult';
import { useMoney } from '@/components/tools/format';
import { buttonClass } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesStartHere } from '@/i18n/pagesStartHere';
import { pagesProfessionHubs } from '@/i18n/pagesProfessionHubs';
import { pagesAudience } from '@/i18n/pagesAudience';
import { pagesToolsHub } from '@/i18n/pagesToolsHub';
import { usePageTitle } from '@/lib/usePageTitle';
import { WaitlistForm } from '@/components/jobs/WaitlistForm'; // no vacancy with a free place: the vacancy waitlist
import { hubBySlug } from '@/lib/professionHubs';
import { buildPlan, parsePlanParams, type Plan, type PlanInput, type PlanStep } from '@/lib/startPlan/rules';

registerCopy(pagesStartHere);
registerCopy(pagesProfessionHubs);
registerCopy(pagesAudience);
registerCopy(pagesToolsHub);

/** Date the language orientation and sources were checked. */
const AS_OF = '2026-11-17';
const SOURCES = [
  { label: 'Make it in Germany — Visum zur Berufsausbildung (§ 16a AufenthG)', url: 'https://www.make-it-in-germany.com/de/unternehmen/einreise/visum-berufsausbildung' },
  { label: '§ 16a AufenthG — gesetze-im-internet.de', url: 'https://www.gesetze-im-internet.de/aufenthg_2004/__16a.html' },
  { label: '§ 30 AufenthG (Ehegattennachzug) — gesetze-im-internet.de', url: 'https://www.gesetze-im-internet.de/aufenthg_2004/__30.html' },
];
const EZB_FORM = 'https://www.arbeitsagentur.de/datei/erklaerung-zum-beschaeftigungsverhaeltnis_ba047549.pdf';
const EMPLOYER_SOURCES = [
  { label: 'Bundesagentur für Arbeit — Erklärung zum Beschäftigungsverhältnis (PDF)', url: EZB_FORM },
  { label: 'Bundesagentur für Arbeit — Fachkräfte aus dem Ausland', url: 'https://www.arbeitsagentur.de/unternehmen/arbeitskraefte/fachkraefte-ausland' },
];

const KNOWN_TOOLS = TOOLS.map((x) => x.to);

const LINK_KEYS: Record<string, string> = {
  '/ausbildung': 'ausbildung',
  '/study': 'study',
  '/register': 'register',
  '/booking': 'booking',
  '/jobs': 'jobs',
  '/german-mock-exam/a1': 'examA1',
  '/german-mock-exam/b1': 'examB1',
  '/employer-guide-azerbaijan#ega-visa': 'ezbGuide',
  '/glossary/zustimmung-der-bundesagentur': 'glossaryBa',
  '/glossary/beschleunigtes-fachkraefteverfahren': 'glossaryFast',
  '/for-employers': 'forEmployers',
  '/contact': 'contact',
};

const useLinkLabel = () => {
  const { t } = useTranslation();
  return (path: string): string => {
    if (path.startsWith('/visa-document-checklist')) return t('startHere.links.checklist');
    if (path.startsWith('/for/')) return t('startHere.links.hub', { name: t(`profHub.hubs.${path.slice(5)}.chip`) });
    if (LINK_KEYS[path]) return t(`startHere.links.${LINK_KEYS[path]}`);
    const tool = TOOLS.find((x) => x.to === path);
    return tool ? t(`toolsPage.items.${tool.key}.title`) : path;
  };
};

const stepTitle = (t: (k: string, o?: Record<string, unknown>) => string, s: PlanStep) => t(`startHere.steps.${s.id}.title`, { level: s.target ?? '' });

interface HubVacancy {
  slug: string;
  title: string;
  city: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  /** false: deactivated (server lib/vacancyActive.ts); the plan only shows open ones. */
  active?: boolean;
}

/** Current vacancies of the profession hub (same API as /for/<slug>). */
const Vacancies = ({ hub }: { hub: NonNullable<Plan['hub']> }) => {
  const { t } = useTranslation();
  const { euro } = useMoney();
  const lng = currentSiteLocale();
  const { data, isLoading } = useQuery({
    queryKey: ['profession-hub-vacancies', hub, lng],
    queryFn: async () => (await api.get<{ total: number; withFreePlaces?: number; items: HubVacancy[] }>(`/profession-hubs/${encodeURIComponent(hub)}/vacancies`, { params: { lng } })).data,
    staleTime: 60_000,
  });
  const pay = (v: HubVacancy) => (v.salaryMin && v.salaryMax && v.salaryMin !== v.salaryMax ? `${euro(v.salaryMin)} – ${euro(v.salaryMax)}` : v.salaryMin || v.salaryMax ? euro((v.salaryMin || v.salaryMax)!) : null);
  return (
    <section className="container-x pb-10 sm:pb-14" aria-labelledby="plan-jobs">
      <h2 id="plan-jobs" className="font-display text-xl font-semibold text-ink sm:text-2xl">
        {t('startHere.plan.jobs')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('startHere.plan.jobsText')}</p>
      {isLoading ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-24 animate-pulse" />
          ))}
        </div>
      ) : data?.items.some((v) => v.active !== false) ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {data.items.filter((v) => v.active !== false).slice(0, 3).map((v) => (
            <li key={v.slug}>
              <Link to={`/jobs/${v.slug}`} className="card card-interactive block h-full p-4">
                <p className="font-semibold text-ink">{v.title}</p>
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                  {v.city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden /> {v.city}
                    </span>
                  )}
                  {pay(v) && (
                    <span className="inline-flex items-center gap-1">
                      <BadgeEuro className="size-3.5" aria-hidden /> {pay(v)}
                    </span>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card card-pad mt-4 text-muted">{t('startHere.plan.jobsEmpty')}</p>
      )}
      {/* No vacancy of the profession with a free place: the vacancy waitlist (server lib/jobAlerts/waitlist.ts). */}
      {data && (data.withFreePlaces ?? data.items.length) === 0 && <WaitlistForm className="mt-4" only={hubBySlug(hub)?.professions} full={data.items.some((v) => v.active !== false)} />}
      <Link to={`/for/${hub}`} className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
        {t('startHere.plan.jobsAll')} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
};

const GuideCard = ({ keys }: { keys: string[] }) => {
  const { t } = useTranslation();
  const { data } = useGuides();
  const guide = keys.map((k) => data?.find((g) => g.key === k)).find(Boolean);
  return (
    <div>
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink sm:text-2xl">
        <BookOpen className="size-5 text-highlight-fg" aria-hidden /> {t('startHere.plan.guide')}
      </h2>
      {guide ? (
        <PathLink path={guide.path} className="card card-interactive card-pad mt-4 block rounded-3xl">
          <span className="block font-display text-lg leading-snug font-semibold text-ink">{guide.title}</span>
          <span className="mt-2 line-clamp-3 block text-sm text-muted">{guide.description}</span>
        </PathLink>
      ) : null}
      <Link to="/guides" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
        {t('startHere.plan.allGuides')} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
};

const Answers = ({ input }: { input: PlanInput }) => {
  const { t } = useTranslation();
  const items = [
    t(`startHere.who.${input.who}.title`),
    input.profession ? (input.profession === 'other' ? t('startHere.otherProfession') : t(`profHub.hubs.${input.profession}.chip`)) : null,
    input.level ? t(`startHere.levels.${input.level}`) : null,
  ].filter((x): x is string => !!x);
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">{t('startHere.plan.answers')}:</span>
      {items.map((x) => (
        <span key={x} className="rounded-full border border-line bg-card px-3 py-1 text-sm font-semibold text-ink">
          {x}
        </span>
      ))}
      <Link to={`/start?w=${input.who}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-link hover:underline">
        <Pencil className="size-4" aria-hidden /> {t('startHere.plan.change')}
      </Link>
    </div>
  );
};

/** /start/plan?w=…&p=…&l=… — the personal plan (state in the URL: shareable and bookmarkable). */
export default function StartPlan() {
  const { t } = useTranslation();
  usePageTitle(t('startHere.plan.title'));
  const [params] = useSearchParams();
  const input = parsePlanParams(params);
  const label = useLinkLabel();
  const [copied, setCopied] = useState(false);

  if (!input) {
    return (
      <>
        <PageHero title={t('startHere.plan.title')} crumb={{ to: '/start', label: t('startHere.heroTitle') }} />
        <section className="container-x py-12">
          <p className="text-muted">{t('startHere.plan.missing')}</p>
          <Link to="/start" className={buttonClass({ className: 'mt-5' })}>
            {t('startHere.plan.start')}
          </Link>
        </section>
      </>
    );
  }

  const plan = buildPlan(input, KNOWN_TOOLS);
  const tools = plan.tools.map((p) => TOOLS.find((x) => x.to === p)).filter((x): x is (typeof TOOLS)[number] => !!x);
  const employer = plan.cta === 'employer';
  const asOf = new Date(`${AS_OF}T12:00:00Z`).toLocaleDateString(currentSiteLocale(), { dateStyle: 'medium' });

  const copy = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <PageHero title={t('startHere.plan.title')} subtitle={t('startHere.plan.subtitle')} crumb={{ to: '/start', label: t('startHere.heroTitle') }}>
        <Answers input={input} />
        <button type="button" onClick={copy} className={buttonClass({ variant: 'outline', size: 'sm', className: 'mt-3' })}>
          {copied ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
          <span aria-live="polite">{copied ? t('startHere.plan.copied') : t('startHere.plan.share')}</span>
        </button>
      </PageHero>

      <section className="container-x py-10 sm:py-14" aria-labelledby="plan-steps">
        <h2 id="plan-steps" className="sr-only">
          {t('startHere.plan.steps')}
        </h2>
        <ol className="mx-auto grid max-w-3xl gap-4">
          {plan.steps.map((s, i) => (
            <li key={s.id} className="card card-pad flex gap-4 rounded-3xl">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-display text-lg font-semibold text-primary-contrast" aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-semibold text-ink">
                  <span className="sr-only">{i + 1}. </span>
                  {stepTitle(t, s)}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{t(`startHere.steps.${s.id}.text`, { level: s.target ?? '' })}</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {s.links.map((p) => (
                    <li key={p}>
                      <Link to={p} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink hover:border-line-strong hover:bg-sunken">
                        {label(p)} <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </li>
                  ))}
                  {s.id === 'empEzb' && (
                    <li>
                      <a href={EZB_FORM} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink hover:border-line-strong hover:bg-sunken">
                        {t('startHere.plan.ezbForm')} <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            </li>
          ))}
        </ol>
        <div className="mx-auto max-w-3xl">
          <EmailResult
            tool="start/plan"
            countUse="mount"
            className="mt-6"
            summary={plan.steps.map((s, i) => ({ label: t('startHere.plan.emailStep', { n: i + 1 }), value: stepTitle(t, s) }))}
          />
        </div>
      </section>

      <section className="bg-sunken py-10 sm:py-14" aria-labelledby="plan-tools">
        <div className="container-x">
          <h2 id="plan-tools" className="font-display text-xl font-semibold text-ink sm:text-2xl">
            {t('startHere.plan.tools')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('startHere.plan.toolsText')}</p>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {tools.map((tool) => (
              <li key={tool.key}>
                <ToolCard tool={tool} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container-x grid gap-8 py-10 sm:py-14 lg:grid-cols-2">
        <GuideCard keys={plan.guides} />
        <div className="card card-pad rounded-3xl border-primary/30">
          <h2 className="font-display text-xl font-semibold text-ink">{employer ? t('startHere.plan.employerCtaTitle') : t('startHere.plan.ctaTitle')}</h2>
          <p className="mt-2 text-muted">{employer ? t('startHere.plan.employerCtaText') : t('startHere.plan.ctaText')}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {employer ? (
              <>
                <Link to="/employers/register" className={buttonClass({})}>
                  {t('startHere.plan.employerRegister')}
                </Link>
                <Link to="/contact" className={buttonClass({ variant: 'outline' })}>
                  {t('startHere.plan.contact')}
                </Link>
              </>
            ) : (
              <>
                <Link to="/register" className={buttonClass({})}>
                  {t('startHere.plan.register')}
                </Link>
                <Link to="/booking" className={buttonClass({ variant: 'outline' })}>
                  {t('startHere.plan.booking')}
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {plan.hub && <Vacancies hub={plan.hub} />}

      <section className="container-x pb-14 sm:pb-20">
        <div className="rounded-2xl border border-line bg-card p-4 text-sm text-muted sm:p-5">
          {!employer && <p>{t('startHere.plan.notice')}</p>}
          <p className={employer ? 'font-semibold text-ink' : 'mt-3 font-semibold text-ink'}>
            {t('startHere.plan.sources')} · {t('startHere.plan.asOf', { date: asOf })}
          </p>
          <ul className="mt-2 space-y-1">
            {(employer ? EMPLOYER_SOURCES : SOURCES).map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                  {s.label} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
