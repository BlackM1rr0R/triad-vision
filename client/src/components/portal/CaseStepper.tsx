import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Ban, Check, X } from 'lucide-react';
import { STATUS_STEP, STEP_KEYS } from '@/lib/caseStatus';
import type { CaseStatus } from '@/lib/types';

export type StepState = 'done' | 'current' | 'failed' | 'idle';

const EASE = [0.22, 1, 0.36, 1] as const;

/** State of each of the 6 workflow steps for a given case status. */
export const stepStates = (status: CaseStatus): StepState[] => {
  const current = STATUS_STEP[status];
  return STEP_KEYS.map((_, i) => {
    if (status === 'CANCELLED') return 'idle';
    if (status === 'REJECTED' && i === STEP_KEYS.length - 1) return 'failed';
    if (status === 'APPROVED') return 'done';
    if (i < current) return 'done';
    if (i === current) return 'current';
    return 'idle';
  });
};

/**
 * Visual 6-step progress of a visa case.
 * `variant="full"`: big animated stepper (horizontal from md, vertical on mobile).
 * `variant="mini"`: compact segmented bar for lists.
 */
export const CaseStepper = ({
  status,
  variant = 'full',
  className,
}: {
  status: CaseStatus;
  variant?: 'full' | 'mini';
  className?: string;
}) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const states = stepStates(status);

  if (variant === 'mini') {
    const reached = states.filter((s) => s !== 'idle').length;
    return (
      <div
        className={clsx('flex gap-1', className)}
        role="img"
        aria-label={`${t('portal.currentStep')}: ${t(`portal.status.${status}`)} (${reached}/${STEP_KEYS.length})`}
      >
        {states.map((s, i) => (
          <span key={STEP_KEYS[i]} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <motion.span
              className={clsx(
                'absolute inset-0 origin-left rounded-full',
                s === 'done' && (status === 'APPROVED' ? 'bg-success' : 'bg-brand-600'),
                s === 'current' && 'bg-brand-400',
                s === 'failed' && 'bg-danger',
              )}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: s === 'idle' ? 0 : 1 }}
              transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : i * 0.07, ease: EASE }}
            />
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {status === 'CANCELLED' && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">
          <Ban className="size-5 shrink-0" aria-hidden />
          {t('portal.status.CANCELLED')}
        </div>
      )}
      <ol className={clsx('flex flex-col md:flex-row', status === 'CANCELLED' && 'opacity-50 grayscale')}>
        {STEP_KEYS.map((key, i) => {
          const s = states[i];
          const last = i === STEP_KEYS.length - 1;
          const filled = s === 'done' && !last && states[i + 1] !== 'idle';
          const approved = status === 'APPROVED';
          return (
            <li
              key={key}
              className="relative flex gap-4 pb-7 last:pb-0 md:flex-1 md:flex-col md:items-center md:gap-3 md:pb-0 md:text-center"
              aria-current={s === 'current' ? 'step' : undefined}
            >
              {!last && (
                <span
                  className="absolute top-12 bottom-1 left-[1.32rem] w-0.5 rounded-full bg-line md:top-[1.32rem] md:right-[calc(-50%+1.75rem)] md:bottom-auto md:left-[calc(50%+1.75rem)] md:h-0.5 md:w-auto"
                  aria-hidden
                >
                  <motion.span
                    className={clsx('absolute inset-0 rounded-full', approved ? 'bg-success' : 'bg-brand-600')}
                    initial={{ clipPath: 'inset(0 100% 100% 0)' }}
                    animate={{ clipPath: filled ? 'inset(0 0% 0% 0)' : 'inset(0 100% 100% 0)' }}
                    transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.15 + i * 0.12, ease: EASE }}
                  />
                </span>
              )}
              <motion.span
                className={clsx(
                  'relative z-10 grid size-11 shrink-0 place-items-center rounded-full border-2 font-display text-sm font-bold transition-colors',
                  s === 'done' && (approved ? 'border-success bg-success text-white' : 'border-brand-600 bg-brand-600 text-white'),
                  s === 'current' && 'border-brand-600 bg-white text-brand-600 shadow-lg shadow-brand-600/30',
                  s === 'failed' && 'border-danger bg-danger text-white',
                  s === 'idle' && 'border-line bg-white text-muted',
                )}
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.12, ease: EASE }}
              >
                {s === 'current' && !reduce && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-brand-500"
                    animate={{ scale: [1, 1.7], opacity: [0.45, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                    aria-hidden
                  />
                )}
                {s === 'done' ? (
                  <Check className="size-5" strokeWidth={3} aria-hidden />
                ) : s === 'failed' ? (
                  <X className="size-5" strokeWidth={3} aria-hidden />
                ) : (
                  <span className="relative">{i + 1}</span>
                )}
              </motion.span>
              <span className="min-w-0 pt-2.5 md:px-1 md:pt-0">
                <span
                  className={clsx(
                    'block text-sm font-semibold',
                    s === 'idle' ? 'text-muted' : s === 'failed' ? 'text-danger' : 'text-navy-900',
                  )}
                >
                  {t(`portal.steps.${key}`)}
                </span>
                {(s === 'current' || s === 'failed' || (last && approved)) && (
                  <span className={clsx('mt-0.5 block text-xs', s === 'failed' ? 'text-danger/80' : approved ? 'text-success' : 'text-brand-600')}>
                    {t(`portal.status.${status}`)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default CaseStepper;
