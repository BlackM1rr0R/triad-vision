import clsx from 'clsx';

export type FlagCode = 'az' | 'de' | 'en' | 'ru';

/**
 * SVG flags. Emoji flags are not rendered on Windows (they show as letters), so never use them in the UI.
 * Aspect ratio 3:2; size with a width class (e.g. "w-5").
 */
export const Flag = ({ code, className, rounded = true }: { code: FlagCode; className?: string; rounded?: boolean }) => {
  const cls = clsx('inline-block aspect-[3/2] shrink-0 overflow-hidden shadow-[0_0_0_1px_rgba(0,0,0,0.08)]', rounded && 'rounded-[3px]', className ?? 'w-5');
  switch (code) {
    case 'az':
      return (
        <svg viewBox="0 0 60 40" className={cls} aria-label="AZ" role="img">
          <rect width="60" height="13.34" fill="#00b5e2" />
          <rect y="13.33" width="60" height="13.34" fill="#ef3340" />
          <rect y="26.66" width="60" height="13.34" fill="#509e2f" />
          <circle cx="28" cy="20" r="4.6" fill="#fff" />
          <circle cx="29.3" cy="20" r="3.8" fill="#ef3340" />
          <path d="m34.2 20 .95-1.6-1.8.4-.2-1.85-1.1 1.5-1.4-1.2.5 1.8-1.85.1 1.6.95-1.15 1.45 1.8-.35.05 1.85 1.15-1.5 1.35 1.25-.45-1.8 1.85-.05-1.6-.95z" fill="#fff" />
        </svg>
      );
    case 'de':
      return (
        <svg viewBox="0 0 60 40" className={cls} aria-label="DE" role="img">
          <rect width="60" height="13.34" fill="#000" />
          <rect y="13.33" width="60" height="13.34" fill="#dd0000" />
          <rect y="26.66" width="60" height="13.34" fill="#ffce00" />
        </svg>
      );
    case 'ru':
      return (
        <svg viewBox="0 0 60 40" className={cls} aria-label="RU" role="img">
          <rect width="60" height="13.34" fill="#fff" />
          <rect y="13.33" width="60" height="13.34" fill="#0039a6" />
          <rect y="26.66" width="60" height="13.34" fill="#d52b1e" />
        </svg>
      );
    case 'en':
      return (
        <svg viewBox="0 0 60 40" className={cls} aria-label="EN" role="img">
          <clipPath id="uk-c">
            <rect width="60" height="40" />
          </clipPath>
          <g clipPath="url(#uk-c)">
            <rect width="60" height="40" fill="#012169" />
            <path d="M0 0l60 40M60 0 0 40" stroke="#fff" strokeWidth="8" />
            <path d="M0 0l60 40M60 0 0 40" stroke="#c8102e" strokeWidth="3" />
            <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="12" />
            <path d="M30 0v40M0 20h60" stroke="#c8102e" strokeWidth="7" />
          </g>
        </svg>
      );
  }
};

/** Azerbaijan → Germany route badge used in hero/auth sections. */
export const RouteFlags = ({ className, size = 'sm' }: { className?: string; size?: 'sm' | 'lg' }) => (
  <span className={clsx('inline-flex items-center', size === 'lg' ? 'gap-3' : 'gap-1.5', className)}>
    <Flag code="az" className={size === 'lg' ? 'w-12' : 'w-5'} />
    <svg viewBox="0 0 24 24" className={clsx('text-de-gold', size === 'lg' ? 'size-6' : 'size-3.5')} fill="currentColor" aria-hidden>
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" transform="rotate(90 12 12)" />
    </svg>
    <Flag code="de" className={size === 'lg' ? 'w-12' : 'w-5'} />
  </span>
);
