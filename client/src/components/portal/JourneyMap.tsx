import { useMemo } from 'react';
import clsx from 'clsx';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { cityCoords, makeProjection, type LngLat } from '@/components/about/geo';
import { GERMAN_STATES } from '@/components/growth/germanyStates';
import { COUNTRY_SHAPES, DE_CENTRE, ORIGIN_MAP_BOUNDS, arc, inRing, pointsAlongArc } from '@/components/growth/originMapShapes';
import { motionAllowed } from '@/lib/viewTransition';
import { MILESTONE_POSITIONS, routeProgress, type JourneyData, type Milestone } from './journey';

const W = 800;
const EASE = [0.22, 1, 0.36, 1] as const;

/** Map window around origin and destination, kept between a wide and a squarish shape. */
const boundsFor = (a: LngLat, b: LngLat) => {
  let w = Math.min(a[0], b[0]) - 4;
  let e = Math.max(a[0], b[0]) + 4;
  let s = Math.min(a[1], b[1]) - 3.5;
  let n = Math.max(a[1], b[1]) + 4.5;
  const k = Math.cos((((n + s) / 2) * Math.PI) / 180);
  const spanX = (e - w) * k;
  const spanY = n - s;
  if (spanY / spanX < 0.48) {
    const extra = 0.48 * spanX - spanY;
    n += extra / 2;
    s -= extra / 2;
  } else if (spanY / spanX > 0.72) {
    const extra = (spanY / 0.72 - spanX) / k;
    w -= extra / 2;
    e += extra / 2;
  }
  return { w, e, s, n };
};

const label = 'fill-ink stroke-card text-[22px] font-semibold [paint-order:stroke]';

/**
 * Decorative-but-labelled SVG map of the client's journey: simplified country outlines (shared with the public
 * origin map), a curved route from the home city to the German city, the part already travelled drawn in the
 * brand colour, and the six milestones as markers. The route draws itself once when it scrolls into view;
 * with reduced motion (OS setting or "Stop animations") it is shown fully drawn at once.
 * The ordered list next to it (JourneyTimeline) carries the same information for screen readers.
 */
