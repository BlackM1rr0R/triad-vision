import { useEffect, useState } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';

const R = 52;
const C = 2 * Math.PI * R;

/** Animated circular gauge 0–100 %. Colour shifts from amber to brand blue to green. */
export const ReadinessGauge = ({ value, size = 168, label }: { value: number; size?: number; label?: string }) => {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const v = Math.max(0, Math.min(100, value));
  const color = v < 40 ? 'var(--color-warning)' : v < 70 ? 'var(--color-brand-600)' : 'var(--color-success)';

  useEffect(() => {
    if (reduce) {
      setShown(v);
      return;
    }
    const c = animate(0, v, { duration: 1.6, ease: [0.22, 1, 0.36, 1], onUpdate: (n) => setShown(Math.round(n)) });
    return () => c.stop();
  }, [v, reduce]);

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-line)" strokeWidth="10" />
        <motion.circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - v / 100) }}
          transition={{ duration: reduce ? 0 : 1.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-4xl font-black text-navy-900">
          {shown}
          <span className="text-xl font-bold text-muted">%</span>
        </span>
      </div>
    </div>
  );
};
