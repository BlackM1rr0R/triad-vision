/*
 * framer-motion feature bundles. The app renders `m` components (framer-motion's slim motion component, imported
 * as `m as motion`) inside <LazyMotion features={loadDomAnimation}> (Root.tsx): animate / exit / variants /
 * hover / tap / focus / in-view, loaded as their own chunk next to the entry instead of the full `motion` bundle
 * inside it (an `m` element renders its initial styles at once and animates as soon as the features are in).
 * Layout animations and drag (domMax) load on demand where a component needs them
 * (<LazyMotion features={loadDomMax}>, e.g. the FAQ list) — loaded features apply to every `m` element.
 */
export const loadDomAnimation = () => import('./motionDomAnimation').then((mod) => mod.default);
export const loadDomMax = () => import('./motionDomMax').then((mod) => mod.default);
