import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { scoreBg, scoreTone, useJobLabels } from './labels';
import type { Match } from './types';

/** Circular match score (0–100) — pure SVG, no animation cost while scrolling. */
export const ScoreRing = ({ score, size = 64, className }: { score: number; size?: number; className?: string }) => {
  const stroke = Math.max(4, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 80 ? 'var(--color-success)' : score >= 55 ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <span className={clsx('relative inline-grid shrink-0 place-items-center', className)} style={{ width: size, height: size }} role="img" aria-label={`${score}%`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-line" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className={clsx('absolute font-display font-semibold tabular-nums', scoreTone(score), size >= 60 ? 'text-base' : 'text-[11px]')}>{score}%</span>
    </span>
  );
};

/** Compact score pill for tables. */
export const ScorePill = ({ score }: { score: number | null | undefined }) =>
  score == null ? (
    <span className="text-xs text-muted">—</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums">
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className={clsx('absolute inset-y-0 left-0 rounded-full', scoreBg(score))} style={{ width: `${score}%` }} />
      </span>
      <span className={scoreTone(score)}>{score}%</span>
    </span>
  );

/** What the candidate is missing for a vacancy ("needs German B1"). */
export const GapList = ({ match, className }: { match: Match; className?: string }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  if (!match.gaps.length) {
    return (
      <p className={clsx('flex items-center gap-2 text-sm font-medium text-success-fg', className)}>
        <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {t('jobsArea.common.noGaps')}
      </p>
    );
  }
  return (
    <ul className={clsx('space-y-1.5', className)}>
      {match.gaps.map((g) => (
        <li key={g.code} className="flex items-start gap-2 text-sm text-ink">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {L.gap(g)}
        </li>
      ))}
    </ul>
  );
};
