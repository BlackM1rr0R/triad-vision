import type { ReactNode } from 'react';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';

/** Circular percent indicator (SVG). Animates once on mount, never continuously. */
export const ProgressRing = ({
  percent,
  size = 64,
  stroke = 6,
  tone = 'brand',
  className,
  label,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  tone?: 'brand' | 'light' | 'success';
  className?: string;
  label?: string;
  children?: ReactNode;
}) => {
  const reduce = useReducedMotion();
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const track = tone === 'light' ? 'stroke-white/15' : 'stroke-brand-100';
  const bar = tone === 'light' ? 'stroke-white' : tone === 'success' || value === 100 ? 'stroke-success' : 'stroke-brand-600';

  return (
    <span
      className={clsx('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${value}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={track} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={bar}
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - value / 100) : c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: reduce ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center" aria-hidden>
        {children ?? <span className="font-display text-sm font-extrabold">{value}%</span>}
      </span>
    </span>
  );
};

export default ProgressRing;
