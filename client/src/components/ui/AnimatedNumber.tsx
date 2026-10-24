import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motionAllowed } from '@/lib/viewTransition';

/**
 * A number that counts up when it first scrolls into view, and glides from the old to the new value when it
 * changes (KPI tiles, dashboard numbers, public stats). Writes the text straight to the DOM per frame
 * (no React re-render per frame). Screen readers only get the final value; reduced-motion users see the
 * final value at once.
 *
 *   <AnimatedNumber value={42} />
 *   <AnimatedNumber value={1250} prefix="€ " />
 *   <AnimatedNumber value={0.37} format={(n) => `${Math.round(n * 100)} %`} />
 */
export const AnimatedNumber = ({
  value,
  prefix = '',
  suffix = '',
  format,
  duration = 700,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  /** Custom formatting of the (intermediate) value; default: locale grouping, decimals of `value`. */
  format?: (n: number) => string;
  /** Milliseconds (default 700; the public stats use a slower count). */
  duration?: number;
  className?: string;
}) => {
  const { i18n } = useTranslation();
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const decimals = Number.isInteger(value) ? 0 : Math.min(2, (String(value).split('.')[1] ?? '').length);
  const fmt = (n: number) => {
    if (format) return format(n);
    try {
      return `${prefix}${new Intl.NumberFormat(i18n.resolvedLanguage ?? 'az', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)}${suffix}`;
    } catch {
      return `${prefix}${n.toFixed(decimals)}${suffix}`;
    }
  };
  const fmtRef = useRef(fmt);
  fmtRef.current = fmt;

  useEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(value)) return;
    const write = (n: number) => {
      el.textContent = fmtRef.current(n);
    };
    if (!motionAllowed()) {
      shown.current = value;
      write(value);
      return;
    }
    let raf = 0;
    const run = () => {
      const from = shown.current ?? 0;
      if (from === value) return write(value);
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const n = from + (value - from) * eased;
        shown.current = t < 1 ? n : value;
        write(t < 1 ? (decimals ? n : Math.round(n)) : value);
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    // First appearance: wait until visible. Later value changes animate at once.
    if (shown.current === null && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            run();
          }
        },
        { rootMargin: '0px 0px -40px 0px' },
      );
      io.observe(el);
      return () => {
        io.disconnect();
        cancelAnimationFrame(raf);
      };
    }
    run();
    return () => cancelAnimationFrame(raf);
  }, [value, duration, decimals]);

  // The visible text is owned by the DOM writes above (React never renders it, so a re-render — e.g. a
  // language switch — cannot reset a running count). Before the first count it shows zero when motion is on,
  // otherwise the final value.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const n = shown.current ?? (motionAllowed() ? 0 : value);
    el.textContent = fmt(decimals ? n : Math.round(n));
  });

  return (
    <span className={className}>
      <span ref={ref} aria-hidden className="tabular-nums" />
      <span className="sr-only">{fmt(value)}</span>
    </span>
  );
};
