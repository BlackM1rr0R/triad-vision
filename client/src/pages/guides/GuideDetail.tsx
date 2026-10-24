import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Calculator, Calendar, ChevronDown, Clock, Euro, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { PageCta } from '@/components/visa/PageCta';
import { onRichContentClick, PathLink, type GuideDetail as Guide, type GuideSummary } from '@/components/guides/shared';
import { GuideBody } from '@/components/guides/GuideBody';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesSeo } from '@/i18n/pagesSeo';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { navigateToUrl } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import NotFound from '../NotFound';
import { LeadMagnetBlock } from '@/components/growth/LeadMagnetBlock';

registerCopy(pagesSeo);

const HERO = 'https://images.unsplash.com/photo-1560969184-10fe8719e047?auto=format&fit=crop&w=2000&q=70';

/** Tools shown next to a guide (by guide key). */
const TOOLS: Record<string, { to: string; key: 'ckCalc.title' | 'bcCheck.title' | 'nav.eligibility' | 'nav.anerkennung' | 'nav.salary'; icon: typeof Calculator }[]> = {
  chancenkarte: [{ to: '/chancenkarte-calculator', key: 'ckCalc.title', icon: Calculator }],
  'blue-card': [
    { to: '/blue-card-check', key: 'bcCheck.title', icon: Euro },
    { to: '/salary-calculator', key: 'nav.salary', icon: Calculator },
  ],
  anerkennung: [{ to: '/anerkennung', key: 'nav.anerkennung', icon: ListChecks }],
  pflege: [{ to: '/anerkennung', key: 'nav.anerkennung', icon: ListChecks }],
};

/** Body / sidebar placeholder with the same grid as the loaded guide, so nothing jumps when it arrives. */
const GuideBodySkeleton = () => {
  const { t } = useTranslation();
  return (
    <section className="section" role="status" aria-label={t('ui.loading')}>
      <div className="container-x grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]" aria-hidden>
        <div className="min-w-0 space-y-4">
          <SkeletonText lines={4} />
          <Skeleton className="mt-10 h-7 w-1/2" />
          <SkeletonText lines={5} />
          <Skeleton className="mt-10 h-7 w-2/5" />
          <SkeletonText lines={4} />
        </div>
        <div className="hidden space-y-6 lg:block">
          <div className="card card-pad space-y-3">
            <Skeleton className="h-3 w-1/2" />
            <SkeletonText lines={5} />
          </div>
          <div className="card card-pad space-y-3">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </section>
  );
};

/** Plain-text word count of the rendered HTML, for the reading time. */
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

