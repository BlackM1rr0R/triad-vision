import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BookOpen, Calculator, CheckCircle2, ChevronDown, Info, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { PageCta } from '@/components/visa/PageCta';
import { PathLink } from '@/components/guides/shared';
import { Spinner } from '@/components/ui/Spinner';
import { toneClasses, toneSolids } from '@/components/ui/status';
import { api } from '@/lib/api';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesDiscover } from '@/i18n/pagesDiscover';
import { usePageTitle } from '@/lib/usePageTitle';
import { recommend, topRecommendations, visibleQuestions, type Recommendation, type RouteKey, type WizardAnswers } from '@/lib/visaCompare';

registerCopy(pagesDiscover);

const HERO = 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=2000&q=70';

type Criterion = 'requirements' | 'german' | 'jobOffer' | 'salary' | 'duration' | 'family' | 'permanent' | 'processing';

interface CompareData {
  lng: string;
  year: string;
  intro: string;
  caption: string;
  criterion: string;
  disclaimer: string;
  amounts: { standard: string; shortage: string };
  routes: { key: RouteKey; name: string; jobOffer: 'yes' | 'no'; guideKey: string; tool: string | null; cells: Record<Criterion, string>; guide: { title: string; path: string } | null }[];
  criteria: { key: Criterion; label: string }[];
  faq: { q: string; a: string }[];
}

const FIT = { high: 'success', medium: 'warning', low: 'neutral' } as const;
const FIT_TONE = toneClasses(FIT);
const FIT_BAR = toneSolids(FIT);

/** Six-question wizard → recommended routes with reasons (pure logic: lib/visaCompare.ts). */
const Wizard = ({ data }: { data: CompareData }) => {
  const { t } = useTranslation();
  const id = useId();
  const [answers, setAnswers] = useState<Partial<WizardAnswers>>({});
  const [step, setStep] = useState(0);
  const questions = visibleQuestions(answers);
  const done = step >= questions.length;
  const q = questions[Math.min(step, questions.length - 1)];
  const results = useMemo(() => (done ? recommend(answers as WizardAnswers) : []), [done, answers]);
  const top = topRecommendations(results);
  const routeOf = (key: RouteKey) => data.routes.find((r) => r.key === key);

  const pick = (value: string) => {
    const next = { ...answers, [q.key]: value } as Partial<WizardAnswers>;
    setAnswers(next);
    setStep((s) => s + 1);
  };
  const restart = () => {
    setAnswers({});
    setStep(0);
  };

  return (
    <div className="card card-pad rounded-3xl" aria-live="polite">
      {!done ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="type-overline text-muted">{t('discover.compare.wizard.step', { n: step + 1, total: questions.length })}</p>
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-muted sm:min-h-10 transition-colors hover:bg-sunken hover:text-ink">
                <ArrowLeft className="size-3.5" aria-hidden /> {t('discover.compare.wizard.back')}
              </button>
            )}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(step / questions.length) * 100}%` }} />
          </div>
          <fieldset className="mt-5" key={q.key}>
            <legend className="font-display text-lg font-semibold text-ink">{t(`discover.compare.questions.${q.key}.label`)}</legend>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {q.options.map((o) => (
                <label
                  key={o}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-card p-3.5 text-sm leading-snug text-ink transition-colors hover:border-line-strong has-[:checked]:border-primary has-[:checked]:bg-sunken has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40"
                >
                  <input type="radio" name={`${id}-${q.key}`} value={o} checked={answers[q.key] === o} onChange={() => pick(o)} className="size-4 shrink-0 accent-primary" />
                  <span>{t(`discover.compare.questions.${q.key}.options.${o}`, data.amounts)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-semibold text-ink">{t('discover.compare.wizard.resultTitle')}</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted">{t('discover.compare.wizard.resultText')}</p>
            </div>
            <button type="button" onClick={restart} className="btn-secondary">
              <RotateCcw className="size-4" aria-hidden /> {t('discover.compare.wizard.restart')}
            </button>
          </div>
          <ul className="mt-5 grid gap-4 lg:grid-cols-2">
            {top.map((rec) => (
              <li key={rec.route}>
                <ResultCard rec={rec} route={routeOf(rec.route)} />
              </li>
            ))}
          </ul>
          <details className="group mt-5 rounded-2xl border border-line bg-sunken p-4">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-ink">
              {t('discover.compare.wizard.allRoutes')} <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="mt-4 space-y-3">
              {results.map((r) => (
                <li key={r.route}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-ink">{routeOf(r.route)?.name ?? r.route}</span>
                    <span className="text-muted tabular-nums">{t('discover.compare.wizard.score', { score: r.score })}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
                    <div className={clsx('h-full rounded-full', FIT_BAR[r.fit])} style={{ width: `${r.score}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
};

