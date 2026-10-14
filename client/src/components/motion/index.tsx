import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';
import clsx from 'clsx';

/** True on devices with a precise hover pointer (mouse/trackpad). Touch screens never see tilt effects. */
const finePointer = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades/slides children in when they scroll into view. */
export const Reveal = ({
  children,
  delay = 0,
  y = 40,
  x = 0,
  className,
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  x?: number;
  className?: string;
  once?: boolean;
}) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y, x }}
    whileInView={{ opacity: 1, y: 0, x: 0 }}
    viewport={{ once, margin: '-80px' }}
    transition={{ duration: 0.9, delay, ease: EASE }}
  >
    {children}
  </motion.div>
);

const staggerParent: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };
// opacity + translate only: both are composited, so a grid of cards fading in never re-rasterises
// (the previous scale step forced every card with images to repaint on each frame).
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

export const Stagger = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div
    className={className}
    variants={staggerParent}
    initial="hidden"
    whileInView="show"
    viewport={{ once: true, margin: '-60px' }}
  >
    {children}
  </motion.div>
);

export const StaggerItem = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div className={className} variants={staggerChild}>
    {children}
  </motion.div>
);

/**
 * Heading that slides up from a mask when it scrolls into view. Animates the heading as one element
 * (it used to animate every word separately, which meant ~120 animated nodes on the home page).
 */
export const SplitText = ({
  text,
  className,
  delay = 0,
  as: Tag = 'h2',
}: {
  text: string;
  className?: string;
  delay?: number;
  as?: 'h1' | 'h2' | 'h3' | 'span';
}) => {
  const MotionTag = motion[Tag];
  return (
    <span className="block overflow-hidden pb-[0.12em]">
      <MotionTag
        className={className}
        initial={{ y: '60%', opacity: 0 }}
        whileInView={{ y: '0%', opacity: 1 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.8, delay, ease: EASE }}
      >
        {text}
      </MotionTag>
    </span>
  );
};

/** Number that counts up once it scrolls into view. Writes to the DOM directly instead of re-rendering per frame. */
export const Counter = ({ to, prefix = '', suffix = '', className }: { to: number; prefix?: string; suffix?: string; className?: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration: 2.2,
      ease: EASE,
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = `${prefix}${Math.round(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, to, prefix, suffix]);
  return (
    <span ref={ref} className={className}>
      {prefix}0{suffix}
    </span>
  );
};

/** Card that tilts in 3D towards the cursor, with a moving glare. Plain wrapper on touch devices. */
export const TiltCard = ({ children, className, max = 10 }: { children: ReactNode; className?: string; max?: number }) => {
  const reduce = useReducedMotion();
  if (reduce || !finePointer) return <div className={className}>{children}</div>;
  return (
    <TiltCardInner className={className} max={max}>
      {children}
    </TiltCardInner>
  );
};

const TiltCardInner = ({ children, className, max }: { children: ReactNode; className?: string; max: number }) => {
  const [hovered, setHovered] = useState(false);
  // "active" keeps the 3D transform mounted until the springs have settled after the pointer left.
  const [active, setActive] = useState(false);
  const settle = useRef<number | undefined>(undefined);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [max, -max]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [0, 1], [-max, max]), { stiffness: 200, damping: 20 });
  const glareX = useTransform(mx, [0, 1], ['0%', '100%']);
  const glareY = useTransform(my, [0, 1], ['0%', '100%']);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.35), transparent 55%)`;
  useEffect(() => () => window.clearTimeout(settle.current), []);

  return (
    <motion.div
      // The perspective/3D transform exists only while the card is being tilted. Applied permanently
      // it turned every card into its own compositor layer (dozens of large layers with images), which
      // made scrolling stutter on integrated GPUs.
      className={clsx('relative', active && '[transform-style:preserve-3d]', className)}
      style={active ? { rotateX: rx, rotateY: ry, transformPerspective: 900 } : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        window.clearTimeout(settle.current);
        setActive(true);
        setHovered(true);
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width);
        my.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        setHovered(false);
        mx.set(0.5);
        my.set(0.5);
        settle.current = window.setTimeout(() => setActive(false), 400);
      }}
    >
      {children}
      {/* blend layers are costly to composite, so the glare only exists while the pointer is over the card */}
      {hovered && <motion.div className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-overlay" style={{ background: glare }} />}
    </motion.div>
  );
};

/** Wrapper that pulls its child slightly towards the cursor. */
export const Magnetic = ({ children, strength = 0.35, className }: { children: ReactNode; strength?: number; className?: string }) => {
  if (!finePointer) return <div className={clsx('inline-block', className)}>{children}</div>;
  return (
    <MagneticInner strength={strength} className={className}>
      {children}
    </MagneticInner>
  );
};

const MagneticInner = ({ children, strength, className }: { children: ReactNode; strength: number; className?: string }) => {
  const x = useSpring(0, { stiffness: 250, damping: 15 });
  const y = useSpring(0, { stiffness: 250, damping: 15 });
  return (
    <motion.div
      className={clsx('inline-block', className)}
      style={{ x, y }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
};

/** Infinite horizontal marquee. Children are rendered twice for a seamless loop. */
export const Marquee = ({ children, reverse = false, className }: { children: ReactNode; reverse?: boolean; className?: string }) => (
  <div className={clsx('group relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]', className)}>
    <div
      className={clsx('flex w-max shrink-0 animate-marquee gap-4 py-2 pr-4 group-hover:[animation-play-state:paused]', reverse && '[animation-direction:reverse]')}
    >
      {children}
      {children}
    </div>
  </div>
);
