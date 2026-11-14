import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, BadgeCheck, Building2, ChevronLeft, ChevronRight, ExternalLink, Globe2, Landmark, Link2, MapPin, Search, Send } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { pagesGermanyJobs } from '@/i18n/pagesGermanyJobs';
import { useL10n } from '@/lib/l10n';
import {
  RADII,
  baJobboerseUrl,
  isListingUrl,
  searchFromParams,
  searchToParams,
  type GermanyJob,
  type GermanyJobResults,
  type GermanyJobSearch,
  type GermanyJobSourceInfo,
} from '@/lib/germanyJobs';
import { PageHero } from '@/components/layout/PageHero';
import { Button, buttonClass } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Lost, SearchEmpty } from '@/components/illustrations';
import { useJobLabels } from '@/components/jobs/labels';
import { ApplyDialog, type ExternalListing } from '@/components/germanyJobs/ApplyDialog';

registerCopy(pagesJobs);
registerCopy(pagesGermanyJobs);

const BASE = '/jobs/germany';
const RESULTS = `${BASE}/search`;
const DATE_LOCALE = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' } as const;

/**
 * Source attribution of a listing. Adzuna's terms want the word "Adzuna" (>= 116 x 23 px) linked to the local
 * domain on every advert; the others get a "via <source>" link back (Arbeitnow asks for one, terms §11).
 */
const SourceBadge = ({ source, prefix }: { source: GermanyJobSourceInfo; prefix: string }) => (
  <a
    href={source.url}
    target="_blank"
    rel="noopener"
    className={clsx(
      'inline-flex h-[23px] items-center justify-center gap-1 rounded border border-line bg-card px-2 text-[11px] font-semibold whitespace-nowrap text-ink hover:border-line-strong',
      source.id === 'adzuna' && 'min-w-[116px]',
    )}
  >
    <span className="font-normal text-muted">{prefix}</span>
    <span className="tracking-wide">{source.name}</span>
  </a>
);

const FALLBACK_SOURCE: Record<string, GermanyJobSourceInfo> = {
  arbeitnow: { id: 'arbeitnow', name: 'Arbeitnow', url: 'https://www.arbeitnow.com' },
  careerjet: { id: 'careerjet', name: 'Careerjet', url: 'https://www.careerjet.de' },
  jooble: { id: 'jooble', name: 'Jooble', url: 'https://de.jooble.org' },
  adzuna: { id: 'adzuna', name: 'Adzuna', url: 'https://www.adzuna.de' },
};
const PERIOD_KEY = { year: 'perYear', month: 'perMonth', week: 'perWeek', day: 'perDay', hour: 'perHour' } as const;

/**
 * Almaniya iş bazası — /jobs/germany (landing, indexable: our own text + the form) and /jobs/germany/search
 * (results, noindex: third-party listings, server lib/seoCatalogue.ts). German jobs and Ausbildung places from free
 * job sources (Arbeitnow by default; Careerjet / Jooble / Adzuna when configured, server lib/germanyJobs), shown apart from our own verified vacancies (/jobs); each listing can be
 * applied for "via Triad Vision" (ApplyDialog) or opened at its source. A box builds the public search URL of the
 * official BA Jobbörse from the same form, and any pasted job-ad link can be applied for as well.
 *
 * Hydration: the form state comes from the URL (same on server and client); the config query is server-rendered
 * (SSR key "germany-jobs-config"); the results are fetched in the browser only.
 */
