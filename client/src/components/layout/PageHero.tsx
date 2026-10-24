import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Reveal, SplitText, useMotionOK } from '../motion';
import { sized, srcSet } from '@/lib/img';
import { useMorphTarget } from '@/lib/viewTransition';

/** Dark parallax banner used at the top of every inner page. */
export const PageHero = ({
  title,
  subtitle,
  image,
  crumb,
  children,
  morph,
}: {
  title: string;
  subtitle?: string;
  image: string;
  crumb?: { to: string; label: string };
  children?: ReactNode;
  /** Shared-element target of a list card (lib/viewTransition.ts): the card morphs into this hero. */
  morph?: { kind: string; id: string };
}) => {
  const { t } = useTranslation();
  const m = useMorphTarget(morph?.kind ?? '', morph?.id);
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const scale = useTransform(scrollYProgress, [0, 1], [1.05, 1.2]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const parallax = useMotionOK();

  return (
    <section ref={ref} {...m.part('card')} className="relative isolate flex min-h-[380px] items-end overflow-hidden bg-navy-950 pt-28 pb-12 text-white sm:min-h-[460px] sm:pt-36 sm:pb-16 lg:min-h-[540px] lg:pt-44">
      <motion.img src={sized(image, 1600)} srcSet={srcSet(image, [800, 1280, 1600, 2000])} sizes="100vw" alt="" fetchPriority="high" decoding="async" style={parallax ? { y, scale } : { scale: 1.05 }} className="absolute inset-0 -z-10 size-full object-cover opacity-45 will-change-transform" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-navy-950 via-navy-950/70 to-navy-900/40" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_20%,rgba(47,123,255,0.35),transparent_50%)]" />
      <motion.div style={parallax ? { opacity } : undefined} className="container-x">
        <Reveal y={10}>
          <nav className="mb-4 flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium text-white/60 sm:mb-5">
            <Link to="/" className="hover:text-white">
              {t('nav.home')}
            </Link>
            {crumb && (
              <>
                <ChevronRight className="size-3.5" />
                <Link to={crumb.to} className="hover:text-white">
                  {crumb.label}
                </Link>
              </>
            )}
            <ChevronRight className="size-3.5" />
            <span className="max-w-[60vw] truncate text-white">{title}</span>
          </nav>
        </Reveal>
        {m.arrived ? (
          // Arrived through a morph: the title is already moving into place, no second entrance animation.
          <h1 {...m.part('title')} className="max-w-4xl pb-[0.12em] text-[2rem] leading-[1.1] font-extrabold text-balance break-words hyphens-auto sm:text-5xl lg:text-6xl">
            {title}
          </h1>
        ) : (
          <div {...m.part('title')}>
            <SplitText as="h1" text={title} className="max-w-4xl text-[2rem] leading-[1.1] font-extrabold text-balance break-words hyphens-auto sm:text-5xl lg:text-6xl" />
          </div>
        )}
        {subtitle && (
          <Reveal delay={0.25}>
            <p className="mt-4 max-w-2xl text-base text-white/75 sm:mt-5 sm:text-lg">{subtitle}</p>
          </Reveal>
        )}
        {children && <Reveal delay={0.35}>{children}</Reveal>}
      </motion.div>
    </section>
  );
};

/** Same footprint as PageHero, shown while a detail page loads so the layout doesn't jump. */
export const PageHeroSkeleton = () => (
  <section className="relative flex min-h-[380px] items-end bg-navy-950 pt-28 pb-12 sm:min-h-[460px] sm:pt-36 sm:pb-16 lg:min-h-[540px] lg:pt-44" aria-busy="true">
    <div className="container-x w-full animate-pulse">
      <div className="mb-5 h-3 w-40 rounded bg-white/10" />
      <div className="h-10 w-3/4 max-w-2xl rounded-lg bg-white/15 sm:h-14" />
      <div className="mt-5 h-4 w-2/3 max-w-xl rounded bg-white/10" />
    </div>
  </section>
);