/** One topic guide (/guides/:slug in the reader's language): TOC, body, FAQ, related guides, CTA. */
export default function GuideDetail() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const { date } = useL10n();
  const lng = currentSiteLocale();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['guide', lng, slug],
    queryFn: async () => (await api.get<{ guide?: Guide; redirect?: string }>(`/guides/${encodeURIComponent(slug)}`, { params: { lng } })).data,
  });
  const guide = data?.guide;
  // The guides list is usually cached: its title / description fill the hero at once (and the card can morph
  // into it) while the body loads.
  const summary = useQueryClient()
    .getQueryData<GuideSummary[]>(['guides', lng])
    ?.find((g) => g.slug === slug);
  usePageTitle(guide?.title ?? t('guidesPage.title'));
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // A slug of another language (language switch, old link): go to this language's version.
  useEffect(() => {
    if (data?.redirect) navigateToUrl(data.redirect, { replace: true });
  }, [data?.redirect]);

  if (isLoading || data?.redirect) {
    if (!summary || data?.redirect) return <PageHeroSkeleton />;
    return (
      <>
        <PageHero title={summary.title} subtitle={summary.description} image={HERO} crumb={{ to: '/guides', label: t('guidesPage.title') }} morph={{ kind: 'guide', id: slug }} />
        <GuideBodySkeleton />
      </>
    );
  }
  if (isError || !guide) return <NotFound />;

  const minutes = Math.max(1, Math.round(words(guide.html) / 200));
  const tools = [...(TOOLS[guide.key] ?? []), { to: '/eligibility', key: 'nav.eligibility' as const, icon: ListChecks }];

  return (
    <>
      <PageHero title={guide.title} subtitle={guide.description} image={HERO} crumb={{ to: '/guides', label: t('guidesPage.title') }} morph={{ kind: 'guide', id: guide.slug }}>
        <div className="mt-6 flex flex-wrap gap-4 text-sm text-white/70">
          <span className="flex items-center gap-1.5">
            <Calendar className="size-4" aria-hidden />
            <time dateTime={guide.updatedAt}>{t('guidesPage.updated', { date: date(guide.updatedAt, { dateStyle: 'long' }) })}</time>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden /> {t('guidesPage.minutes', { count: minutes })}
          </span>
        </div>
      </PageHero>

      <section className="section">
        <div className="container-x grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <article className="min-w-0">
            {guide.toc.length > 1 && (
              <nav aria-label={t('guidesPage.toc')} className="card card-pad mb-8 lg:hidden">
                <p className="font-display text-sm font-bold tracking-wide text-navy-900 uppercase">{t('guidesPage.toc')}</p>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm marker:text-brand-600">
                  {guide.toc.map((h) => (
                    <li key={h.id}>
                      <a href={`#${h.id}`} onClick={onRichContentClick} className="text-brand-700 hover:underline">
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            {/* Server-rendered from the guide's markdown (lib/guides/markdown.ts): all source text is escaped.
                Calculator shortcodes become live calculators (components/guides/GuideBody.tsx). */}
            <GuideBody html={guide.html} onClick={onRichContentClick} />

            {guide.faq.length > 0 && (
              <section className="mt-14" aria-labelledby="guide-faq">
                <h2 id="guide-faq" className="font-display text-2xl font-bold text-navy-900">
                  {t('guidesPage.faq')}
                </h2>
                <div className="mt-5 divide-y divide-line rounded-2xl border border-line">
                  {guide.faq.map((f, i) => (
                    <div key={f.q}>
                      <h3>
                        <button
                          type="button"
                          aria-expanded={openFaq === i}
                          onClick={() => setOpenFaq(openFaq === i ? null : i)}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-navy-900"
                        >
                          {f.q}
                          <ChevronDown className={clsx('size-4 shrink-0 transition', openFaq === i && 'rotate-180')} aria-hidden />
                        </button>
                      </h3>
                      {openFaq === i && <p className="px-5 pb-5 text-ink/80">{f.a}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Free e-book (lead magnet) built from the guides; renders nothing until it is published with a PDF. */}
            <LeadMagnetBlock from={`guide:${guide.key}`} className="mt-12" />

            <p className="mt-10 flex gap-2 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('guidesPage.disclaimer')}
            </p>

            <Link to="/guides" className="btn-ghost mt-8">
              <ArrowLeft className="size-4" aria-hidden /> {t('guidesPage.back')}
            </Link>
          </article>

          <aside className="space-y-6 lg:sticky lg:top-28">
            {guide.toc.length > 1 && (
              <nav aria-label={t('guidesPage.toc')} className="card card-pad hidden lg:block">
                <p className="font-display text-sm font-bold tracking-wide text-navy-900 uppercase">{t('guidesPage.toc')}</p>
                <ol className="mt-3 space-y-2 text-sm">
                  {guide.toc.map((h) => (
                    <li key={h.id}>
                      <a href={`#${h.id}`} onClick={onRichContentClick} className="text-muted hover:text-brand-700">
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            <div className="card card-pad">
              <p className="font-display text-sm font-bold tracking-wide text-navy-900 uppercase">{t('guidesPage.tools')}</p>
              <ul className="mt-3 space-y-2">
                {tools.map(({ to, key, icon: Icon }) => (
                  <li key={to}>
                    <Link to={to} className="flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline">
                      <Icon className="size-4" aria-hidden /> {t(key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>

      {guide.related.length > 0 && (
        <section className="section bg-surface">
          <div className="container-x">
            <h2 className="h-section section-head text-navy-900">{t('guidesPage.related')}</h2>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {guide.related.map((r) => (
                <PathLink key={r.key} path={r.path} className="card card-pad block transition hover:border-brand-400 hover:shadow-md">
                  <h3 className="font-display font-bold text-navy-900">{r.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-muted">{r.description}</p>
                </PathLink>
              ))}
            </div>
          </div>
        </section>
      )}

      <PageCta
        title={t('guidesPage.ctaTitle')}
        text={t('guidesPage.ctaText')}
        primary={{ to: '/booking', label: t('guidesPage.ctaBooking') }}
        secondary={{ to: '/eligibility', label: t('guidesPage.ctaEligibility') }}
      />
    </>
  );
}
