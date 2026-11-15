import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform } from 'framer-motion';
import clsx from 'clsx';
import { ArrowRight, FileCheck2, FileSignature, PlaneLanding, Stamp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useMotionOK } from '@/components/motion';
import { useHydrating } from '@/lib/ssr';
import { registerCopy } from '@/i18n';
import { lifeHomeCopy } from '@/i18n/lifeHome';

registerCopy(lifeHomeCopy);

/** The four steps shown: indices into the home process copy (process.steps: documents, contract, visa, arrival). */
const STEPS = [1, 2, 3, 4] as const;
const ICONS = [FileCheck2, FileSignature, Stamp, PlaneLanding];

// Route geometry (viewBox 0 0 320 200): Baku in the east (right), Germany in the west (left), a quadratic arc.
const P0 = { x: 278, y: 146 }; // Baku
const P1 = { x: 168, y: 4 };
const P2 = { x: 44, y: 78 }; // Germany
const PATH = `M ${P0.x} ${P0.y} Q ${P1.x} ${P1.y} ${P2.x} ${P2.y}`;
const at = (t: number) => {
  const u = 1 - t;
  return { x: u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x, y: u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y };
};
const angleAt = (t: number) => {
  const dx = 2 * (1 - t) * (P1.x - P0.x) + 2 * t * (P2.x - P1.x);
  const dy = 2 * (1 - t) * (P1.y - P0.y) + 2 * t * (P2.y - P1.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};
/** Route progress at which step i counts as reached (checkpoints along the arc). */
const STEP_AT = [0.12, 0.38, 0.64, 0.9];

/**
 * Baku → Germany scroll journey (home, below the fold): a plane flies along the route as the section scrolls
 * through the viewport and the four steps light up when it passes their checkpoint. The server markup, the
 * hydrating render and reduced motion show the finished, static state (plane in Germany, every step lit); after
 * hydration the scroll link takes over. Only transforms, stroke and colours change — no layout shift, no image,
 * text only, so it can never be the LCP element.
 */
export const BakuJourney = () => {
  const { t } = useTranslation();
  const steps = t('process.steps', { returnObjects: true }) as { title: string; text: string }[];
  const root = useRef<HTMLElement>(null);
  const hydrating = useHydrating();
  const animate = useMotionOK() && !hydrating;
  const { scrollYProgress } = useScroll({ target: root, offset: ['start 75%', 'end 65%'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 110, damping: 28, restDelta: 0.001 });
  const full = useMotionValue(1);
  const progress = animate ? smooth : full;
  const x = useTransform(progress, (p) => at(Math.min(1, Math.max(0, p))).x);
  const y = useTransform(progress, (p) => at(Math.min(1, Math.max(0, p))).y);
  const rotate = useTransform(progress, (p) => angleAt(Math.min(0.999, Math.max(0, p))));
  // Steps reached so far: re-renders at most four times; a reached step stays lit when scrolling back.
  const [reached, setReached] = useState(0);
  useMotionValueEvent(progress, 'change', (p) => {
    const n = STEP_AT.filter((s) => p >= s).length;
    if (n > reached) setReached(n);
  });
  const lit = (i: number) => !animate || reached > i;

  return (
    <section ref={root} className="section relative overflow-hidden">
      <div className="container-x">
        <SectionHeading eyebrow={t('life.journey.eyebrow')} title={t('life.journey.title')} subtitle={t('life.journey.subtitle')} />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
          <div className="card rounded-3xl p-3 sm:p-5 lg:sticky lg:top-24">
            <svg viewBox="0 0 320 200" className="h-auto w-full" role="img" aria-label={t('life.journey.aria')}>
              <path d={PATH} fill="none" stroke="var(--color-line-strong)" strokeWidth={2} strokeDasharray="4 6" strokeLinecap="round" />
              <motion.path d={PATH} fill="none" stroke="var(--color-highlight)" strokeWidth={3} strokeLinecap="round" style={{ pathLength: progress }} />
              {STEP_AT.map((s, i) => {
                const p = at(s);
                return <circle key={s} cx={p.x} cy={p.y} r={5} className="transition-colors duration-300" fill={lit(i) ? 'var(--color-highlight)' : 'var(--color-card)'} stroke="var(--color-highlight)" strokeWidth={2} />;
              })}
              <circle cx={P0.x} cy={P0.y} r={7} fill="var(--color-primary)" />
              <circle cx={P2.x} cy={P2.y} r={7} fill="var(--color-primary)" />
              <text x={P0.x} y={P0.y + 24} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
                {t('life.journey.baku')}
              </text>
              <text x={P2.x} y={P2.y + 24} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
                {t('life.journey.germany')}
              </text>
              <motion.g style={{ x, y, rotate }}>
                {/* plane pointing right (+x) at the origin; rotated along the route */}
                <path d="M 12 0 L -6 -9 L -3 0 L -6 9 Z M -2 -1.5 L -12 -5 L -12 5 L -2 1.5 Z" fill="var(--color-primary)" stroke="var(--color-card)" strokeWidth={1.2} strokeLinejoin="round" />
              </motion.g>
            </svg>
          </div>
          <ol className="space-y-3">
            {STEPS.map((si, i) => {
              const s = steps[si];
              if (!s) return null;
              const Icon = ICONS[i];
              return (
                <li key={si} className={clsx('card flex gap-4 rounded-2xl p-4 transition-[border-color,box-shadow] duration-300 sm:p-5', lit(i) ? 'border-highlight/60' : '')}>
                  <span
                    className={clsx(
                      'relative grid size-12 shrink-0 place-items-center rounded-2xl border transition-colors duration-300',
                      lit(i) ? 'border-transparent bg-highlight text-highlight-contrast' : 'border-line bg-sunken text-ink',
                    )}
                  >
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold tracking-wide text-muted uppercase">{i + 1} / 4</span>
                    <span className="block font-display text-base font-semibold text-ink">{s.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted">{s.text}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="mt-6 text-center">
          <Link to="/life-in-germany" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-link hover:underline">
            {t('life.journey.cta')} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
};
