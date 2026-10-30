import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calendar, Clock, Link2, PenLine, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { Reveal } from '@/components/motion';
import { buttonClass } from '@/components/ui/Button';
import { PostCard } from '@/components/cards';
import { useSiteContent } from '@/lib/content';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { Post } from '@/lib/types';
import NotFound from './NotFound';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesSeo } from '@/i18n/pagesSeo';

registerCopy(pagesSeo); // "updated" + author line

export default function NewsDetail() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const { data: content } = useSiteContent();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['post', slug],
    queryFn: async () => (await api.get<{ post: Post }>(`/public/posts/${slug}`)).data.post,
  });
  usePageTitle(data ? tr(data.title) : t('nav.news'));
  if (isLoading) return <PageHeroSkeleton />;
  if (isError || !data) return <NotFound />;

  const body = tr(data.body);
  const related = (content?.posts ?? []).filter((p) => p.slug !== data.slug).slice(0, 3);
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const share = [
    { name: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${tr(data.title)} ${url}`)}` },
    { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  ];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('article.copied'));
    } catch {
      toast.error(t('common.error'));
    }
  };
  const minutes = Math.max(1, Math.round(body.split(/\s+/).length / 200));
  // Shown when the post was edited at least a day after publication (Article JSON-LD dateModified matches).
  const updatedAt = (data as typeof data & { updatedAt?: string }).updatedAt;
  const showUpdated = !!updatedAt && new Date(updatedAt).getTime() - new Date(data.publishedAt).getTime() > 86_400_000;

  return (
    <>
      <PageHero title={tr(data.title)} image={data.cover.replace('w=1200', 'w=2000')} crumb={{ to: '/news', label: t('nav.news') }}>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
          <span className="flex items-center gap-1.5"><Calendar className="size-4" /> {date(data.publishedAt, { dateStyle: 'long' })}</span>
          <span className="flex items-center gap-1.5"><Clock className="size-4" /> {minutes} {t('common.minRead')}</span>
          {showUpdated && (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="size-4" aria-hidden /> <time dateTime={updatedAt}>{t('newsMeta.updated', { date: date(updatedAt!, { dateStyle: 'long' }) })}</time>
            </span>
          )}
          <span className="flex items-center gap-1.5"><PenLine className="size-4" aria-hidden /> {t('newsMeta.author')}</span>
        </div>
      </PageHero>
      <article className="section">
        <div className="container-x max-w-3xl">
          <Reveal>
            <p className="mb-8 max-w-[65ch] text-xl leading-relaxed font-medium text-ink">{tr(data.excerpt)}</p>
            <div className="prose-tv max-w-[70ch] text-lg">
              {body.split(/\n{2,}/).map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
            <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
              <Link to="/news" className={buttonClass({ variant: 'outline' })}>
                <ArrowLeft className="size-4" /> {t('common.back')}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-muted">{t('article.share')}:</span>
                {share.map((s) => (
                  <a key={s.name} href={s.href} target="_blank" rel="noreferrer" className={buttonClass({ variant: 'secondary', size: 'sm', className: 'h-11' })}>
                    {s.name}
                  </a>
                ))}
                <button type="button" onClick={copy} className={buttonClass({ variant: 'secondary', size: 'sm', className: 'h-11' })} aria-label={t('article.copy')}>
                  <Link2 className="size-4" /> {t('article.copy')}
                </button>
              </div>
            </div>
          </Reveal>
        </div>
      </article>
      {related.length > 0 && (
        <section className="section bg-sunken">
          <div className="container-x">
            <h2 className="h-section section-head text-ink">{t('article.related')}</h2>
            <div className="mobile-rail cards-balanced [--cols:1] md:[--cols:2] lg:[--cols:3]">
              {related.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