const ResultCard = ({ rec, route }: { rec: Recommendation; route: CompareData['routes'][number] | undefined }) => {
  const { t } = useTranslation();
  const pros = rec.reasons.filter((r) => r.startsWith('+')).map((r) => r.slice(1));
  const cons = rec.reasons.filter((r) => r.startsWith('-')).map((r) => r.slice(1));
  return (
    <article className="flex h-full flex-col rounded-2xl border border-line bg-card p-5 shadow-[var(--tv-shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-display text-base font-semibold text-ink">{route?.name ?? rec.route}</h4>
        <span className={clsx('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', FIT_TONE[rec.fit])}>{t(`discover.compare.wizard.fit.${rec.fit}`)}</span>
      </div>
      {pros.length > 0 && (
        <>
          <p className="mt-3 text-xs font-bold tracking-wide text-muted uppercase">{t('discover.compare.wizard.why')}</p>
          <ul className="mt-1.5 space-y-1.5">
            {pros.map((r) => (
              <li key={r} className="flex gap-2 text-sm text-ink/85">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden /> {t(`discover.compare.reasons.${r}`)}
              </li>
            ))}
          </ul>
        </>
      )}
      {cons.length > 0 && (
        <>
          <p className="mt-3 text-xs font-bold tracking-wide text-muted uppercase">{t('discover.compare.wizard.gaps')}</p>
          <ul className="mt-1.5 space-y-1.5">
            {cons.map((r) => (
              <li key={r} className="flex gap-2 text-sm text-ink/85">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden /> {t(`discover.compare.reasons.${r}`)}
              </li>
            ))}
          </ul>
        </>
      )}
      <RouteLinks route={route} className="mt-auto pt-4" />
    </article>
  );
};

const RouteLinks = ({ route, className }: { route: CompareData['routes'][number] | undefined; className?: string }) => {
  const { t } = useTranslation();
  if (!route) return null;
  return (
    <div className={clsx('flex flex-wrap gap-2', className)}>
      {route.guide && (
        <PathLink path={route.guide.path} className="btn-secondary btn-sm">
          <BookOpen className="size-4" aria-hidden /> {t('discover.compare.links.guide')}
        </PathLink>
      )}
      {route.tool && (
        <Link to={route.tool} className="btn-ghost btn-sm">
          <Calculator className="size-4" aria-hidden /> {t(`discover.compare.tool.${route.tool.slice(1)}`)}
        </Link>
      )}
    </div>
  );
};

