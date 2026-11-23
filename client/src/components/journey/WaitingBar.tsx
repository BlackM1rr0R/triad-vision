import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { m as motion, useReducedMotion } from 'framer-motion';
import { Hourglass } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesVisualPlus } from '@/i18n/pagesVisualPlus';
import type { Forecast } from './types';
import { isWaitingStep, waitProgress } from './waiting';

registerCopy(pagesVisualPlus);

/**
 * "The embassy decision usually takes 4–8 weeks; you are in week 3": the usual range of the current waiting step of the
 * forecast (real: history of similar cases / default / team range) against the days since the case entered it.
 * Renders nothing for other steps or without a range and a start day. Estimate, labelled as such.
 */
export const WaitingBar = ({ forecast, className }: { forecast: Forecast; className?: string }) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const step = forecast.steps.find((s) => s.status === 'current');
  if (!step || forecast.status === 'CANCELLED' || !isWaitingStep(step.key)) return null;
  const p = waitProgress(step.minDays, step.maxDays, step.enteredAt ?? forecast.currentSince);
  if (!p) return null;

  const range = p.min === p.max ? String(p.max) : `${p.min}–${p.max}`;
  const unit = t(p.unit === 'week' ? 'vizp.wait.weeks' : 'vizp.wait.days', { count: p.max });
  const elapsed = t(p.unit === 'week' ? 'vizp.wait.weeksCount' : 'vizp.wait.daysCount', { count: p.elapsed });
  const stepName = t(`vizp.wait.step.${step.key}`);
  const over = p.state === 'over';

  return (
    <div className={clsx('mt-5 rounded-xl bg-sunken p-4', className)} data-testid="waiting-bar">
      <p className="flex items-start gap-2 text-sm font-semibold text-ink">
        <Hourglass className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>{t('vizp.wait.line', { step: stepName, range, unit })}</span>
      </p>
      <div
        role="img"
        aria-label={t('vizp.wait.aria', { elapsed, range, unit })}
        className="relative mt-3 h-3 overflow-hidden rounded-full bg-line"
      >
        {/* the usual window */}
        <span aria-hidden className="absolute inset-y-0 right-0 bg-primary/25" style={{ left: `${p.windowStart}%` }} />
        <motion.span
          aria-hidden
          className={clsx('absolute inset-y-0 left-0 rounded-full', over ? 'bg-warning' : 'bg-primary')}
          initial={{ width: reduce ? `${p.percent}%` : 0 }}
          animate={{ width: `${p.percent}%` }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-ink">{t('vizp.wait.elapsed', { elapsed })}</span>
        <span className={over ? 'text-warning-fg' : 'text-muted'}>{t(`vizp.wait.state.${p.state}`)}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{t('vizp.wait.note')}</p>
    </div>
  );
};
