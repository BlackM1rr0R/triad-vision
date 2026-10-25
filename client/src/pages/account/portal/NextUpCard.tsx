import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMotionValueEvent, useScroll } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, CheckCircle2, Hourglass, Landmark } from 'lucide-react';
import { buttonClass } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { registerCopy } from '@/i18n';
import { pagesPortalUx } from '@/i18n/pagesPortalUx';
import type { useNextUp } from './useNextUp';

registerCopy(pagesPortalUx);

type NextUp = ReturnType<typeof useNextUp>;

/**
 * "What do I need to do now?": one answer and one button. `hero` on the portal home, `compact` as the
 * sticky bar on the case page.
 */
export function NextUpCard({ next, variant = 'hero', caseLink, tour }: { next: NextUp; variant?: 'hero' | 'compact'; caseLink?: string; tour?: string }) {
  const { t } = useTranslation();
  const { hero, items, loading } = next;
  const compact = variant === 'compact';

  if (loading && !hero) {
    return (
      <section className={clsx('card flex items-center gap-4', compact ? 'p-3' : 'p-5 sm:p-6')} aria-busy="true" data-tour={tour}>
        <Skeleton className={compact ? 'size-9' : 'size-12'} rounded="xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </section>
    );
  }
  if (!hero) return null;

  const client = hero.kind === 'client';
  const Icon = client ? hero.icon : hero.side === 'EMBASSY' ? Landmark : hero.side === 'NONE' ? CheckCircle2 : Hourglass;
  const lead = client ? t('pux.next.client') : hero.side === 'EMBASSY' ? t('pux.next.embassy') : hero.side === 'NONE' ? t('pux.next.closed') : t('pux.next.team');
  const more = client ? items.length : 0;

  return (
    <section
      className={clsx(
        'relative overflow-hidden',
        compact ? 'card' : 'rounded-3xl border',
        !compact && (client ? 'bg-highlight-bg' : 'bg-card shadow-[var(--tv-shadow-card)]'),
        !compact && (client ? (hero.overdue ? 'border-danger-border' : 'border-warning-border') : 'border-line'),
      )}
      aria-labelledby={compact ? 'next-up-compact' : 'next-up-title'}
      data-tour={tour}
    >
      {compact && <span className={clsx('absolute inset-y-0 left-0 w-1', client ? (hero.overdue ? 'bg-danger' : 'bg-highlight') : hero.side === 'NONE' ? 'bg-success' : 'bg-info')} aria-hidden />}
      <div className={clsx('flex gap-3 sm:gap-4', compact ? 'items-center py-3 pr-3 pl-4 sm:pr-4 sm:pl-5' : 'flex-col p-6 sm:flex-row sm:items-center sm:p-8')}>
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
          <span
            className={clsx(
              'grid shrink-0 place-items-center rounded-xl',
              compact ? 'size-9' : 'size-12',
              client ? (compact ? 'chip-soft' : 'bg-card text-ink') : hero.side === 'NONE' ? 'bg-success-bg text-success-fg' : 'bg-info-bg text-info-fg',
            )}
          >
            <Icon className={compact ? 'size-4' : 'size-6'} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            {!compact && (
              <p className="type-overline inline-flex items-center gap-2 text-ink">
                <span className={clsx('size-2 rounded-full', client ? (hero.overdue ? 'bg-danger' : 'bg-highlight') : hero.side === 'NONE' ? 'bg-success' : 'bg-info')} aria-hidden />
                {t('pux.next.eyebrow')}
              </p>
            )}
            <h2
              id={compact ? 'next-up-compact' : 'next-up-title'}
              className={clsx('break-words text-ink', compact ? 'line-clamp-2 text-sm font-semibold sm:text-base' : 'mt-2 text-xl font-semibold sm:text-2xl')}
            >
              {lead}
              {hero.title && (
                <>
                  <span className="font-semibold text-muted">: </span>
                  <span className="font-semibold">{hero.title}</span>
                </>
              )}
            </h2>
            {!compact && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                {client && hero.overdue && (
                  <span className="badge bg-danger-bg text-danger-fg">
                    <AlertTriangle className="size-3.5" aria-hidden /> {t('pux.next.overdue')}
                  </span>
                )}
                {!client && <span>{t('pux.next.nothing')}</span>}
                {more > 0 && <span>{t('pux.next.also', { count: more })}</span>}
              </div>
            )}
          </div>
        </div>
        {client ? (
          <Link
            to={hero.to}
            title={compact ? hero.action : undefined}
            // Phones, sticky bar: an arrow button so the sentence keeps the width (the label stays for screen readers).
            className={buttonClass({ size: compact ? 'sm' : 'lg', className: clsx('shrink-0', compact ? 'min-h-10 max-sm:size-10 max-sm:px-0' : 'w-full sm:w-auto') })}
          >
            <span className={clsx(compact && 'max-sm:sr-only')}>{hero.action}</span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          caseLink &&
          !compact && (
            <Link to={caseLink} className={buttonClass({ variant: 'secondary', size: 'lg', className: 'w-full shrink-0 sm:w-auto' })}>
              {t('pux.next.open')}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )
        )}
      </div>
    </section>
  );
}

/**
 * Sticky wrapper that sits just under the site header and moves up when the header hides on scroll
 * (same rule as components/layout/Header: hidden after 500 px while scrolling down).
 */
export function StickyBelowHeader({ children }: { children: ReactNode }) {
  const { scrollY } = useScroll();
  const [headerHidden, setHeaderHidden] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setHeaderHidden(y > 500 && y > prev);
  });
  return (
    <div className={clsx('sticky z-30 transition-[top] duration-300 motion-reduce:transition-none', headerHidden ? 'top-2' : 'top-[4.5rem] sm:top-[5rem]')}>{children}</div>
  );
}