/** /compare-visas: comparison table + wizard + FAQ (content: GET /api/compare-visas, also server-rendered for crawlers). */
export default function CompareVisas() {
  const { t } = useTranslation();
  usePageTitle(t('discover.compare.title'));
  const lng = currentSiteLocale();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['compare-visas', lng],
    queryFn: async () => (await api.get<CompareData>('/compare-visas', { params: { lng } })).data,
    staleTime: 10 * 60_000,
  });

  return (
    <>
      <PageHero title={t('discover.compare.title')} subtitle={t('discover.compare.subtitle')} image={HERO} crumb={{ to: '/tools', label: t('siteNav.tools') }} />

      {isLoading ? (
        <div className="grid min-h-[40vh] place-items-center">
          <Spinner className="size-8 text-primary" />
        </div>
      ) : isError || !data ? (
        <section className="section">
          <div className="container-x">
            <div className="card card-pad text-center">
              <p className="text-sm text-muted">{t('discover.compare.loadError')}</p>
              <button type="button" className="btn-ghost btn-sm mt-4" onClick={() => refetch()}>
                {t('discover.compare.retry')}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="section" aria-labelledby="wizard-title">
            <div className="container-x grid items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-12">
              <div>
                <span className="eyebrow mb-3">
                  <Sparkles className="size-4" aria-hidden /> {t('discover.compare.wizard.eyebrow')}
                </span>
                <h2 id="wizard-title" className="h-section text-balance text-ink">
                  {t('discover.compare.wizard.title')}
                </h2>
                <p className="mt-3 leading-relaxed text-muted">{data.intro}</p>
                <p className="mt-4 flex gap-2 text-xs leading-relaxed text-muted">
                  <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('discover.compare.wizard.text')}
                </p>
              </div>
              <Wizard data={data} />
            </div>
          </section>

          <section className="section bg-sunken" aria-labelledby="table-title">
            <div className="container-x">
              <span className="eyebrow mb-3">{t('discover.compare.table.eyebrow')}</span>
              <h2 id="table-title" className="h-section text-balance text-ink">
                {t('discover.compare.table.title')}
              </h2>

              {/* Phones: one card per route */}
              <ul className="mt-8 space-y-4 md:hidden">
                {data.routes.map((r) => (
                  <li key={r.key} className="card card-pad">
                    <h3 className="font-display text-lg font-semibold text-ink">{r.name}</h3>
                    <dl className="mt-3 divide-y divide-line">
                      {data.criteria.map((c) => (
                        <div key={c.key} className="py-2.5">
                          <dt className="text-xs font-semibold text-muted">{c.label}</dt>
                          <dd className="mt-0.5 text-sm leading-relaxed text-ink">{r.cells[c.key]}</dd>
                        </div>
                      ))}
                    </dl>
                    <RouteLinks route={r} className="mt-3" />
                  </li>
                ))}
              </ul>

              {/* Tablet / desktop: the table */}
              <div className="mt-8 hidden md:block">
                <p className="mb-2 text-xs text-muted xl:hidden">{t('discover.compare.table.hint')}</p>
                <div className="overflow-x-auto rounded-2xl border border-line bg-card shadow-[var(--tv-shadow-card)]" tabIndex={0} role="region" aria-labelledby="table-title">
                  <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                    <caption className="sr-only">{data.caption}</caption>
                    <thead>
                      <tr className="border-b border-line-strong bg-sunken text-ink">
                        <th scope="col" className="sticky left-0 z-10 w-44 bg-sunken p-4 text-xs font-semibold tracking-wide text-muted uppercase">
                          {data.criterion}
                        </th>
                        {data.routes.map((r) => (
                          <th key={r.key} scope="col" className="p-4 align-top font-display text-sm font-semibold">
                            {r.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.criteria.map((c, i) => (
                        <tr key={c.key} className={clsx('border-t border-line', i % 2 ? 'bg-canvas' : 'bg-card')}>
                          <th scope="row" className={clsx('sticky left-0 z-10 p-4 align-top text-xs font-semibold text-ink', i % 2 ? 'bg-canvas' : 'bg-card')}>
                            {c.label}
                          </th>
                          {data.routes.map((r) => (
                            <td key={r.key} className="p-4 align-top leading-relaxed text-ink/85">
                              {c.key === 'jobOffer' ? (
                                <span className="inline-flex items-start gap-1.5">
                                  {r.jobOffer === 'yes' ? (
                                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden />
                                  ) : (
                                    <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-line-strong" aria-hidden />
                                  )}
                                  {r.cells[c.key]}
                                </span>
                              ) : (
                                r.cells[c.key]
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t border-line">
                        <th scope="row" className="sticky left-0 z-10 bg-card p-4 text-xs font-bold text-ink">
                          {t('discover.compare.links.guide')}
                        </th>
                        {data.routes.map((r) => (
                          <td key={r.key} className="p-4 align-top">
                            <RouteLinks route={r} />
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-4 flex gap-2 text-xs leading-relaxed text-muted">
                <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {data.disclaimer}
              </p>
            </div>
          </section>

          <section className="section" aria-labelledby="faq-title">
            <div className="container-x max-w-3xl">
              <h2 id="faq-title" className="h-section text-balance text-ink">
                {t('discover.compare.faqTitle')}
              </h2>
              <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-card shadow-[var(--tv-shadow-card)]">
                {data.faq.map((f) => (
                  <details key={f.q} className="group p-5">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-semibold text-ink">
                      <h3 className="text-base">{f.q}</h3>
                      <ChevronDown className="mt-1 size-4 shrink-0 transition group-open:rotate-180" aria-hidden />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-ink/80">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      <PageCta
        title={t('discover.compare.ctaTitle')}
        text={t('discover.compare.ctaText')}
        primary={{ to: '/booking', label: t('discover.compare.ctaBooking') }}
        secondary={{ to: '/eligibility', label: t('discover.compare.ctaEligibility') }}
      />
    </>
  );
}
