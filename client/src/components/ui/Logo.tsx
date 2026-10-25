import clsx from 'clsx';
import { Link } from 'react-router-dom';

export const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 64 56" className={className} aria-hidden>
    <defs>
      <linearGradient id="tv-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5c9bff" />
        <stop offset="1" stopColor="#1565e8" />
      </linearGradient>
    </defs>
    <path d="M32 2 62 54H44L32 32 20 54H2Z" fill="url(#tv-g)" />
    <path d="M32 32 44 54H20Z" fill="currentColor" />
    <path d="M14 46h36" stroke="#fff" strokeWidth="3" opacity=".55" />
  </svg>
);

/** `shrink`: may give up width in a crowded bar (the word mark truncates instead of pushing the controls off-screen). */
export const Logo = ({ light = false, shrink = false, className }: { light?: boolean; shrink?: boolean; className?: string }) => (
  <Link to="/" className={clsx('group flex min-h-11 items-center gap-2 sm:gap-3', shrink ? 'min-w-0' : 'shrink-0', className)} aria-label="Triad Vision">
    <LogoMark
      className={clsx(
        'h-8 w-9 shrink-0 transition-transform duration-500 group-hover:scale-105 group-hover:rotate-[8deg] sm:h-10 sm:w-11',
        light ? 'text-white' : 'text-ink',
      )}
    />
    <span className={clsx('leading-none whitespace-nowrap', shrink && 'min-w-0 overflow-hidden')}>
      <span className={clsx('block font-display text-[0.98rem] font-extrabold tracking-[0.08em] min-[400px]:text-[1.05rem] min-[400px]:tracking-[0.1em] sm:text-[1.3rem] sm:tracking-[0.12em]', light ? 'text-white' : 'text-ink')}>
        TRIAD VISION
      </span>
      <span className={clsx('mt-1 hidden text-[0.52rem] font-semibold tracking-[0.3em] sm:block', light ? 'text-white/60' : 'text-muted')}>
        PEOPLE · WORK · OPPORTUNITIES
      </span>
    </span>
  </Link>
);
