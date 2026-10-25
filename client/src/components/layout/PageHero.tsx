import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Reveal, Rise } from '../motion';
import { sized, srcSet } from '@/lib/img';
import { useMorphTarget } from '@/lib/viewTransition';

/**
 * Warm header band at the top of every inner page (Direction B): sand background, breadcrumb, a serif h1,
 * a readable subtitle and, from lg up, the page photo in a rounded frame (or an illustration instead).
 * Children (search forms, chips, buttons) sit on the light band: style them with the tokens (text-ink,
 * bg-card, border-line, Button variants), never with text-white.
 */
/** Breadcrumb links: a 44 px tall hit area on phones without making the line taller. */
const CRUMB = 'rounded hover:text-ink hover:underline max-sm:-my-3 max-sm:py-3';

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
      {/* The photo is only shown from lg up. A hidden <img> is still downloaded (at high priority, competing
          with the page's own files on phones), so smaller screens get an empty inline pixel instead. */}
      <picture>
        <source media="(min-width: 1024px)" srcSet={srcSet(image, [480, 800, 1200]) ?? sized(image, 800)} sizes="(min-width: 1280px) 26rem, 22rem" />
        <img
          src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
          alt=""
          fetchPriority="high"
          decoding="async"
          className="aspect-[4/3] w-full rounded-3xl border border-line object-cover shadow-[var(--tv-shadow-card)]"
        />
      </picture>
    </div>
  ) : null;
  const titleClass = 'type-hero max-w-3xl text-ink';

  return (
    <section {...m.part('card')} className="hero-warm relative isolate overflow-hidden border-b border-line pt-24 pb-10 sm:pt-28 sm:pb-14 lg:pt-36 lg:pb-16">
      <div className={side ? 'container-x grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]' : 'container-x'}>
        <div className="min-w-0">
          <Reveal y={8}>
            <nav className="mb-4 flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted sm:mb-5">
              <Link to="/" className={CRUMB}>
                {t('nav.home')}
              </Link>
              {crumb && (
                <>
                  <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                  <Link to={crumb.to} className={CRUMB}>
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
            // Title and subtitle are the LCP element: visible from the first frame, they only slide in (Rise).
            <div {...m.part('title')}>
              <Rise y={14} className="pb-[0.12em]">
                <h1 className={titleClass}>{title}</h1>
              </Rise>
            </div>
          )}
          {subtitle && (
            <Rise delay={0.1} y={12}>
              <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-muted sm:mt-5 sm:text-lg">{subtitle}</p>
            </Rise>
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
