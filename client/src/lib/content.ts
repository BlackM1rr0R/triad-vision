import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Service, SiteContent, VisaCategory } from './types';

/**
 * Site content (header, footer, home sections, every visa category and service as a card). The light variant
 * (?fields=shell, server/src/lib/contentShell.ts) leaves out the long visa / service texts: every server-rendered
 * page embeds this answer, and only the detail pages need them (visaQuery / serviceQuery below).
 */
export const SITE_CONTENT_URL = '/public/content?fields=shell';

export const useSiteContent = () =>
  useQuery({
    queryKey: ['content'],
    queryFn: async () => (await api.get<SiteContent>(SITE_CONTENT_URL)).data,
    staleTime: 10 * 60 * 1000,
  });

/** One visa category with its long texts (VisaDetail; SSR key 'visa'). */
export const visaQuery = (slug: string | undefined) => ({
  queryKey: ['visa', slug] as const,
  queryFn: async () => (await api.get<{ visa: VisaCategory }>(`/public/visa/${slug}`)).data.visa,
});

/** One service with its long texts (ServiceDetail; SSR key 'service'). */
export const serviceQuery = (slug: string | undefined) => ({
  queryKey: ['service', slug] as const,
  queryFn: async () => (await api.get<{ service: Service }>(`/public/services/${slug}`)).data.service,
});

const PREFETCH_STALE_MS = 60_000;

/**
 * Starts loading a detail page's texts when the visitor points at (or focuses, touches) its card, so the page
 * usually opens complete, as it did when the site content carried every text.
 */
export const prefetchDetail = (qc: QueryClient, kind: 'visa' | 'service', slug: string) => {
  if (kind === 'visa') void qc.prefetchQuery({ ...visaQuery(slug), staleTime: PREFETCH_STALE_MS });
  else void qc.prefetchQuery({ ...serviceQuery(slug), staleTime: PREFETCH_STALE_MS });
};

/** Pointer / focus / touch handlers for a link to a visa or service page (see prefetchDetail). */
export const usePrefetchDetail = (kind: 'visa' | 'service', slug: string) => {
  const qc = useQueryClient();
  const go = () => prefetchDetail(qc, kind, slug);
  return { onPointerEnter: go, onFocus: go, onTouchStart: go };
};
