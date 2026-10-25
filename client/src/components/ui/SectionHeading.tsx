import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Reveal, SplitText } from '../motion';

export const SectionHeading = ({
  eyebrow,
  title,
  subtitle,
  action,
  center = false,
  light = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  center?: boolean;
  light?: boolean;
}) => (
  <div className={clsx('section-head flex flex-col gap-5', center ? 'items-center text-center' : 'md:flex-row md:items-end md:justify-between md:gap-10')}>
    <div className={clsx('min-w-0 max-w-3xl', center && 'mx-auto')}>
      {eyebrow && (
        <Reveal y={16}>
          <span className="eyebrow mb-3">
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <path d="M2 1v10M2 1h8l-2 3 2 3H2" fill="currentColor" />
            </svg>
            {eyebrow}
          </span>
        </Reveal>
      )}
      <SplitText text={title} className={clsx('h-section text-balance', light ? 'text-white' : 'text-ink')} />
      {subtitle && (
        <Reveal delay={0.15} y={20}>
          <p className={clsx('mt-3 text-[0.95rem] leading-relaxed sm:mt-4 sm:text-lg', light ? 'text-white/70' : 'text-muted')}>{subtitle}</p>
        </Reveal>
      )}
    </div>
    {action && (
      <Reveal delay={0.2} className="shrink-0">
        {action}
      </Reveal>
    )}
  </div>
);