export function JourneyMap({
  journey,
  milestones,
  labelOf,
  fromName,
  toName,
  summary,
  className,
}: {
  journey: JourneyData;
  milestones: Milestone[];
  labelOf: (m: Milestone) => string;
  fromName: string;
  toName: string;
  /** Accessible description of the map (route + current stage). */
  summary: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const animated = !reduce && motionAllowed();

  const geo = useMemo(() => {
    const o = journey.origin;
    const known = o.lat != null && o.lng != null;
    // Unknown home country: the route comes in from the east edge of the usual map.
    const from: LngLat = known ? [o.lng!, o.lat!] : [ORIGIN_MAP_BOUNDS.e - 4, 44.5];
    const to: LngLat = cityCoords(journey.destination.city) ?? DE_CENTRE;
    const proj = makeProjection(boundsFor(from, to), W, 0);
    const a = proj.project(from);
    const b = proj.project(to);
    const markers = pointsAlongArc(a, b, [...MILESTONE_POSITIONS]);
    const destState = journey.destination.city ? GERMAN_STATES.find((st) => st.rings.some((r) => inRing(to, r)))?.code ?? null : null;
    return { proj, a, b, d: arc(a, b), markers, destState, known };
  }, [journey.origin, journey.destination.city]);

  const progress = routeProgress(milestones);
  const current = milestones.findIndex((m) => m.status === 'current');
  const head = progress > 0 ? pointsAlongArc(geo.a, geo.b, [progress])[0] : null;
  const { proj } = geo;
  const H = Math.round(proj.height);

  const route: Variants = { hidden: { pathLength: 0 }, show: { pathLength: progress, transition: { duration: animated ? 1.4 : 0, ease: EASE, delay: 0.15 } } };
  const fade = (i: number): Variants => ({ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: animated ? 0.3 : 0, delay: animated ? 0.2 + i * 0.12 : 0 } } });
  const play = animated ? { initial: 'hidden', whileInView: 'show', viewport: { once: true, amount: 0.35 } } : { initial: 'show', animate: 'show' };

  return (
    <motion.svg viewBox={`0 0 ${W} ${H}`} className={clsx('h-auto w-full overflow-hidden rounded-xl bg-surface', className)} role="img" aria-label={summary} {...play}>
      {/* Countries: origin countries in the background, Germany by state with the destination state tinted. */}
      {COUNTRY_SHAPES.filter((c) => c.code !== 'DE').map((c) =>
        c.rings.map((ring, i) => (
          <path
            key={`${c.code}-${i}`}
            d={proj.path(ring)}
            className={clsx('stroke-brand-500/30', c.code === journey.origin.country ? 'fill-brand-50' : 'fill-card')}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        )),
      )}
      {GERMAN_STATES.map((st) =>
        st.rings.map((ring, i) => (
          <path key={`${st.code}-${i}`} d={proj.path(ring)} className={clsx('stroke-brand-500/35', st.code === geo.destState ? 'fill-brand-100' : 'fill-brand-50')} strokeWidth={1} strokeLinejoin="round" />
        )),
      )}

      {/* The whole route (dashed) and the part already travelled (solid, draws itself). */}
      <path d={geo.d} fill="none" className="stroke-muted/40" strokeWidth={3} strokeDasharray="2 9" strokeLinecap="round" />
      {progress > 0 && <motion.path d={geo.d} fill="none" className="stroke-brand-600" strokeWidth={4.5} strokeLinecap="round" variants={route} />}

      {/* Home city and German city. */}
      <motion.g variants={fade(0)}>
        <circle cx={geo.a[0]} cy={geo.a[1]} r={9} className={clsx('stroke-card', geo.known ? 'fill-warning' : 'fill-muted')} strokeWidth={3} />
        <text x={geo.a[0]} y={geo.a[1] + 36} textAnchor="middle" className={label} strokeWidth={6} strokeLinejoin="round">
          {fromName}
        </text>
      </motion.g>
      <motion.g variants={fade(milestones.length + 1)}>
        <path
          d={`M${geo.b[0]} ${geo.b[1]} l-11 -18 a13 13 0 1 1 22 0 z`}
          className={clsx('stroke-card', milestones.at(-1)?.status === 'done' ? 'fill-success' : 'fill-brand-700')}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <circle cx={geo.b[0]} cy={geo.b[1] - 25} r={4.5} className="fill-card" />
        <text x={geo.b[0]} y={geo.b[1] + 30} textAnchor="middle" className={label} strokeWidth={6} strokeLinejoin="round">
          {toName}
        </text>
      </motion.g>

      {/* Milestones along the route. */}
      {milestones.map((m, i) => {
        const [x, y] = geo.markers[i];
        const tone = m.negative
          ? 'fill-danger stroke-card'
          : m.status === 'done'
            ? 'fill-brand-600 stroke-card'
            : m.status === 'current'
              ? 'fill-card stroke-brand-600'
              : m.status === 'skipped'
                ? 'fill-surface stroke-line'
                : 'fill-card stroke-muted/50';
        return (
          <motion.g key={m.key} variants={fade(i + 1)}>
            <title>{labelOf(m)}</title>
            {m.status === 'current' && animated && (
              <circle cx={x} cy={y} r={10} className="animate-pulse-ring fill-brand-500/30" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
            )}
            <circle cx={x} cy={y} r={m.status === 'current' ? 11 : 8.5} className={tone} strokeWidth={m.status === 'current' ? 4 : 2.5} />
          </motion.g>
        );
      })}

      {/* Name of the current stage next to its marker. */}
      {current >= 0 && (
        <motion.text
          x={geo.markers[current][0]}
          y={geo.markers[current][1] - 22}
          textAnchor="middle"
          className={clsx(label, 'fill-brand-700')}
          strokeWidth={6}
          strokeLinejoin="round"
          variants={fade(milestones.length + 2)}
        >
          {labelOf(milestones[current])}
        </motion.text>
      )}
      {head && current < 0 && progress < 1 && <circle cx={head[0]} cy={head[1]} r={5} className="fill-brand-600" />}
    </motion.svg>
  );
}
