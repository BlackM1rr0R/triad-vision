import type { AnchorHTMLAttributes, MouseEvent, Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { currentSiteLocale, type SiteLocale } from '@/i18n';
import { navigateToUrl } from '@/lib/localeRouter';

export interface GuideSummary {
  key: string;
  locale: string;
  slug: string;
  title: string;
  description: string;
  updatedAt: string;
  /** Full site path with the language prefix (/tr/guides/…). */
  path: string;
}

export interface GuideDetail {
  key: string;
  locale: string;
  slug: string;
  title: string;
  description: string;
  html: string;
  toc: { id: string; text: string }[];
  faq: { q: string; a: string }[];
  updatedAt: string;
  createdAt: string;
  alternates: Partial<Record<SiteLocale, string>>;
  related: { key: string; slug: string; title: string; description: string; path: string }[];
}

/** Published guides in the current site language (English versions fill missing ones). */
export const useGuides = (lng: SiteLocale = currentSiteLocale()) =>
  useQuery({
    queryKey: ['guides', lng],
    queryFn: async () => (await api.get<{ items: GuideSummary[] }>('/guides', { params: { lng } })).data.items,
    staleTime: 5 * 60_000,
  });

/** The path of one guide key in the current language (for links from tools and pages), or null. */
export const useGuidePath = (key: string) => {
  const { data } = useGuides();
  return data?.find((g) => g.key === key)?.path ?? null;
};

const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** Link to a full site path from the API (keeps its own language prefix), navigating client-side. */
export const PathLink = ({ path, ref, ...rest }: { path: string; ref?: Ref<HTMLAnchorElement> } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a
    ref={ref}
    href={path}
    {...rest}
    onClick={(e) => {
      rest.onClick?.(e);
      if (e.defaultPrevented || !plainClick(e)) return;
      e.preventDefault();
      navigateToUrl(path);
    }}
  />
);

/** Click handler for server-rendered HTML: internal links navigate client-side, #anchors scroll. */
export const onRichContentClick = (e: MouseEvent<HTMLElement>) => {
  // Already handled (a router <Link> inside an embedded calculator).
  if (e.defaultPrevented) return;
  const a = (e.target as HTMLElement).closest('a');
  const href = a?.getAttribute('href');
  if (!a || !href || a.target === '_blank' || !plainClick(e)) return;
  if (href.startsWith('#')) {
    e.preventDefault();
    document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (href.startsWith('/') && !href.startsWith('//')) {
    e.preventDefault();
    navigateToUrl(href);
  }
};