export default function GermanyJobs() {
  const { t } = useTranslation();
  usePageTitle(t('gj.eyebrow'));
  const L = useJobLabels();
  const { locale } = useL10n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isResults = pathname.replace(/\/+$/, '').endsWith(RESULTS);
  const [params, setParams] = useSearchParams();
  const search = useMemo(() => searchFromParams(params), [params]);
  const [form, setForm] = useState<GermanyJobSearch>(search);
  const [listing, setListing] = useState<ExternalListing | null>(null);
  const [pasted, setPasted] = useState('');
  const [pastedTouched, setPastedTouched] = useState(false);

  // Back / forward and shared URLs: the form follows the URL.
  useEffect(() => setForm(search), [search]);

  const config = useQuery({
    queryKey: ['germany-jobs-config'],
    queryFn: async () => (await api.get<{ search: boolean; sources: GermanyJobSourceInfo[] }>('/germany-jobs/config')).data,
    staleTime: 5 * 60 * 1000,
  });
  const enabled = config.data?.search === true;
  const hasQuery = !!(search.q || search.where);

  const results = useQuery({
    queryKey: ['germany-jobs-search', search],
    queryFn: async () => (await api.get<GermanyJobResults>('/germany-jobs/search', { params: { ...search, lng: locale } })).data,
    enabled: isResults && enabled && hasQuery,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
    retry: (n, err) => errorCode(err) !== 'FEATURE_DISABLED' && errorCode(err) !== 'UPSTREAM_BUSY' && n < 1,
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Without our own search (no job source enabled) Enter runs the same search at the BA Jobbörse.
    if (!enabled) {
      window.open(baJobboerseUrl(form), '_blank', 'noopener');
      return;
    }
    const qs = searchToParams({ ...form, page: 1 }).toString();
    if (isResults) setParams(new URLSearchParams(qs));
    else navigate(`${RESULTS}${qs ? `?${qs}` : ''}`);
  };

  const goPage = (page: number) => {
    setParams(searchToParams({ ...search, page }));
    if (typeof window !== 'undefined') document.getElementById('gj-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const baUrl = baJobboerseUrl(form);
  const pastedOk = isListingUrl(pasted);
  const fmtDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat(DATE_LOCALE[locale], { dateStyle: 'medium' }).format(new Date(iso)) : '');
  const salary = (j: GermanyJob) => {
    if (j.salaryMin == null && j.salaryMax == null) return j.salaryText;
    const value = L.salary(j.salaryMin, j.salaryMax);
    return j.salaryPeriod ? t(`gj.card.${PERIOD_KEY[j.salaryPeriod]}`, { value }) : value;
  };
  const sourceOf = (id: string) => results.data?.sources.find((x) => x.id === id) ?? config.data?.sources.find((x) => x.id === id) ?? FALLBACK_SOURCE[id];
  const applyFor = (j: GermanyJob) =>
    setListing({ provider: j.source, url: j.url, externalId: j.id.slice(0, 64), title: j.title, company: j.company, location: j.location, type: search.type });
  const sourceList = results.data?.sources ?? config.data?.sources ?? [];

  const field = 'input h-11';
  const busy = errorCode(results.error) === 'UPSTREAM_BUSY';

  return (
    <>
      <PageHero title={t('gj.title')} subtitle={t('gj.subtitle')} crumb={{ to: '/jobs', label: t('gj.intro.ownJobs') }}>
        <form role="search" aria-label={t('gj.form.label')} onSubmit={submit} className="card mt-7 grid max-w-3xl gap-3 rounded-2xl p-4 sm:grid-cols-2 sm:p-5">
          <fieldset className="sm:col-span-2">
            <legend className="sr-only">{t('gj.form.type')}</legend>
            <div className="inline-flex rounded-xl border border-line bg-sunken p-1" role="radiogroup" aria-label={t('gj.form.type')}>
              {(['job', 'ausbildung'] as const).map((v) => (
                <label
                  key={v}
                  className={clsx(
                    'relative inline-flex min-h-10 cursor-pointer items-center rounded-lg px-4 text-sm font-semibold transition has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-focus/40',
                    form.type === v ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink',
                  )}
                >
                  <input type="radio" name="type" value={v} checked={form.type === v} onChange={() => setForm({ ...form, type: v })} className="sr-only" />
                  {v === 'job' ? t('gj.form.typeJob') : t('gj.form.typeAusbildung')}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="gj-q">{t('gj.form.what')}</label>
            <input id="gj-q" type="search" maxLength={100} className={field} placeholder={t('gj.form.whatPlaceholder')} value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="gj-where">{t('gj.form.where')}</label>
            <input id="gj-where" maxLength={100} autoComplete="address-level2" className={field} placeholder={t('gj.form.wherePlaceholder')} value={form.where} onChange={(e) => setForm({ ...form, where: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="gj-radius">{t('gj.form.radius')}</label>
              <select id="gj-radius" className={field} value={form.radius} onChange={(e) => setForm({ ...form, radius: Number(e.target.value) })}>
                {RADII.map((r) => (
                  <option key={r} value={r}>
                    {r === 0 ? t('gj.form.radiusPlace') : t('gj.form.radiusKm', { n: r })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="gj-time">{t('gj.form.time')}</label>
              <select id="gj-time" className={field} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value as GermanyJobSearch['time'] })}>
                <option value="any">{t('gj.form.timeAny')}</option>
                <option value="full">{t('gj.form.timeFull')}</option>
                <option value="part">{t('gj.form.timePart')}</option>
              </select>
            </div>
          </div>
          {enabled && (
            <fieldset className="flex flex-wrap gap-x-5 gap-y-2 sm:col-span-2">
              <legend className="sr-only">{t('gj.form.extra')}</legend>
              {(['remote', 'visa'] as const).map((k) => (
                <label key={k} className="inline-flex min-h-10 items-center gap-2 text-sm text-ink">
                  <input type="checkbox" className="size-5 accent-brand-600" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />
                  {t(`gj.form.${k}`)}
                </label>
              ))}
            </fieldset>
          )}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            {enabled && (
              <button type="submit" className={buttonClass({ className: 'h-11 px-5' })}>
                <Search className="size-4" aria-hidden /> {t('gj.form.submit')}
              </button>
            )}
            <a href={baUrl} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: enabled ? 'secondary' : 'primary', className: 'h-11' })}>
              <Landmark className="size-4" aria-hidden /> {t('gj.ba.button')} <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">{t('gj.card.newTab')}</span>
            </a>
          </div>
          {config.isSuccess && !enabled && <p className="text-sm text-muted sm:col-span-2">{t('gj.disabled')}</p>}
        </form>
      </PageHero>

      {isResults && enabled && (
        <section id="gj-results" className="section-sm scroll-mt-24 bg-sunken" aria-labelledby="gj-results-h">
          <div className="container-x">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="gj-results-h" className="font-display text-xl font-semibold text-ink sm:text-2xl">
                  {t('gj.results.heading')}
                </h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted" aria-live="polite">
                  {results.data ? t('gj.results.count', { count: results.data.total }) : ' '}
                  {results.isFetching && !results.isLoading && <Spinner className="size-3.5 text-primary" />}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {sourceList.map((src) => (
                  <SourceBadge key={src.id} source={src} prefix={t('gj.results.jobsVia')} />
                ))}
              </div>
            </div>
            <p className="mb-5 flex items-start gap-2 rounded-xl border border-line bg-card px-4 py-3 text-sm text-muted">
              <Globe2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {t('gj.results.feedNote')} {t('gj.results.source')}
              </span>
            </p>

            {!hasQuery ? (
              <div className="card rounded-3xl">
                <EmptyState illustration={<SearchEmpty />} text={t('gj.results.start')} />
              </div>
            ) : results.isLoading ? (
              <SkeletonGrid count={6} lines={3} footer className="grid-cards cards-balanced grid-cols-1 [--cols:1] md:[--cols:2]" />
            ) : results.isError ? (
              <div className="card rounded-3xl">
                <EmptyState
                  illustration={<Lost />}
                  text={busy ? t('gj.results.busy') : t('gj.results.error')}
                  action={
                    <Button variant="outline" onClick={() => results.refetch()}>
                      {t('gj.results.retry')}
                    </Button>
                  }
                />
              </div>
            ) : !results.data?.items.length ? (
              <div className="card rounded-3xl">
                <EmptyState
                  size="lg"
                  illustration={<SearchEmpty />}
                  title={t('gj.results.empty')}
                  text={t('gj.results.emptyText')}
                  action={
                    <a href={baUrl} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: 'outline' })}>
                      {t('gj.ba.button')} <ExternalLink className="size-3.5" aria-hidden />
                      <span className="sr-only">{t('gj.card.newTab')}</span>
                    </a>
                  }
                />
              </div>
            ) : (
              <>
                <ul className={clsx('grid gap-4 md:grid-cols-2', results.isFetching && 'opacity-70 transition-opacity')}>
                  {results.data.items.map((j) => {
                    const pay = salary(j);
                    return (
                      <li key={j.id} className="card flex flex-col rounded-2xl p-5">
                        <div className="flex items-start justify-between gap-3">
                          <span className="badge bg-sunken text-muted">{t('gj.card.externalNote')}</span>
                          {sourceOf(j.source) && <SourceBadge source={sourceOf(j.source)!} prefix={t('gj.results.jobsVia')} />}
                        </div>
                        <h3 className="mt-3 font-display text-lg leading-snug font-semibold break-words text-ink">{j.title}</h3>
                        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                          {j.company && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="size-3.5" aria-hidden /> {j.company}
                            </span>
                          )}
                          {j.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5" aria-hidden /> {j.location}
                            </span>
                          )}
                        </p>
                        {(pay || j.contractTime || j.contractType || j.remote || j.visaSponsorship) && (
                          <p className="mt-3 flex flex-wrap gap-2 text-xs">
                            {pay && (
                              <span className="badge bg-success-bg text-success-fg">
                                {pay}
                                {j.salaryPredicted && ` · ${t('gj.card.estimated')}`}
                              </span>
                            )}
                            {j.contractTime && <span className="badge bg-sunken text-ink">{t(`gj.card.${j.contractTime}`)}</span>}
                            {j.remote && <span className="badge bg-sunken text-ink">{t('gj.card.remote')}</span>}
                            {j.visaSponsorship && <span className="badge bg-accent-bg text-accent-fg">{t('gj.card.visa')}</span>}
                            {j.contractType && <span className="badge bg-sunken text-ink">{t(`gj.card.${j.contractType}`)}</span>}
                          </p>
                        )}
                        {j.snippet && <p className="mt-3 line-clamp-4 text-sm text-muted">{j.snippet}</p>}
                        {j.created && <p className="mt-2 text-xs text-subtle">{t('gj.card.posted', { date: fmtDate(j.created) })}</p>}
                        <div className="mt-auto flex flex-wrap gap-2 pt-4">
                          <Button icon={Send} onClick={() => applyFor(j)}>
                            {t('gj.card.apply')}
                          </Button>
                          <a href={j.url} target="_blank" rel="nofollow noopener noreferrer" className={buttonClass({ variant: 'secondary' })}>
                            {t('gj.card.original')} <ExternalLink className="size-3.5" aria-hidden />
                            <span className="sr-only">{t('gj.card.newTab')}</span>
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {results.data.pages > 1 && (
                  <nav className="mt-8 flex items-center justify-center gap-2" aria-label={t('gj.results.pagination')}>
                    <button type="button" className={buttonClass({ variant: 'secondary' })} disabled={search.page <= 1} onClick={() => goPage(search.page - 1)} aria-label={t('gj.results.prev')}>
                      <ChevronLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">{t('gj.results.prev')}</span>
                    </button>
                    <span className="px-2 text-sm text-muted tabular-nums">{t('gj.results.pageOf', { page: search.page, pages: results.data.pages })}</span>
                    <button
                      type="button"
                      className={buttonClass({ variant: 'secondary' })}
                      disabled={search.page >= results.data.pages}
                      onClick={() => goPage(search.page + 1)}
                      aria-label={t('gj.results.next')}
                    >
                      <span className="hidden sm:inline">{t('gj.results.next')}</span> <ChevronRight className="size-4" aria-hidden />
                    </button>
                  </nav>
                )}
                <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{t('gj.results.sources')}</span>
                  {results.data.sources.map((src) => (
                    <a key={src.id} href={src.url} target="_blank" rel="noopener" className="text-link hover:underline">
                      {t('gj.card.via', { name: src.name })}
                    </a>
                  ))}
                </p>
              </>
            )}
          </div>
        </section>
      )}

      <section className="section-sm">
        <div className="container-x grid gap-6 lg:grid-cols-2">
          <div className="card rounded-3xl p-6 sm:p-8">
            <p className="eyebrow">
              <Landmark className="size-4" aria-hidden /> Bundesagentur für Arbeit
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink">{t('gj.ba.title')}</h2>
            <p className="mt-2 text-muted">{t('gj.ba.text')}</p>
            <a href={baUrl} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: 'outline', className: 'mt-5' })}>
              {t('gj.ba.button')} <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">{t('gj.card.newTab')}</span>
            </a>
          </div>

          <form
            className="card rounded-3xl p-6 sm:p-8"
            onSubmit={(e) => {
              e.preventDefault();
              setPastedTouched(true);
              if (pastedOk) setListing({ provider: 'link', url: pasted.trim(), type: form.type });
            }}
          >
            <p className="eyebrow">
              <Link2 className="size-4" aria-hidden /> Triad Vision
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink">{t('gj.link.title')}</h2>
            <p className="mt-2 text-muted">{t('gj.link.text')}</p>
            <label className="label mt-4" htmlFor="gj-paste">{t('gj.link.label')}</label>
            <input
              id="gj-paste"
              type="url"
              inputMode="url"
              maxLength={1000}
              className="input h-11"
              placeholder={t('gj.link.placeholder')}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              onBlur={() => setPastedTouched(true)}
              aria-invalid={(pastedTouched && !!pasted && !pastedOk) || undefined}
              aria-describedby={pastedTouched && pasted && !pastedOk ? 'gj-paste-err' : undefined}
            />
            {pastedTouched && pasted && !pastedOk && (
              <p id="gj-paste-err" className="mt-1 text-xs text-danger">
                {t('gj.link.invalid')}
              </p>
            )}
            <button type="submit" className={buttonClass({ className: 'mt-4' })} disabled={!pasted.trim()}>
              <Send className="size-4" aria-hidden /> {t('gj.link.button')}
            </button>
          </form>
        </div>
      </section>

      <section className="section-sm bg-sunken">
        <div className="container-x grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">{t('gj.intro.title')}</h2>
            <ol className="mt-4 space-y-3">
              {(t('gj.intro.steps', { returnObjects: true }) as string[]).map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-contrast" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-ink">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card rounded-3xl p-6">
            <p className="flex items-start gap-2 text-sm text-muted">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t('gj.intro.separate')}
            </p>
            {enabled && (
              <p className="mt-3 text-xs text-muted">
                {t('gj.results.feedNote')}{' '}
                <span className="inline-flex flex-wrap gap-x-2">
                  {(config.data?.sources ?? []).map((src) => (
                    <a key={src.id} href={src.url} target="_blank" rel="noopener" className="text-link hover:underline">
                      {t('gj.card.via', { name: src.name })}
                    </a>
                  ))}
                </span>
              </p>
            )}
            <Link to="/jobs" className={buttonClass({ variant: 'outline', className: 'mt-4' })}>
              {t('gj.intro.ownJobs')} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <ApplyDialog listing={listing} onClose={() => setListing(null)} />
    </>
  );
}
