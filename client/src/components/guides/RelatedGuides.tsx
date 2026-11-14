import { useTranslation } from 'react-i18next';
import { PathLink, useGuides } from '@/components/guides/shared';
import { registerCopy } from '@/i18n';
import { pagesSeo } from '@/i18n/pagesSeo';
import { TOOL_GUIDES } from '@/lib/guideTools';

registerCopy(pagesSeo);

/**
 * "Related guides" under a tool page: the guides of this tool (lib/guideTools.ts, the same map the crawler HTML
 * uses), in the reader's language. Nothing while the guide list loads or when none of them is published.
 */
export const RelatedGuides = ({ tool, className = 'section bg-sunken' }: { tool: string; className?: string }) => {
  const { t } = useTranslation();
  const { data } = useGuides();
  const keys = TOOL_GUIDES[tool] ?? [];
  const items = keys.map((k) => data?.find((g) => g.key === k)).filter((g): g is NonNullable<typeof g> => !!g).slice(0, 4);
  if (!items.length) return null;
  return (
    <section className={className} aria-labelledby="related-guides-h">
      <div className="container-x">
        <h2 id="related-guides-h" className="h-section section-head text-ink">
          {t('guidesPage.related')}
        </h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map((g) => (
            <PathLink key={g.key} path={g.path} className="card card-interactive card-pad block rounded-3xl">
              <h3 className="font-display text-lg leading-snug font-semibold text-ink">{g.title}</h3>
              <p className="mt-2 line-clamp-3 text-sm text-muted">{g.description}</p>
            </PathLink>
          ))}
        </div>
      </div>
    </section>
  );
};
