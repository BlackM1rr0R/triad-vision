import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';

/*
 * Small motion primitives for the signed-in areas (staff, workspace, client portal). Separate from
 * components/motion/index.tsx (public-site entrances) so these pages do not pull the public effects and the
 * other way round. Rules (docs/SEO.md, Root.tsx): never on the first paint of a public SSR page; opacity /
 * transform only (no layout shift); reduced motion and "Stop animations" switch them off — framer-motion
 * through <MotionConfig> in Root.tsx, the CSS classes through index.css "Micro-animations of the app".
 *
 *   <SuccessCheck />                                       // tick drawn once (e.g. after a save)
 *   const saved = useFlash(m.isSuccess && m.submittedAt);  // true for 1.6 s after each success
 *   <Button success={saved} loading={m.isPending}>Save</Button>
 *   <LoadSwap loading={q.isLoading} skeleton={<SkeletonList />}>{…content…}</LoadSwap>
 *   <PresenceList as="ul">{items.map((i) => <PresenceItem key={i.id} as="li">…</PresenceItem>)}</PresenceList>
 */

/** Round success tick (drawn once). */
export { SuccessCheck } from '../ui/SuccessCheck';

/**
 * True for `ms` after `trigger` changes to a new truthy value (a mutation's success, a save counter): drives
 * the "saved" tick on a button without extra state in the page.
 */
export const useFlash = (trigger: unknown, ms = 1600) => {
  const [on, setOn] = useState(false);
  // The value on mount never flashes (a success from before the component was shown).
  const prev = useRef(trigger);
  useEffect(() => {
    if (trigger && !Object.is(trigger, prev.current)) setOn(true);
    prev.current = trigger;
  }, [trigger]);
  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => setOn(false), ms);
    return () => window.clearTimeout(t);
  }, [on, ms]);
  return on;
};

/**
 * Skeleton → content crossfade. The content fades in (opacity only) only when the skeleton was actually on
 * screen; data that is already cached appears at once. Give the skeleton the content's size (SkeletonCard
 * etc.) so nothing shifts.
 */
export const LoadSwap = ({ loading, skeleton, children, className }: { loading: boolean; skeleton: ReactNode; children: ReactNode; className?: string }) => {
  const [wasLoading, setWasLoading] = useState(loading);
  if (loading && !wasLoading) setWasLoading(true);
  if (loading) return <>{skeleton}</>;
  return wasLoading ? <div className={clsx('tv-fade-in', className)}>{children}</div> : className ? <div className={className}>{children}</div> : <>{children}</>;
};

const EASE = [0.22, 1, 0.36, 1] as const;
type Tag = 'div' | 'ul' | 'ol' | 'li' | 'tbody' | 'tr' | 'section';

/**
 * List whose items fade / slide in when added and fade out when removed (AnimatePresence). The items present
 * on the first render do not animate. `layout` lets the remaining items glide into the freed space.
 */
export const PresenceList = ({ as = 'div', children, className, ...rest }: { as?: Tag; children: ReactNode; className?: string } & Record<`aria-${string}` | `data-${string}`, unknown>) => {
  const C = as;
  return (
    <C className={className} {...(rest as object)}>
      <AnimatePresence initial={false} mode="popLayout">
        {children}
      </AnimatePresence>
    </C>
  );
};

type ItemProps = { as?: Tag; children: ReactNode; className?: string; layout?: boolean } & Record<`aria-${string}` | `data-${string}`, unknown>;

/** One item of a PresenceList (needs a stable `key`). */
export const PresenceItem = forwardRef<HTMLElement, ItemProps>(function PresenceItem({ as = 'div', children, className, layout = true, ...rest }, ref) {
  const M = motion[as] as typeof motion.div;
  return (
    <M
      ref={ref as never}
      layout={layout ? 'position' : undefined}
      className={className}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } }}
      exit={{ opacity: 0, transition: { duration: 0.16, ease: 'easeIn' } }}
      {...(rest as object)}
    >
      {children}
    </M>
  );
});
