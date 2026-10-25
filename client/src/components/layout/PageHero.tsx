import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Reveal, SplitText } from '../motion';
import { sized, srcSet } from '@/lib/img';
import { useMorphTarget } from '@/lib/viewTransition';

/**
 * Warm header band at the top of every inner page (Direction B): sand background, breadcrumb, a serif h1,
 * a readable subtitle and, from lg up, the page photo in a rounded frame (or an illustration instead).
 * Children (search forms, chips, buttons) sit on the light band: style them with the tokens (text-ink,
 * bg-card, border-line, Button variants), never with text-white.
 */
export const PageHero = ({
  title,
  subtitle,
  image,
  illustration,
  crumb,
  children,
  morph,
}: {
  title: string;
  subtitle?: string;
  /** Page photo, shown in a rounded frame next to the text from lg up (decorative). */
  image?: string;
  /** Drawing from components/illustrations, shown instead of the photo (also on tablets). */
  illustration?: ReactNode;
  crumb?: { to: string; label: string };
  children?: ReactNode;
  /** Shared-element target of a list card (lib/viewTransition.ts): the card morphs into this hero. */
  morph?: { kind: string; id: string };
}) => {
  const { t } = useTranslation();
  const m = useMorphTarget(morph?.kind ?? '', morph?.id);
  const side = illustration ? (
    <div className="mx-auto hidden w-full max-w-[18rem] md:block lg:max-w-[22rem]">{illustration}</div>
  ) : image ? (
    <div className="hidden lg:block">
      <img
        src={sized(image, 800)}
        srcSet={srcSet(image, [480, 800, 1200])}
        sizes="(min-width: 1280px) 26rem, 22rem"
        alt=""
        fetchPriority="high"
        decoding="async"
        className="aspect-[4/3] w-full rounded-3xl border border-line object-cover shadow-[var(--tv-shadow-card)]"
      />
    </div>
  ) : null;
  const titleClass = 'max-w-3xl font-display text-[2rem] leading-[1.12] font-semibold tracking-[-0.02em] text-ink text-balance break-words hyphens-auto sm:text-[2.75rem] lg:text-[3.25rem]';

  return (
    <section {...m.part('card')} className="hero-warm relative isolate overflow-hidden border-b border-line pt-24 pb-10 sm:pt-28 sm:pb-14 lg:pt-36 lg:pb-16">
      <div className={side ? 'container-x grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]' : 'container-x'}>
        <div className="min-w-0">
          <Reveal y={8}>
            <nav className="mb-4 flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted sm:mb-5">
              <Link to="/" className="rounded hover:text-ink hover:underline">
                {t('nav.home')}
              </Link>
              {crumb && (
                <>
                  <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                  <Link to={crumb.to} className="rounded hover:text-ink hover:underline">
                    {crumb.label}
                  </Link>
                </>
              )}
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              <span className="max-w-[60vw] truncate font-medium text-ink" aria-current="page">
                {title}
              </span>
            </nav>
          </Reveal>
          {m.arrived ? (
            // Arrived through a morph: the title is already moving into place, no second entrance animation.
            <h1 {...m.part('title')} className={titleClass}>
              {title}
            </h1>
          ) : (
            <div {...m.part('title')}>
              <SplitText as="h1" text={title} className={titleClass} />
            </div>
          )}
          {subtitle && (
            <Reveal delay={0.15} y={12}>
              <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-muted sm:mt-5 sm:text-lg">{subtitle}</p>
            </Reveal>
          )}
          {children && (
            <Reveal delay={0.25} y={12}>
              {children}
            </Reveal>
          )}
        </div>
        {side}
      </div>
    </section>
  );
};

/** Same footprint as PageHero, shown while a detail page loads so the layout doesn't jump. */
export const PageHeroSkeleton = () => (
  <section className="hero-warm border-b border-line pt-24 pb-10 sm:pt-28 sm:pb-14 lg:pt-36 lg:pb-16" aria-busy="true">
    <div className="container-x w-full animate-pulse">
      <div className="mb-5 h-3 w-40 rounded bg-line" />
      <div className="h-10 w-3/4 max-w-2xl rounded-lg bg-line sm:h-14" />
      <div className="mt-5 h-4 w-2/3 max-w-xl rounded bg-line" />
    </div>
  </section>
);
