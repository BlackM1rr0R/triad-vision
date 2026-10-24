import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import type { PublicLanding } from '@/components/marketing/api';
import { registerCopy } from '@/i18n';
import { pagesMarketing } from '@/i18n/pagesMarketing';
import { api } from '@/lib/api';
import { leadVisitorId } from '@/lib/leadVisitor';
import { usePageTitle } from '@/lib/usePageTitle';
import NotFound from '../NotFound';

registerCopy(pagesMarketing);

/**
 * Public landing page /l/:slug: sections from the builder (Admin → Lendinq səhifələri). The view is
 * counted once per page load with a beacon (bots are ignored on the server); with analytics consent the
 * lead visitor gets a "landing_view" event. Head meta (SEO title / description / image) is rendered on
 * the server (lib/seo.ts) and refreshed by usePageTitle on navigation.
 */
export default function LandingPage() {
  const { slug = '' } = useParams();
  const { data: page, isLoading, isError } = useQuery({
    queryKey: ['landing', slug],
    queryFn: async () => (await api.get<{ page: PublicLanding }>(`/landing/${encodeURIComponent(slug)}`)).data.page,
    retry: false,
    staleTime: 60_000,
  });
  usePageTitle(page ? page.seoTitle || page.title : null);

  useEffect(() => {
    if (!page) return;
    try {
      const v = leadVisitorId();
      const body = JSON.stringify(v ? { visitorId: v } : {});
      if (typeof navigator.sendBeacon === 'function') navigator.sendBeacon(`/api/landing/${encodeURIComponent(page.slug)}/view`, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    } catch {
      // counting views is best effort
    }
  }, [page]);

  if (isLoading) return <Spinner />;
  if (isError || !page) return <NotFound />;
  return <LandingRenderer slug={page.slug} locale={page.locale} sections={page.sections} formConfig={page.formConfig} />;
}
