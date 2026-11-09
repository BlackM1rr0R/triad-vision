import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import './parts';

/** Status tone of a 0–100 health score: < 35 critical, < 60 warning, else good. */
export const healthTone = (score: number) => (score < 35 ? 'danger' : score < 60 ? 'warning' : 'success');

const FILL = { danger: 'bg-danger', warning: 'bg-warning', success: 'bg-success' } as const;
const TEXT = { danger: 'text-danger-fg', warning: 'text-warning-fg', success: 'text-success-fg' } as const;

/**
 * Health score as number + thin meter. The number always shows (the colour is never the only cue); the meter
 * track is the sunken surface, the fill the status tone.
 */
export const HealthBar = ({ score, className, width = 'w-16' }: { score: number; className?: string; width?: string }) => {
  const { t } = useTranslation();
  const tone = healthTone(score);
  return (
    <span className={clsx('inline-flex items-center gap-2', className)} role="img" aria-label={t('viz.health', { value: score })}>
      <span className={clsx('w-6 text-right text-xs font-semibold tabular-nums', TEXT[tone])} aria-hidden>
        {score}
      </span>
      <span className={clsx('h-1.5 overflow-hidden rounded-full bg-sunken', width)} aria-hidden>
        <span className={clsx('block h-full rounded-full', FILL[tone])} style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
      </span>
    </span>
  );
};
