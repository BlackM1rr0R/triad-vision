import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Quote } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { Lost } from '@/components/illustrations';
import { registerCopy } from '@/i18n';
import { pagesReferralShare } from '@/i18n/pagesReferralShare';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { getBrand } from '@/lib/brand';

registerCopy(pagesReferralShare);

interface Landing {
  firstName: string;
  quote: string;
  photoUrl: string | null;
  code: string;
}

/**
 * Public personal referral page /r/:slug — opt-in by the client (first name, quote, optional photo) with a
 * "Register" button carrying their code. /r is a private prefix: robots noindex, not in the sitemap.
 */
export default function ReferralLandingPage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['referral-landing', slug], retry: false, queryFn: async () => (await api.get<Landing>(`/growth/r/${encodeURIComponent(slug)}`)).data });
  usePageTitle(q.data ? t('rs.page.title', { name: q.data.firstName }) : getBrand().name);

  if (q.isLoading) {
    return (
      <section className="grid min-h-[100svh] place-items-center bg-canvas text-primary" role="status">
        <Spinner className="size-9 border-[3px]" />
      </section>
    );
  }
  if (q.isError || !q.data) {
    return (
      <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12">
        <div className="container-x">
          <div className="card mx-auto max-w-xl rounded-3xl p-6 text-center sm:p-10">
            <Lost className="mx-auto w-40" />
            <p className="mt-4 text-ink">{t('rs.page.notFound')}</p>
            <Link to="/" className={buttonClass({ variant: 'secondary', className: 'mt-5' })}>
              {t('rs.page.home')}
            </Link>
          </div>
        </div>
      </section>
    );
  }
  const d = q.data;
  return (
    <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12 sm:pt-28">
      <div className="container-x">
        <div className="card mx-auto max-w-xl rounded-3xl p-6 text-center sm:p-10">
          {d.photoUrl && <img src={d.photoUrl} alt="" width={128} height={128} className="mx-auto size-32 rounded-full object-cover" />}
          <h1 className="mt-5 font-display text-2xl font-semibold text-ink sm:text-3xl">{t('rs.page.title', { name: d.firstName })}</h1>
          <blockquote className="mt-4 flex items-start justify-center gap-2 text-lg text-ink/85">
            <Quote className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
            <span>{d.quote || t('rs.page.defaultQuote')}</span>
          </blockquote>
          <p className="mt-4 text-sm text-muted">{t('rs.page.how')}</p>
          <Link to={`/register?ref=${encodeURIComponent(d.code)}`} className={buttonClass({ className: 'mt-6' })}>
            {t('rs.page.cta')} <ArrowRight className="size-4" aria-hidden />
          </Link>
          <p className="mt-3 text-xs text-muted">{t('rs.page.code', { code: d.code })}</p>
        </div>
      </div>
    </section>
  );
}
