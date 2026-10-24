import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPlacement } from '@/i18n/pagesPlacement';
import { scoreBg, useJobLabels } from '@/components/jobs/labels';
import type { Match, MatchCriterion } from '@/components/jobs/types';
import { MATCH_WEIGHTS } from './api';

registerCopy(pagesPlacement);

const CRITERIA = Object.keys(MATCH_WEIGHTS) as MatchCriterion[];

/** Points per criterion as small bars (out of each weight). */
export const MatchBars = ({ match, className }: { match: Match; className?: string }) => {
  const { t } = useTranslation();
  if (!match.parts) return null;
  return (
    <dl className={clsx('grid gap-x-4 gap-y-1.5 sm:grid-cols-2', className)} aria-label={t('placement.breakdown.title')}>
      {CRITERIA.map((k) => {
        const max = MATCH_WEIGHTS[k];
        const n = match.parts![k] ?? 0;
        const pct = Math.round((n / max) * 100);
        return (
          <div key={k} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <dt className="truncate text-muted">{t(`placement.breakdown.criteria.${k}`)}</dt>
              <dd className="font-semibold text-navy-900 tabular-nums">{t('placement.breakdown.points', { n, max })}</dd>
            </div>
            <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className={clsx('block h-full rounded-full', scoreBg(pct))} style={{ width: `${pct}%` }} />
            </span>
          </div>
        );
      })}
    </dl>
  );
};

/**
 * Gaps line plus a toggle that opens the score breakdown (used in the ranked lists of the vacancy view).
 * Without `parts` (older API responses) only the gaps are shown.
 */
export const MatchBreakdown = ({ match, className, defaultOpen = false }: { match: Match; className?: string; defaultOpen?: boolean }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {match.gaps.length > 0 && <p className="text-[11px] text-amber-800">{match.gaps.map((g) => L.gap(g)).join(' · ')}</p>}
        {match.parts && (
          <button type="button" className="inline-flex min-h-7 items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <ChevronDown className={clsx('size-3 transition-transform', open && 'rotate-180')} aria-hidden /> {open ? t('placement.breakdown.hide') : t('placement.breakdown.show')}
          </button>
        )}
      </div>
      {open && <MatchBars match={match} className="mt-2 rounded-lg border border-line bg-surface/50 p-3" />}
    </div>
  );
};
