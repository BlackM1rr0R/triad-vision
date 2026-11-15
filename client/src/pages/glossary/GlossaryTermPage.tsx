import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, ExternalLink, Quote } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesGlossary } from '@/i18n/pagesGlossary';
import { worldCopy } from '@/i18n/world';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { PageCta } from '@/components/visa/PageCta';
import { ListenButton } from '@/components/world/PhraseOfDay';
import { useWorldLang } from '@/components/world/locale';
import { withArticle, type GlossaryDetailResponse } from '@/lib/glossary';
import NotFound from '../NotFound';

registerCopy(pagesGlossary);
registerCopy(worldCopy);

/** /glossary/:slug — one term: article, pronunciation (with audio), definition, explanation, example, related terms. */
export default function GlossaryTermPage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const lng = useWorldLang();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['glossary-term', slug, lng],
    queryFn: async () => (await api.get<GlossaryDetailResponse>(`/glossary/${encodeURIComponent(slug)}`, { params: { lng } })).data,
    retry: false,
    staleTime: 60 * 60_000,
  });
  usePageTitle(data?.term.term ?? t('glossary.heroTitle'));

  if (isLoading) return <PageHeroSkeleton />;
  if (isError || !data) return <NotFound />;
  const term = data.term;
  const title = withArticle(term);

  return (
    <>
      <PageHero title={title} subtitle={term.short} crumb={{ to: '/glossary', label: t('glossary.heroTitle') }} />
      <section className="section">
        <div className="container-x grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-10">
          <article className="min-w-0 space-y-6">
            <Link to="/glossary" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden /> {t('glossary.back')}
            </Link>

            <div className="card card-pad rounded-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-semibold text-muted">{t(`glossary.categories.${term.category}`)}</span>
                <span className="text-sm text-muted">
                  {t('glossary.pron')}: <span lang="de" className="font-semibold text-ink">[{term.pron}]</span>
                </span>
                <ListenButton text={title.replace(' (Pl.)', '')} />
              </div>
              {term.aliases.length > 0 && (
                <p lang="de" className="mt-3 text-sm text-muted">
                  {term.aliases.join(' · ')}
                </p>
              )}
              <p lang={term.longFallback ?? undefined} className="mt-4 whitespace-pre-line text-base leading-relaxed text-ink">{term.long}</p>
              {term.longFallback && t('glossary.fallback') && <p className="mt-2 text-xs text-muted">{t('glossary.fallback')}</p>}
            </div>

            <figure className="card card-pad rounded-3xl">
              <figcaption className="flex items-center gap-2 text-sm font-semibold text-muted">
                <Quote className="size-4" aria-hidden /> {t('glossary.example')}
              </figcaption>
              <blockquote lang="de" className="mt-2 flex flex-wrap items-center gap-3 font-display text-lg text-ink">
                <span className="min-w-0 flex-1">{term.example}</span>
                <ListenButton text={term.example} />
              </blockquote>
            </figure>

            {term.link && (
              <p className="text-sm text-muted">
                {t('glossary.official')}:{' '}
                <a href={term.link.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-link hover:text-link-hover">
                  {term.link.label} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted">
              {t('glossary.asOf', { date: data.asOf })}. {t('glossary.disclaimer')}
            </p>

            <nav className="flex flex-wrap justify-between gap-3 border-t border-line pt-4 text-sm" aria-label={t('glossary.back')}>
              {data.prev ? (
                <Link to={`/glossary/${data.prev.slug}`} rel="prev" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-link hover:text-link-hover">
                  <ArrowLeft className="size-4" aria-hidden /> <span className="sr-only">{t('glossary.prev')}: </span>
                  <span lang="de">{data.prev.term}</span>
                </Link>
              ) : (
                <span />
              )}
              {data.next && (
                <Link to={`/glossary/${data.next.slug}`} rel="next" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-link hover:text-link-hover">
                  <span className="sr-only">{t('glossary.next')}: </span>
                  <span lang="de">{data.next.term}</span> <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </nav>
          </article>

          {data.related.length > 0 && (
            <aside className="card card-pad rounded-3xl lg:sticky lg:top-28">
              <h2 className="font-display text-xl font-semibold text-ink">{t('glossary.related')}</h2>
              <ul className="mt-3 divide-y divide-line">
                {data.related.map((r) => (
                  <li key={r.slug}>
                    <Link to={`/glossary/${r.slug}`} className="block py-3 hover:text-link">
                      <span lang="de" className="font-semibold text-ink">
                        {withArticle(r)}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{r.short}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to="/glossary" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:text-link-hover">
                {t('glossary.back')} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </aside>
          )}
        </div>
      </section>
      <PageCta title={t('glossary.ctaTitle')} text={t('glossary.ctaText')} primary={{ to: '/booking', label: t('siteNav.book') }} secondary={{ to: '/guides', label: t('glossary.guides') }} />
    </>
  );
}
